import type {
  CycleSnapshot,
  ByteAddress,
  ByteMemory,
  Instruction,
  Int32,
  MemoryDiff,
  PipelineEvent,
  RegisterDiff,
  RegisterFile,
  RegisterIndex,
  SimulationState,
  StageName,
  StageSlot,
  StageSlots,
  TimelineCell,
  SimulationInitialState,
} from "./types";
import { destinationRegister, sourceRegisters } from "./instructionMetadata";
import { toByteAddress, toByteValue, toInt32, toRegisterIndex, toSigned12Immediate, toUint32 } from "./numbers";

const STAGES: StageName[] = ["IF", "ID", "EX", "MEM", "WB"];
const INSTRUCTION_SIZE_BYTES = 4;

export function createSimulation(program: Instruction[], initialState: SimulationInitialState = {}): SimulationState {
  const registers: RegisterFile = Array.from({ length: 32 }, () => toInt32(0));
  for (const [register, value] of Object.entries(initialState.registers ?? {})) {
    const index = Number(register);
    if (Number.isInteger(index) && index > 0 && index < 32) {
      registers[index] = toInt32(value);
    }
  }
  registers[0] = toInt32(0);

  const current: CycleSnapshot = {
    cycle: 0,
    pc: toByteAddress(0),
    stages: emptyStages(),
    registers,
    memory: normalizeInitialMemory(initialState.memory ?? {}),
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
      message: `${slots.EX.instruction.text} redirects fetch to byte address ${exOutput?.nextPc ?? 0}.`,
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
    IF: stall ? slots.IF : null,
  };

  let pc = previous.pc;
  if (flush) {
    pc = exOutput?.nextPc ?? previous.pc;
  } else if (!stall && !memOutput?.halted) {
    const fetched = fetchInstruction(state.program, previous.pc);
    nextStages.IF = fetched;
    pc = fetched && !fetched.halted ? toByteAddress(previous.pc + INSTRUCTION_SIZE_BYTES) : previous.pc;
  }

  if (registers[0] !== 0) registers[0] = toInt32(0);
  const timeline = buildTimeline(cycle, nextStages, events);
  const halted =
    Boolean(exOutput?.halted || memOutput?.halted || nextStages.IF?.halted) ||
    ((pc < 0 || pc >= state.program.length * INSTRUCTION_SIZE_BYTES) &&
      STAGES.every((stage) => nextStages[stage] === null));
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
  return Object.fromEntries(STAGES.map((stage) => [stage, stages[stage] ? { ...stages[stage]! } : null])) as StageSlots;
}

function fetchInstruction(program: Instruction[], pc: ByteAddress): StageSlot | null {
  if (pc % INSTRUCTION_SIZE_BYTES !== 0) {
    return {
      instructionId: -1,
      pc,
      instruction: {
        id: -1,
        op: "addi",
        rd: toRegisterIndex(0),
        rs1: toRegisterIndex(0),
        imm: toSigned12Immediate(0),
        source: { line: 0, text: "" },
        text: `misaligned fetch at ${pc}`,
      },
      halted: true,
    };
  }
  const instruction = program[pc / INSTRUCTION_SIZE_BYTES];
  if (!instruction) return null;
  return { instructionId: instruction.id, pc, instruction };
}

function commitWriteback(
  cycle: number,
  slot: StageSlot | null,
  registers: RegisterFile,
  diffs: RegisterDiff[],
  events: PipelineEvent[],
) {
  if (!slot) return;
  const rd = destinationRegister(slot.instruction);
  if (rd == null || rd === 0) return;
  const value = writebackValue(slot);
  if (value == null) return;
  const before = registers[rd] ?? toInt32(0);
  const after = toInt32(value);
  registers[rd] = after;
  diffs.push({ register: rd, before, after });
  events.push({
    id: eventId(cycle, "commit", slot.instructionId),
    cycle,
    instructionId: slot.instructionId,
    kind: "commit",
    label: "commit",
    message: `${slot.instruction.text} writes x${rd}: ${before} -> ${after}.`,
    detail: { register: `x${rd}`, before, after },
  });
}

function runMemory(
  cycle: number,
  slot: StageSlot | null,
  memory: ByteMemory,
  diffs: MemoryDiff[],
  events: PipelineEvent[],
): Partial<StageSlot> | null {
  if (!slot) return null;
  if (slot.instruction.op === "lw") {
    const address = slot.address ?? toByteAddress(0);
    if (!isAlignedWordAddress(address)) {
      events.push(errorEvent(cycle, slot, `${slot.instruction.text} cannot load misaligned word address ${address}.`));
      return { halted: true };
    }
    const loadedValue = readWord(memory, address);
    events.push({
      id: eventId(cycle, "memory", slot.instructionId),
      cycle,
      instructionId: slot.instructionId,
      kind: "memory",
      label: "load",
      message: `${slot.instruction.text} reads word at byte address ${address} = ${loadedValue}.`,
      detail: { address, value: loadedValue },
    });
    return { loadedValue };
  }
  if (slot.instruction.op === "sw") {
    const address = slot.address ?? toByteAddress(0);
    if (!isAlignedWordAddress(address)) {
      events.push(errorEvent(cycle, slot, `${slot.instruction.text} cannot store misaligned word address ${address}.`));
      return { halted: true };
    }
    const value = toUint32(slot.storeValue ?? 0);
    const bytes = [toByteValue(value), toByteValue(value >>> 8), toByteValue(value >>> 16), toByteValue(value >>> 24)];
    bytes.forEach((after, offset) => {
      const byteAddress = toByteAddress(address + offset);
      const before = memory[byteAddress] ?? toByteValue(0);
      memory[byteAddress] = after;
      diffs.push({ address: byteAddress, before, after });
    });
    events.push({
      id: eventId(cycle, "memory", slot.instructionId),
      cycle,
      instructionId: slot.instructionId,
      kind: "memory",
      label: "store",
      message: `${slot.instruction.text} writes word at byte address ${address}.`,
      detail: { address, value },
    });
  }
  return {};
}

function runExecute(
  cycle: number,
  slot: StageSlot | null,
  registers: RegisterFile,
  memOutput: Partial<StageSlot> | null,
  wbOutput: Int32 | null,
  events: PipelineEvent[],
): Partial<StageSlot> | null {
  if (!slot) return null;
  const read = (register: RegisterIndex) => readRegister(cycle, slot, register, registers, memOutput, wbOutput, events);

  switch (slot.instruction.op) {
    case "add": {
      const a = read(slot.instruction.rs1);
      const b = read(slot.instruction.rs2);
      return { result: toInt32(a + b) };
    }
    case "sub": {
      const a = read(slot.instruction.rs1);
      const b = read(slot.instruction.rs2);
      return { result: toInt32(a - b) };
    }
    case "and": {
      const a = read(slot.instruction.rs1);
      const b = read(slot.instruction.rs2);
      return { result: toInt32(a & b) };
    }
    case "or": {
      const a = read(slot.instruction.rs1);
      const b = read(slot.instruction.rs2);
      return { result: toInt32(a | b) };
    }
    case "xor": {
      const a = read(slot.instruction.rs1);
      const b = read(slot.instruction.rs2);
      return { result: toInt32(a ^ b) };
    }
    case "sll": {
      const a = read(slot.instruction.rs1);
      const b = read(slot.instruction.rs2);
      return { result: toInt32(a << (b & 31)) };
    }
    case "srl": {
      const a = read(slot.instruction.rs1);
      const b = read(slot.instruction.rs2);
      return { result: toInt32(a >>> (b & 31)) };
    }
    case "addi": {
      const a = read(slot.instruction.rs1);
      return { result: toInt32(a + slot.instruction.imm) };
    }
    case "lw": {
      const a = read(slot.instruction.rs1);
      return { address: toByteAddress(toInt32(a + slot.instruction.imm)) };
    }
    case "sw": {
      const a = read(slot.instruction.rs1);
      const b = read(slot.instruction.rs2);
      return { address: toByteAddress(toInt32(a + slot.instruction.imm)), storeValue: b };
    }
    case "beq": {
      const a = read(slot.instruction.rs1);
      const b = read(slot.instruction.rs2);
      return {
        taken: a === b,
        nextPc: a === b ? slot.instruction.target : toByteAddress(slot.pc + INSTRUCTION_SIZE_BYTES),
      };
    }
    case "bne": {
      const a = read(slot.instruction.rs1);
      const b = read(slot.instruction.rs2);
      return {
        taken: a !== b,
        nextPc: a !== b ? slot.instruction.target : toByteAddress(slot.pc + INSTRUCTION_SIZE_BYTES),
      };
    }
    case "blt": {
      const a = read(slot.instruction.rs1);
      const b = read(slot.instruction.rs2);
      return {
        taken: toInt32(a) < toInt32(b),
        nextPc: toInt32(a) < toInt32(b) ? slot.instruction.target : toByteAddress(slot.pc + INSTRUCTION_SIZE_BYTES),
      };
    }
    case "jal":
      return { result: toInt32(slot.pc + INSTRUCTION_SIZE_BYTES), taken: true, nextPc: slot.instruction.target };
    case "jalr": {
      const a = read(slot.instruction.rs1);
      const nextPc = toByteAddress(toInt32(a + slot.instruction.imm) & ~1);
      if (!isAlignedInstructionAddress(nextPc)) {
        events.push(
          errorEvent(cycle, slot, `${slot.instruction.text} cannot jump to misaligned byte address ${nextPc}.`),
        );
        return { halted: true };
      }
      return { result: toInt32(slot.pc + INSTRUCTION_SIZE_BYTES), taken: true, nextPc };
    }
    case "lui":
      return { result: toInt32(slot.instruction.imm << 12) };
    case "auipc":
      return { result: toInt32(slot.pc + (slot.instruction.imm << 12)) };
  }
}

function readRegister(
  cycle: number,
  consumer: StageSlot,
  register: RegisterIndex,
  registers: RegisterFile,
  memOutput: Partial<StageSlot> | null,
  wbOutput: Int32 | null,
  events: PipelineEvent[],
): Int32 {
  if (register === 0) return toInt32(0);
  const memSlot = consumerStagePeer(consumer, "MEM");
  if (destinationRegister(memSlot?.instruction) === register) {
    const value = memOutput?.loadedValue ?? memSlot?.result;
    if (value != null) {
      events.push(forwardEvent(cycle, consumer, register, "MEM", value));
      return value;
    }
  }
  const wbSlot = consumerStagePeer(consumer, "WB");
  if (destinationRegister(wbSlot?.instruction) === register && wbOutput != null) {
    events.push(forwardEvent(cycle, consumer, register, "WB", wbOutput));
    return wbOutput;
  }
  return registers[register] ?? toInt32(0);
}

let peerStages: StageSlots = emptyStages();

function consumerStagePeer(_consumer: StageSlot, stage: StageName): StageSlot | null {
  return peerStages[stage];
}

function shouldStallForLoadUse(id: StageSlot | null, ex: StageSlot | null): boolean {
  if (!id || !ex || ex.instruction.op !== "lw") return false;
  return sourceRegisters(id.instruction).includes(ex.instruction.rd);
}

function writebackValue(slot: StageSlot | null): Int32 | null {
  if (!slot) return null;
  if (slot.instruction.op === "lw") return slot.loadedValue ?? null;
  if (slot.instruction.op === "jal" || slot.instruction.op === "jalr") {
    return slot.result ?? toInt32(slot.pc + INSTRUCTION_SIZE_BYTES);
  }
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
  register: RegisterIndex,
  from: StageName,
  value: Int32,
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

function normalizeInitialMemory(memory: Record<number, number>): ByteMemory {
  const normalized: ByteMemory = {};
  for (const [address, value] of Object.entries(memory)) {
    const byteAddress = Number(address);
    if (Number.isInteger(byteAddress)) {
      normalized[toByteAddress(byteAddress)] = toByteValue(value);
    }
  }
  return normalized;
}

function readWord(memory: ByteMemory, address: ByteAddress): Int32 {
  const value =
    ((memory[address] ?? 0) & 0xff) |
    (((memory[address + 1] ?? 0) & 0xff) << 8) |
    (((memory[address + 2] ?? 0) & 0xff) << 16) |
    (((memory[address + 3] ?? 0) & 0xff) << 24);
  return toInt32(value);
}

function isAlignedWordAddress(address: ByteAddress): boolean {
  return address % 4 === 0;
}

function isAlignedInstructionAddress(address: ByteAddress): boolean {
  return address % INSTRUCTION_SIZE_BYTES === 0;
}

function errorEvent(cycle: number, slot: StageSlot, message: string): PipelineEvent {
  return {
    id: eventId(cycle, "error", slot.instructionId),
    cycle,
    instructionId: slot.instructionId,
    kind: "error",
    label: "error",
    message,
    detail: { pc: slot.pc },
  };
}
