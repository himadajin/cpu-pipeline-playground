import type {
  CycleSnapshot,
  Instruction,
  MemoryDiff,
  PipelineEvent,
  RegisterDiff,
  SimulationState,
  StageName,
  StageSlot,
  StageSlots,
  TimelineCell,
} from "./types";

const STAGES: StageName[] = ["IF", "ID", "EX", "MEM", "WB"];

export function createSimulation(program: Instruction[]): SimulationState {
  const current: CycleSnapshot = {
    cycle: 0,
    pc: 0,
    stages: emptyStages(),
    registers: Array.from({ length: 32 }, () => 0),
    memory: {},
    events: [],
    registerDiffs: [],
    memoryDiffs: [],
    timeline: [],
    halted: program.length === 0,
  };
  return { program, history: [current], current };
}

export function stepBackSimulation(state: SimulationState): SimulationState {
  if (state.history.length <= 1) return state;
  const history = state.history.slice(0, -1);
  return { ...state, history, current: history[history.length - 1] };
}

export function runSimulation(state: SimulationState, maxCycles = 300): SimulationState {
  let next = state;
  while (!next.current.halted && next.current.cycle < maxCycles) {
    next = stepSimulation(next);
  }
  return next;
}

export function stepSimulation(state: SimulationState): SimulationState {
  if (state.current.halted) return state;

  const previous = state.current;
  const cycle = previous.cycle + 1;
  const registers = previous.registers.slice();
  const memory = { ...previous.memory };
  const events: PipelineEvent[] = [];
  const registerDiffs: RegisterDiff[] = [];
  const memoryDiffs: MemoryDiff[] = [];
  const slots = cloneStages(previous.stages);

  commitWriteback(cycle, slots.WB, registers, registerDiffs, events);
  const memOutput = runMemory(cycle, slots.MEM, memory, memoryDiffs, events);
  const wbOutput = writebackValue(slots.WB);
  peerStages = slots;
  const exOutput = runExecute(cycle, slots.EX, registers, memOutput, wbOutput, events);

  const stall = shouldStallForLoadUse(slots.ID, slots.EX);
  if (stall && slots.ID) {
    events.push({
      id: eventId(cycle, "stall", slots.ID.instructionId),
      cycle,
      instructionId: slots.ID.instructionId,
      kind: "stall",
      label: "stall",
      message: `${slots.ID.instruction.text} waits because ${slots.EX?.instruction.text} is loading a source register.`,
    });
  }

  const flush = Boolean(exOutput?.taken);
  if (flush && slots.EX) {
    events.push({
      id: eventId(cycle, "branch", slots.EX.instructionId),
      cycle,
      instructionId: slots.EX.instructionId,
      kind: "branch",
      label: "branch",
      message: `${slots.EX.instruction.text} redirects fetch to instruction ${exOutput?.nextPc ?? 0}.`,
      detail: { target: exOutput?.nextPc ?? 0 },
    });
    for (const flushed of [slots.IF, slots.ID]) {
      if (flushed) {
        events.push({
          id: eventId(cycle, "flush", flushed.instructionId),
          cycle,
          instructionId: flushed.instructionId,
          kind: "flush",
          label: "flush",
          message: `${flushed.instruction.text} is flushed by the taken branch.`,
        });
      }
    }
  }

  const nextStages: StageSlots = {
    WB: memOutput ? { ...slots.MEM!, ...memOutput } : slots.MEM,
    MEM: exOutput ? { ...slots.EX!, ...exOutput } : slots.EX,
    EX: flush || stall ? null : slots.ID,
    ID: flush ? null : stall ? slots.ID : slots.IF,
    IF: null,
  };

  let pc = previous.pc;
  if (flush) {
    pc = exOutput?.nextPc ?? previous.pc;
  } else if (!stall) {
    const fetched = fetchInstruction(state.program, previous.pc);
    nextStages.IF = fetched;
    pc = fetched ? previous.pc + 1 : previous.pc;
  }

  if (registers[0] !== 0) registers[0] = 0;
  const timeline = buildTimeline(cycle, nextStages, events);
  const halted = pc >= state.program.length && STAGES.every((stage) => nextStages[stage] === null);
  const current: CycleSnapshot = {
    cycle,
    pc,
    stages: nextStages,
    registers,
    memory,
    events,
    registerDiffs,
    memoryDiffs,
    timeline,
    halted,
  };

  return { ...state, history: [...state.history, current], current };
}

function emptyStages(): StageSlots {
  return { IF: null, ID: null, EX: null, MEM: null, WB: null };
}

function cloneStages(stages: StageSlots): StageSlots {
  return Object.fromEntries(
    STAGES.map((stage) => [stage, stages[stage] ? { ...stages[stage]! } : null]),
  ) as StageSlots;
}

function fetchInstruction(program: Instruction[], pc: number): StageSlot | null {
  const instruction = program[pc];
  if (!instruction) return null;
  return { instructionId: instruction.id, pc, instruction };
}

function commitWriteback(
  cycle: number,
  slot: StageSlot | null,
  registers: number[],
  diffs: RegisterDiff[],
  events: PipelineEvent[],
) {
  if (!slot || slot.instruction.rd == null || slot.instruction.rd === 0) return;
  const value = writebackValue(slot);
  if (value == null) return;
  const before = registers[slot.instruction.rd] ?? 0;
  registers[slot.instruction.rd] = value;
  diffs.push({ register: slot.instruction.rd, before, after: value });
  events.push({
    id: eventId(cycle, "commit", slot.instructionId),
    cycle,
    instructionId: slot.instructionId,
    kind: "commit",
    label: "commit",
    message: `${slot.instruction.text} writes x${slot.instruction.rd}: ${before} -> ${value}.`,
    detail: { register: `x${slot.instruction.rd}`, before, after: value },
  });
}

function runMemory(
  cycle: number,
  slot: StageSlot | null,
  memory: Record<number, number>,
  diffs: MemoryDiff[],
  events: PipelineEvent[],
): Partial<StageSlot> | null {
  if (!slot) return null;
  if (slot.instruction.op === "lw") {
    const address = slot.address ?? 0;
    const loadedValue = memory[address] ?? 0;
    events.push({
      id: eventId(cycle, "memory", slot.instructionId),
      cycle,
      instructionId: slot.instructionId,
      kind: "memory",
      label: "load",
      message: `${slot.instruction.text} reads memory[${address}] = ${loadedValue}.`,
      detail: { address, value: loadedValue },
    });
    return { loadedValue };
  }
  if (slot.instruction.op === "sw") {
    const address = slot.address ?? 0;
    const before = memory[address] ?? 0;
    const after = slot.storeValue ?? 0;
    memory[address] = after;
    diffs.push({ address, before, after });
    events.push({
      id: eventId(cycle, "memory", slot.instructionId),
      cycle,
      instructionId: slot.instructionId,
      kind: "memory",
      label: "store",
      message: `${slot.instruction.text} writes memory[${address}]: ${before} -> ${after}.`,
      detail: { address, before, after },
    });
  }
  return {};
}

function runExecute(
  cycle: number,
  slot: StageSlot | null,
  registers: number[],
  memOutput: Partial<StageSlot> | null,
  wbOutput: number | null,
  events: PipelineEvent[],
): Partial<StageSlot> | null {
  if (!slot) return null;
  const read = (register?: number) => readRegister(cycle, slot, register, registers, memOutput, wbOutput, events);
  const a = read(slot.instruction.rs1);
  const b = read(slot.instruction.rs2);
  const imm = slot.instruction.imm ?? 0;

  switch (slot.instruction.op) {
    case "add":
      return { result: a + b };
    case "sub":
      return { result: a - b };
    case "and":
      return { result: a & b };
    case "or":
      return { result: a | b };
    case "xor":
      return { result: a ^ b };
    case "sll":
      return { result: a << (b & 31) };
    case "srl":
      return { result: a >>> (b & 31) };
    case "addi":
      return { result: a + imm };
    case "lw":
      return { address: a + imm };
    case "sw":
      return { address: a + imm, storeValue: b };
    case "beq":
      return { taken: a === b, nextPc: a === b ? slot.instruction.target : slot.pc + 1 };
    case "bne":
      return { taken: a !== b, nextPc: a !== b ? slot.instruction.target : slot.pc + 1 };
    case "blt":
      return { taken: a < b, nextPc: a < b ? slot.instruction.target : slot.pc + 1 };
    case "jal":
      return { result: slot.pc + 1, taken: true, nextPc: slot.instruction.target };
    case "nop":
      return {};
  }
}

function readRegister(
  cycle: number,
  consumer: StageSlot,
  register: number | undefined,
  registers: number[],
  memOutput: Partial<StageSlot> | null,
  wbOutput: number | null,
  events: PipelineEvent[],
): number {
  if (register == null || register === 0) return 0;
  const memSlot = consumerStagePeer(consumer, "MEM");
  if (memSlot?.instruction.rd === register) {
    const value = memOutput?.loadedValue ?? memSlot.result;
    if (value != null) {
      events.push(forwardEvent(cycle, consumer, register, "MEM", value));
      return value;
    }
  }
  const wbSlot = consumerStagePeer(consumer, "WB");
  if (wbSlot?.instruction.rd === register && wbOutput != null) {
    events.push(forwardEvent(cycle, consumer, register, "WB", wbOutput));
    return wbOutput;
  }
  return registers[register] ?? 0;
}

let peerStages: StageSlots = emptyStages();

function consumerStagePeer(_consumer: StageSlot, stage: StageName): StageSlot | null {
  return peerStages[stage];
}

function shouldStallForLoadUse(id: StageSlot | null, ex: StageSlot | null): boolean {
  if (!id || !ex || ex.instruction.op !== "lw" || ex.instruction.rd == null) return false;
  return [id.instruction.rs1, id.instruction.rs2].includes(ex.instruction.rd);
}

function writebackValue(slot: StageSlot | null): number | null {
  if (!slot) return null;
  if (slot.instruction.op === "lw") return slot.loadedValue ?? null;
  if (slot.instruction.op === "jal") return slot.result ?? slot.pc + 1;
  return slot.result ?? null;
}

function buildTimeline(cycle: number, stages: StageSlots, events: PipelineEvent[]): TimelineCell[] {
  const cells: TimelineCell[] = [];
  STAGES.forEach((stage) => {
    const slot = stages[stage];
    if (!slot) return;
    cells.push({
      cycle,
      instructionId: slot.instructionId,
      stage,
      events: events.filter((event) => event.instructionId === slot.instructionId),
    });
  });
  for (const event of events) {
    if (event.instructionId == null) continue;
    if (!cells.some((cell) => cell.instructionId === event.instructionId && cell.cycle === cycle)) {
      cells.push({ cycle, instructionId: event.instructionId, stage: "ID", events: [event] });
    }
  }
  return cells;
}

function forwardEvent(
  cycle: number,
  consumer: StageSlot,
  register: number,
  from: StageName,
  value: number,
): PipelineEvent {
  return {
    id: eventId(cycle, `forward-${from}-x${register}`, consumer.instructionId),
    cycle,
    instructionId: consumer.instructionId,
    kind: "forward",
    label: "fwd",
    message: `${consumer.instruction.text} receives x${register}=${value} from ${from}.`,
    detail: { register: `x${register}`, from, value },
  };
}

function eventId(cycle: number, label: string, instructionId?: number): string {
  return `${cycle}:${instructionId ?? "global"}:${label}`;
}
