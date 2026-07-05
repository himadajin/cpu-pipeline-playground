import type {
  CycleSnapshot,
  ByteAddress,
  ByteMemory,
  ByteValue,
  DecodeError,
  ExecutionImage,
  ExecutionImageInstruction,
  ExitRequest,
  Instruction,
  InstructionWord,
  Int32,
  MemoryEffect,
  MemoryDiff,
  PipelineLatches,
  PipelineEvent,
  RegisterDiff,
  RegisterFile,
  RegisterIndex,
  RetireLogEntry,
  SimulationState,
  SimulatorError,
  StageName,
  StageSlot,
  StageSlots,
  TerminalRecord,
  TimelineCell,
  SimulationInitialState,
} from "./types";
import { createExecutionImage } from "./assembler";
import { decodeInstruction } from "./instructionCodec";
import { destinationRegister, sourceRegisters } from "./instructionMetadata";
import {
  RASK_EXIT_DEVICE_ADDRESS,
  RASK_EXIT_REGION_BASE,
  RASK_EXIT_REGION_LIMIT_EXCLUSIVE,
  RASK_RAM_BASE,
  RASK_RAM_LIMIT_EXCLUSIVE,
  RASK_UART_DATA_ADDRESS,
  RASK_UART_REGION_BASE,
  RASK_UART_REGION_LIMIT_EXCLUSIVE,
} from "./types";
import {
  toHex32,
  toByteAddress,
  toByteValue,
  toInstructionWord,
  toInt32,
  toRegisterIndex,
  toSigned12Immediate,
  toUint32,
} from "./numbers";

const STAGES: StageName[] = ["IF", "ID", "EX", "MEM", "WB"];
const INSTRUCTION_SIZE_BYTES = 4;

interface RunSimulationOptions {
  stopOnPause?: boolean;
}

interface RetireOutput {
  terminalRecord?: TerminalRecord;
  paused: boolean;
}

export function createSimulation(
  input: ExecutionImage | Instruction[],
  initialState: SimulationInitialState = {},
): SimulationState {
  const executionImage = Array.isArray(input) ? createExecutionImage(input) : input;
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
    pc: executionImage.baseAddress,
    nextSeqId: 0,
    latches: emptyLatches(),
    ifSlot: null,
    stages: emptyStages(),
    registers,
    memory: normalizeInitialMemory(initialState.memory ?? {}),
    consoleOutput: [],
    events: [],
    retireLog: [],
    registerDiffs: [],
    memoryDiffs: [],
    timeline: [],
    occupancyTable: [],
    paused: false,
    halted: executionImage.instructions.length === 0,
  };
  return {
    executionImage,
    program: executionImage.instructions.map((entry) => instructionFromImageEntry(entry)),
    history: [current],
    current,
  };
}

export function stepBackSimulation(state: SimulationState): SimulationState {
  if (state.history.length <= 1) return state;
  const history = state.history.slice(0, -1);
  return { ...state, history, current: history[history.length - 1] };
}

export function runSimulation(
  state: SimulationState,
  maxCycles = 300,
  options: RunSimulationOptions = {},
): SimulationState {
  let next = state;
  while (!next.current.halted && next.current.cycle < maxCycles) {
    next = stepSimulation(next);
    if (options.stopOnPause && next.current.paused) break;
  }
  return next;
}

export function formatRetireLog(snapshot: CycleSnapshot): string {
  const lines = snapshot.retireLog.map((entry) => {
    const effects: string[] = [];
    if (entry.memoryEffect) {
      effects.push(
        `${entry.memoryEffect.direction} ${entry.memoryEffect.width} [${formatHex32(entry.memoryEffect.address)}]=${formatData(
          entry.memoryEffect.width,
          entry.memoryEffect.value,
        )}`,
      );
    }
    if (entry.register != null && entry.registerValue != null) {
      effects.push(`x${String(entry.register).padStart(2, "0")}=${formatHex32(entry.registerValue)}`);
    }
    return [formatHex32(entry.pc), formatInstructionWord(entry.instructionWord), ...effects].join(" ");
  });

  if (snapshot.terminalRecord?.kind === "exit") {
    lines.push(`EXIT ${snapshot.terminalRecord.code}`);
  } else if (snapshot.terminalRecord?.kind === "error") {
    lines.push(
      `ERROR ${snapshot.terminalRecord.errorKind} ${formatHex32(snapshot.terminalRecord.pc)} ${formatInstructionWord(
        snapshot.terminalRecord.instructionWord,
      )}`,
    );
  }

  return lines.join("\n");
}

export function formatPipelineOccupancyTable(snapshot: CycleSnapshot): string {
  return snapshot.occupancyTable.join("\n");
}

export function stepSimulation(state: SimulationState): SimulationState {
  if (state.current.halted) return state;

  const previous = state.current;
  const cycle = previous.cycle + 1;
  const registers = previous.registers.slice();
  const memory = { ...previous.memory };
  const consoleOutput = previous.consoleOutput.slice();
  const events: PipelineEvent[] = [];
  const retireLog = previous.retireLog.slice();
  const registerDiffs: RegisterDiff[] = [];
  const memoryDiffs: MemoryDiff[] = [];
  const latches = cloneLatches(previous.latches);
  let ifSlot = cloneSlot(previous.ifSlot);

  const retireOutput = retireWriteback(cycle, latches.memWb, registers, registerDiffs, retireLog, events);
  if (retireOutput.terminalRecord) {
    // Exit / error retire: younger in-flight instructions occupied their
    // stages this cycle (cells are kept) but are discarded without effects.
    if (registers[0] !== 0) registers[0] = toInt32(0);
    const stages: StageSlots = {
      IF: ifSlot,
      ID: latches.ifId,
      EX: latches.idEx,
      MEM: latches.exMem,
      WB: latches.memWb,
    };
    const timeline = buildTimeline(cycle, stages, events);
    const occupancyTable = buildOccupancyTable([
      ...state.history.flatMap((snapshot) => snapshot.timeline),
      ...timeline,
    ]);
    const current: CycleSnapshot = {
      cycle,
      pc: previous.pc,
      nextSeqId: previous.nextSeqId,
      latches: emptyLatches(),
      ifSlot: null,
      stages,
      registers,
      memory,
      consoleOutput,
      events,
      retireLog,
      terminalRecord: retireOutput.terminalRecord,
      registerDiffs,
      memoryDiffs,
      timeline,
      occupancyTable,
      paused: retireOutput.paused,
      halted: true,
    };
    return { ...state, history: [...state.history, current], current };
  }

  const memOutput = runMemory(cycle, latches.exMem, memory, consoleOutput, memoryDiffs, events);
  const exOutput = runExecute(cycle, latches.idEx, registers, events);
  const decodeOutput = runDecode(cycle, latches.ifId, events);

  let nextSeqId = previous.nextSeqId;
  if (!ifSlot) {
    ifSlot = fetchInstruction(state.executionImage, previous.pc, nextSeqId);
    if (ifSlot) nextSeqId += 1;
  }

  const redirect = Boolean(exOutput?.taken);
  const stall = !redirect && shouldStallForDataHazard(latches.ifId, [latches.idEx, latches.exMem, latches.memWb]);
  if (stall && latches.ifId) {
    events.push({
      id: eventId(cycle, "stall", latches.ifId.instructionId),
      cycle,
      seqId: latches.ifId.seqId,
      instructionId: latches.ifId.instructionId,
      kind: "stall",
      label: "stall",
      message: `${latches.ifId.instruction.text} waits for an older writer to retire.`,
    });
  }

  if (redirect && latches.idEx) {
    events.push({
      id: eventId(cycle, "branch", latches.idEx.instructionId),
      cycle,
      seqId: latches.idEx.seqId,
      instructionId: latches.idEx.instructionId,
      kind: "branch",
      label: "branch",
      message: `${latches.idEx.instruction.text} redirects fetch to byte address ${exOutput?.nextPc ?? 0}.`,
      detail: { target: exOutput?.nextPc ?? 0 },
    });
    for (const flushed of [ifSlot, latches.ifId]) {
      if (flushed) {
        events.push({
          id: eventId(cycle, "flush", flushed.instructionId),
          cycle,
          seqId: flushed.seqId,
          instructionId: flushed.instructionId,
          kind: "flush",
          label: "flush",
          message: `${flushed.instruction.text} is flushed by the taken branch.`,
          detail: { pc: flushed.pc },
        });
      }
    }
  }

  const stages: StageSlots = {
    IF: ifSlot,
    ID: latches.ifId,
    EX: latches.idEx,
    MEM: latches.exMem,
    WB: latches.memWb,
  };

  const memWbNext = latches.exMem ? { ...latches.exMem, ...memOutput } : null;
  const exMemNext = latches.idEx ? { ...latches.idEx, ...exOutput } : null;

  let pc = previous.pc;
  let nextIfSlot: StageSlot | null;
  let nextLatches: PipelineLatches;
  if (redirect) {
    pc = exOutput?.nextPc ?? previous.pc;
    nextIfSlot = null;
    nextLatches = { ifId: null, idEx: null, exMem: exMemNext, memWb: memWbNext };
  } else if (stall) {
    nextIfSlot = ifSlot;
    nextLatches = { ifId: latches.ifId, idEx: null, exMem: exMemNext, memWb: memWbNext };
  } else {
    // Drain rule: when nothing was fetched, PC stays frozen (spec §4).
    if (ifSlot) pc = toByteAddress(previous.pc + INSTRUCTION_SIZE_BYTES);
    nextIfSlot = null;
    nextLatches = {
      ifId: ifSlot,
      idEx: latches.ifId ? { ...latches.ifId, ...decodeOutput } : null,
      exMem: exMemNext,
      memWb: memWbNext,
    };
  }

  if (registers[0] !== 0) registers[0] = toInt32(0);
  const timeline = buildTimeline(cycle, stages, events);
  const occupancyTable = buildOccupancyTable([...state.history.flatMap((snapshot) => snapshot.timeline), ...timeline]);
  const halted =
    nextIfSlot === null &&
    nextLatches.ifId === null &&
    nextLatches.idEx === null &&
    nextLatches.exMem === null &&
    nextLatches.memWb === null;
  const current: CycleSnapshot = {
    cycle,
    pc,
    nextSeqId,
    latches: nextLatches,
    ifSlot: nextIfSlot,
    stages,
    registers,
    memory,
    consoleOutput,
    events,
    retireLog,
    registerDiffs,
    memoryDiffs,
    timeline,
    occupancyTable,
    paused: retireOutput.paused,
    halted,
  };

  return { ...state, history: [...state.history, current], current };
}

function emptyStages(): StageSlots {
  return { IF: null, ID: null, EX: null, MEM: null, WB: null };
}

function emptyLatches(): PipelineLatches {
  return { ifId: null, idEx: null, exMem: null, memWb: null };
}

function cloneLatches(latches: PipelineLatches): PipelineLatches {
  return {
    ifId: cloneSlot(latches.ifId),
    idEx: cloneSlot(latches.idEx),
    exMem: cloneSlot(latches.exMem),
    memWb: cloneSlot(latches.memWb),
  };
}

function cloneSlot(slot: StageSlot | null): StageSlot | null {
  return slot ? { ...slot } : null;
}

function fetchInstruction(executionImage: ExecutionImage, pc: ByteAddress, seqId: number): StageSlot | null {
  if (pc % INSTRUCTION_SIZE_BYTES !== 0) {
    return {
      seqId,
      instructionId: -1,
      pc,
      instructionWord: null,
      instruction: {
        id: -1,
        op: "addi",
        rd: toRegisterIndex(0),
        rs1: toRegisterIndex(0),
        imm: toSigned12Immediate(0),
        source: { line: 0, text: "" },
        text: `misaligned fetch at ${pc}`,
      },
      error: { kind: "fetch-misaligned", message: `Misaligned fetch at byte address ${pc}.` },
    };
  }
  if (!isRamRange(pc, INSTRUCTION_SIZE_BYTES)) {
    return {
      seqId,
      instructionId: -1,
      pc,
      instructionWord: null,
      instruction: {
        id: -1,
        op: "addi",
        rd: toRegisterIndex(0),
        rs1: toRegisterIndex(0),
        imm: toSigned12Immediate(0),
        source: { line: 0, text: "" },
        text: `unmapped fetch at ${pc}`,
      },
      error: { kind: "fetch-unmapped", message: `Unmapped fetch at byte address ${pc}.` },
    };
  }
  const fetched = executionImage.instructionMemory[pc];
  if (!fetched) return null;
  const decoded = decodeInstruction(fetched.word, pc, fetched.id, fetched.source, fetched.instruction?.text);
  if (decoded.ok) {
    return { seqId, instructionId: fetched.id, pc, instructionWord: fetched.word, instruction: decoded.instruction };
  }
  return {
    seqId,
    instructionId: fetched.id,
    pc,
    instructionWord: fetched.word,
    instruction: invalidInstruction(fetched.id, fetched.source, fetched.instruction?.text ?? decoded.error.message),
    decodeError: decoded.error,
  };
}

function runDecode(_cycle: number, slot: StageSlot | null, _events: PipelineEvent[]): Partial<StageSlot> | null {
  if (!slot?.decodeError) return null;
  return { error: slot.decodeError };
}

function instructionFromImageEntry(entry: ExecutionImageInstruction): Instruction {
  if (entry.instruction) return entry.instruction;
  const decoded = decodeInstruction(entry.word, entry.address, entry.id, entry.source);
  if (decoded.ok) return decoded.instruction;
  return invalidInstruction(entry.id, entry.source, decoded.error.message);
}

function invalidInstruction(id: number, source: { line: number; text: string }, text: string): Instruction {
  return {
    id,
    op: "addi",
    rd: toRegisterIndex(0),
    rs1: toRegisterIndex(0),
    imm: toSigned12Immediate(0),
    source,
    text,
  };
}

function retireWriteback(
  cycle: number,
  slot: StageSlot | null,
  registers: RegisterFile,
  diffs: RegisterDiff[],
  retireLog: RetireLogEntry[],
  events: PipelineEvent[],
): RetireOutput {
  if (!slot) return { paused: false };
  const rd = destinationRegister(slot.instruction);
  const value = slot.error ? null : writebackValue(slot);
  let register: RegisterIndex | undefined;
  let registerValue: Int32 | undefined;

  if (rd != null && rd !== 0 && value != null) {
    const before = registers[rd] ?? toInt32(0);
    const after = toInt32(value);
    registers[rd] = after;
    register = rd;
    registerValue = after;
    diffs.push({ register: rd, before, after });
    events.push({
      id: eventId(cycle, "retire", slot.instructionId),
      cycle,
      seqId: slot.seqId,
      instructionId: slot.instructionId,
      kind: "retire",
      label: "retire",
      message: `${slot.instruction.text} writes x${rd}: ${before} -> ${after}.`,
      detail: { register: `x${rd}`, before, after },
    });
  }

  retireLog.push({
    pc: slot.pc,
    instructionWord: slot.instructionWord,
    instruction: slot.instruction,
    memoryEffect: slot.memoryEffect,
    register,
    registerValue,
  });

  if (slot.error) {
    events.push(errorEvent(cycle, slot, slot.error.message, { errorKind: slot.error.kind }));
    return {
      paused: false,
      terminalRecord: {
        kind: "error",
        errorKind: slot.error.kind,
        pc: slot.pc,
        instructionWord: slot.instructionWord,
      },
    };
  }

  if (slot.exitRequest) {
    return { paused: false, terminalRecord: { kind: "exit", code: slot.exitRequest.code } };
  }

  return { paused: Boolean(slot.isEbreak) };
}

function runMemory(
  cycle: number,
  slot: StageSlot | null,
  memory: ByteMemory,
  consoleOutput: ByteValue[],
  diffs: MemoryDiff[],
  events: PipelineEvent[],
): Partial<StageSlot> | null {
  if (!slot) return null;
  if (slot.error) return {};
  if (slot.instruction.op === "lb" || slot.instruction.op === "lbu") {
    const address = slot.address ?? toByteAddress(0);
    const access = classifyDataAccess(address, 1, "load");
    if (!access.ok) return memoryError(access.kind, access.message);
    if (access.kind !== "ram") {
      return memoryError("mmio-violation", `${slot.instruction.text} cannot load from device byte address ${address}.`);
    }
    const rawValue = (memory[address] ?? 0) & 0xff;
    const loadedValue =
      slot.instruction.op === "lb" ? readSignedByte(memory, address) : readUnsignedByte(memory, address);
    events.push({
      id: eventId(cycle, "memory", slot.instructionId),
      cycle,
      seqId: slot.seqId,
      instructionId: slot.instructionId,
      kind: "memory",
      label: "load",
      message: `${slot.instruction.text} reads byte at byte address ${address} = ${loadedValue}.`,
      detail: { address, value: loadedValue },
    });
    return { loadedValue, memoryEffect: { direction: "load", width: "b", address, value: rawValue } };
  }
  if (slot.instruction.op === "lh" || slot.instruction.op === "lhu") {
    const address = slot.address ?? toByteAddress(0);
    const access = classifyDataAccess(address, 2, "load");
    if (!access.ok) return memoryError(access.kind, access.message);
    if (!isAlignedHalfwordAddress(address)) {
      return memoryError(
        "mem-misaligned",
        `${slot.instruction.text} cannot load misaligned halfword address ${address}.`,
      );
    }
    if (access.kind !== "ram") {
      return memoryError("mmio-violation", `${slot.instruction.text} cannot load from device byte address ${address}.`);
    }
    const rawValue = readUnsignedHalfword(memory, address);
    const loadedValue =
      slot.instruction.op === "lh" ? readSignedHalfword(memory, address) : readUnsignedHalfword(memory, address);
    events.push({
      id: eventId(cycle, "memory", slot.instructionId),
      cycle,
      seqId: slot.seqId,
      instructionId: slot.instructionId,
      kind: "memory",
      label: "load",
      message: `${slot.instruction.text} reads halfword at byte address ${address} = ${loadedValue}.`,
      detail: { address, value: loadedValue },
    });
    return { loadedValue, memoryEffect: { direction: "load", width: "h", address, value: rawValue } };
  }
  if (slot.instruction.op === "lw") {
    const address = slot.address ?? toByteAddress(0);
    const access = classifyDataAccess(address, 4, "load");
    if (!access.ok) return memoryError(access.kind, access.message);
    if (!isAlignedWordAddress(address)) {
      return memoryError("mem-misaligned", `${slot.instruction.text} cannot load misaligned word address ${address}.`);
    }
    if (access.kind !== "ram") {
      return memoryError("mmio-violation", `${slot.instruction.text} cannot load from device byte address ${address}.`);
    }
    const loadedValue = readWord(memory, address);
    events.push({
      id: eventId(cycle, "memory", slot.instructionId),
      cycle,
      seqId: slot.seqId,
      instructionId: slot.instructionId,
      kind: "memory",
      label: "load",
      message: `${slot.instruction.text} reads word at byte address ${address} = ${loadedValue}.`,
      detail: { address, value: loadedValue },
    });
    return { loadedValue, memoryEffect: { direction: "load", width: "w", address, value: toUint32(loadedValue) } };
  }
  if (slot.instruction.op === "sb") {
    const address = slot.address ?? toByteAddress(0);
    const access = classifyDataAccess(address, 1, "store");
    if (!access.ok) return memoryError(access.kind, access.message);
    const after = toByteValue(slot.storeValue ?? 0);
    const memoryEffect: MemoryEffect = { direction: "store", width: "b", address, value: after };
    if (access.kind === "uart") {
      consoleOutput.push(after);
      events.push({
        id: eventId(cycle, "memory", slot.instructionId),
        cycle,
        seqId: slot.seqId,
        instructionId: slot.instructionId,
        kind: "memory",
        label: "uart",
        message: `${slot.instruction.text} writes byte ${after} to UART data register.`,
        detail: { address, value: after },
      });
      return { memoryEffect };
    }
    const before = memory[address] ?? toByteValue(0);
    memory[address] = after;
    diffs.push({ address, before, after });
    events.push({
      id: eventId(cycle, "memory", slot.instructionId),
      cycle,
      seqId: slot.seqId,
      instructionId: slot.instructionId,
      kind: "memory",
      label: "store",
      message: `${slot.instruction.text} writes byte at byte address ${address}.`,
      detail: { address, value: after },
    });
    return { memoryEffect };
  }
  if (slot.instruction.op === "sh") {
    const address = slot.address ?? toByteAddress(0);
    const access = classifyDataAccess(address, 2, "store");
    if (!access.ok) return memoryError(access.kind, access.message);
    if (!isAlignedHalfwordAddress(address)) {
      return memoryError(
        "mem-misaligned",
        `${slot.instruction.text} cannot store misaligned halfword address ${address}.`,
      );
    }
    const value = toUint32(slot.storeValue ?? 0);
    if (access.kind === "uart") {
      return memoryError("mmio-violation", `${slot.instruction.text} cannot store halfword to UART data register.`);
    }
    const memoryEffect: MemoryEffect = { direction: "store", width: "h", address, value: value & 0xffff };
    const bytes = [toByteValue(value), toByteValue(value >>> 8)];
    bytes.forEach((after, offset) => {
      const byteAddress = toByteAddress(address + offset);
      const before = memory[byteAddress] ?? toByteValue(0);
      memory[byteAddress] = after;
      diffs.push({ address: byteAddress, before, after });
    });
    events.push({
      id: eventId(cycle, "memory", slot.instructionId),
      cycle,
      seqId: slot.seqId,
      instructionId: slot.instructionId,
      kind: "memory",
      label: "store",
      message: `${slot.instruction.text} writes halfword at byte address ${address}.`,
      detail: { address, value: value & 0xffff },
    });
    return { memoryEffect };
  }
  if (slot.instruction.op === "sw") {
    const address = slot.address ?? toByteAddress(0);
    const access = classifyDataAccess(address, 4, "store");
    if (!access.ok) return memoryError(access.kind, access.message);
    if (!isAlignedWordAddress(address)) {
      return memoryError("mem-misaligned", `${slot.instruction.text} cannot store misaligned word address ${address}.`);
    }
    const value = toUint32(slot.storeValue ?? 0);
    if (access.kind === "uart") {
      return memoryError("mmio-violation", `${slot.instruction.text} cannot store word to UART data register.`);
    }
    const memoryEffect: MemoryEffect = { direction: "store", width: "w", address, value };
    if (access.kind === "exit") {
      const exitRequest = decodeExitRequest(value);
      if (!exitRequest) {
        return memoryError(
          "mmio-violation",
          `${slot.instruction.text} stores an undefined exit device value ${value}.`,
        );
      }
      events.push(deviceStoreEvent(cycle, slot, "exit", address, value));
      return { exitRequest, memoryEffect };
    }
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
      seqId: slot.seqId,
      instructionId: slot.instructionId,
      kind: "memory",
      label: "store",
      message: `${slot.instruction.text} writes word at byte address ${address}.`,
      detail: { address, value },
    });
    return { memoryEffect };
  }
  return {};
}

function runExecute(
  _cycle: number,
  slot: StageSlot | null,
  registers: RegisterFile,
  _events: PipelineEvent[],
): Partial<StageSlot> | null {
  if (!slot) return null;
  if (slot.error) return {};
  const read = (register: RegisterIndex) => readRegister(register, registers);

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
    case "slt": {
      const a = read(slot.instruction.rs1);
      const b = read(slot.instruction.rs2);
      return { result: toInt32(toInt32(a) < toInt32(b) ? 1 : 0) };
    }
    case "sltu": {
      const a = read(slot.instruction.rs1);
      const b = read(slot.instruction.rs2);
      return { result: toInt32(toUint32(a) < toUint32(b) ? 1 : 0) };
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
    case "sra": {
      const a = read(slot.instruction.rs1);
      const b = read(slot.instruction.rs2);
      return { result: toInt32(a >> (b & 31)) };
    }
    case "addi": {
      const a = read(slot.instruction.rs1);
      return { result: toInt32(a + slot.instruction.imm) };
    }
    case "slti": {
      const a = read(slot.instruction.rs1);
      return { result: toInt32(toInt32(a) < toInt32(slot.instruction.imm) ? 1 : 0) };
    }
    case "sltiu": {
      const a = read(slot.instruction.rs1);
      return { result: toInt32(toUint32(a) < toUint32(slot.instruction.imm) ? 1 : 0) };
    }
    case "andi": {
      const a = read(slot.instruction.rs1);
      return { result: toInt32(a & slot.instruction.imm) };
    }
    case "ori": {
      const a = read(slot.instruction.rs1);
      return { result: toInt32(a | slot.instruction.imm) };
    }
    case "xori": {
      const a = read(slot.instruction.rs1);
      return { result: toInt32(a ^ slot.instruction.imm) };
    }
    case "slli": {
      const a = read(slot.instruction.rs1);
      return { result: toInt32(a << slot.instruction.imm) };
    }
    case "srli": {
      const a = read(slot.instruction.rs1);
      return { result: toInt32(a >>> slot.instruction.imm) };
    }
    case "srai": {
      const a = read(slot.instruction.rs1);
      return { result: toInt32(a >> slot.instruction.imm) };
    }
    case "lb":
    case "lbu":
    case "lh":
    case "lhu":
    case "lw": {
      const a = read(slot.instruction.rs1);
      return { address: toByteAddress(toUint32(a + slot.instruction.imm)) };
    }
    case "sb":
    case "sh":
    case "sw": {
      const a = read(slot.instruction.rs1);
      const b = read(slot.instruction.rs2);
      return { address: toByteAddress(toUint32(a + slot.instruction.imm)), storeValue: b };
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
    case "bge": {
      const a = read(slot.instruction.rs1);
      const b = read(slot.instruction.rs2);
      return {
        taken: toInt32(a) >= toInt32(b),
        nextPc: toInt32(a) >= toInt32(b) ? slot.instruction.target : toByteAddress(slot.pc + INSTRUCTION_SIZE_BYTES),
      };
    }
    case "bltu": {
      const a = read(slot.instruction.rs1);
      const b = read(slot.instruction.rs2);
      return {
        taken: toUint32(a) < toUint32(b),
        nextPc: toUint32(a) < toUint32(b) ? slot.instruction.target : toByteAddress(slot.pc + INSTRUCTION_SIZE_BYTES),
      };
    }
    case "bgeu": {
      const a = read(slot.instruction.rs1);
      const b = read(slot.instruction.rs2);
      return {
        taken: toUint32(a) >= toUint32(b),
        nextPc: toUint32(a) >= toUint32(b) ? slot.instruction.target : toByteAddress(slot.pc + INSTRUCTION_SIZE_BYTES),
      };
    }
    case "jal":
      return { result: toInt32(slot.pc + INSTRUCTION_SIZE_BYTES), taken: true, nextPc: slot.instruction.target };
    case "jalr": {
      // The redirect never inspects the target address (spec §7): a misaligned
      // target is detected by IF at the redirected fetch and the error belongs
      // to the fetched-side dynamic instruction, not to the jalr itself.
      const a = read(slot.instruction.rs1);
      const target = toUint32(a + slot.instruction.imm);
      const nextPc = toByteAddress(target - (target % 2));
      return { result: toInt32(slot.pc + INSTRUCTION_SIZE_BYTES), taken: true, nextPc };
    }
    case "lui":
      return { result: toInt32(slot.instruction.imm << 12) };
    case "auipc":
      return { result: toInt32(slot.pc + (slot.instruction.imm << 12)) };
    case "fence":
      return {};
    case "ecall":
      return { error: { kind: "ecall", message: "ecall is an error condition in rask." } };
    case "ebreak":
      return { isEbreak: true };
  }
}

function readRegister(register: RegisterIndex, registers: RegisterFile): Int32 {
  if (register === 0) return toInt32(0);
  return registers[register] ?? toInt32(0);
}

function shouldStallForDataHazard(id: StageSlot | null, writers: Array<StageSlot | null>): boolean {
  if (!id) return false;
  const sources = sourceRegisters(id.instruction);
  if (sources.length === 0) return false;
  return writers.some((writer) => {
    if (!writer || writer.error) return false;
    const rd = destinationRegister(writer?.instruction);
    return rd != null && rd !== 0 && sources.includes(rd);
  });
}

function writebackValue(slot: StageSlot | null): Int32 | null {
  if (!slot) return null;
  if (isLoadInstruction(slot.instruction)) return slot.loadedValue ?? null;
  if (slot.instruction.op === "jal" || slot.instruction.op === "jalr") {
    return slot.result ?? toInt32(slot.pc + INSTRUCTION_SIZE_BYTES);
  }
  return slot.result ?? null;
}

function isLoadInstruction(instruction: Instruction): boolean {
  return (
    instruction.op === "lb" ||
    instruction.op === "lbu" ||
    instruction.op === "lh" ||
    instruction.op === "lhu" ||
    instruction.op === "lw"
  );
}

function buildTimeline(cycle: number, stages: StageSlots, events: PipelineEvent[]): TimelineCell[] {
  const cells: TimelineCell[] = [];
  STAGES.forEach((stage) => {
    const slot = stages[stage];
    if (!slot) return;
    cells.push({
      cycle,
      seqId: slot.seqId,
      pc: slot.pc,
      instructionId: slot.instructionId,
      stage,
      events: events.filter((event) => event.seqId === slot.seqId),
    });
  });
  return cells;
}

function buildOccupancyTable(cells: TimelineCell[]): string[] {
  const symbol = { IF: "F", ID: "D", EX: "X", MEM: "M", WB: "W" } as const;
  const maxCycle = Math.max(0, ...cells.map((cell) => cell.cycle));
  const rows = new Map<number, { pc: ByteAddress; timeline: string[] }>();

  for (const cell of cells) {
    const row =
      rows.get(cell.seqId) ??
      ({
        pc: cell.pc,
        timeline: Array.from({ length: maxCycle }, () => "."),
      } satisfies { pc: ByteAddress; timeline: string[] });
    while (row.timeline.length < maxCycle) row.timeline.push(".");
    row.timeline[cell.cycle - 1] = symbol[cell.stage];
    rows.set(cell.seqId, row);
  }

  return Array.from(rows.entries())
    .sort(([left], [right]) => left - right)
    .map(([seqId, row]) => `S${seqId} ${formatHex32(row.pc)} ${row.timeline.join("").replace(/\.+$/, "")}`);
}

function eventId(cycle: number, label: string, instructionId?: number): string {
  return `${cycle}:${instructionId ?? "global"}:${label}`;
}

function formatHex32(value: number): string {
  return toHex32(value).slice(2);
}

function formatInstructionWord(word: InstructionWord | null): string {
  return word == null ? "--------" : formatHex32(word);
}

function formatData(width: MemoryEffect["width"], value: number): string {
  const digits = width === "b" ? 2 : width === "h" ? 4 : 8;
  return toUint32(value).toString(16).slice(-digits).padStart(digits, "0");
}

function normalizeInitialMemory(memory: Record<number, number>): ByteMemory {
  const normalized: ByteMemory = {};
  for (const [address, value] of Object.entries(memory)) {
    const byteAddress = Number(address);
    if (Number.isInteger(byteAddress) && isRamRange(byteAddress, 1)) {
      normalized[toByteAddress(byteAddress)] = toByteValue(value);
    }
  }
  return normalized;
}

type MemoryDirection = "load" | "store";
type MemoryAccess =
  | { ok: true; kind: "ram" | "uart" | "exit" }
  | { ok: false; kind: "mem-unmapped" | "mmio-violation"; message: string };

function classifyDataAccess(address: ByteAddress, width: 1 | 2 | 4, direction: MemoryDirection): MemoryAccess {
  const unsigned = toUint32(address);
  if (isRamRange(unsigned, width)) return { ok: true, kind: "ram" };
  if (unsigned >= RASK_UART_REGION_BASE && unsigned < RASK_UART_REGION_LIMIT_EXCLUSIVE) {
    if (unsigned === RASK_UART_DATA_ADDRESS && direction === "store" && width === 1) {
      return { ok: true, kind: "uart" };
    }
    return { ok: false, kind: "mmio-violation", message: `Invalid UART ${direction} at byte address ${unsigned}.` };
  }
  if (unsigned >= RASK_EXIT_REGION_BASE && unsigned < RASK_EXIT_REGION_LIMIT_EXCLUSIVE) {
    if (unsigned === RASK_EXIT_DEVICE_ADDRESS && direction === "store" && width === 4) {
      return { ok: true, kind: "exit" };
    }
    return {
      ok: false,
      kind: "mmio-violation",
      message: `Invalid exit device ${direction} at byte address ${unsigned}.`,
    };
  }
  return { ok: false, kind: "mem-unmapped", message: `Unmapped ${direction} at byte address ${unsigned}.` };
}

function isRamRange(address: number, width: 1 | 2 | 4): boolean {
  return address >= RASK_RAM_BASE && address + width <= RASK_RAM_LIMIT_EXCLUSIVE;
}

function memoryError(kind: SimulatorError["kind"], message: string): Partial<StageSlot> {
  return { error: { kind, message } };
}

function decodeExitRequest(value: number): ExitRequest | null {
  if (value === 0x00005555) return { code: 0 };
  if ((value & 0xffff) === 0x3333) return { code: value >>> 16 };
  return null;
}

function deviceStoreEvent(
  cycle: number,
  slot: StageSlot,
  device: "exit",
  address: ByteAddress,
  value: number,
): PipelineEvent {
  return {
    id: eventId(cycle, "memory", slot.instructionId),
    cycle,
    seqId: slot.seqId,
    instructionId: slot.instructionId,
    kind: "memory",
    label: device,
    message: `${slot.instruction.text} writes ${toUint32(value)} to ${device} device register.`,
    detail: { address, value: toUint32(value) },
  };
}

function readWord(memory: ByteMemory, address: ByteAddress): Int32 {
  const value =
    ((memory[address] ?? 0) & 0xff) |
    (((memory[address + 1] ?? 0) & 0xff) << 8) |
    (((memory[address + 2] ?? 0) & 0xff) << 16) |
    (((memory[address + 3] ?? 0) & 0xff) << 24);
  return toInt32(value);
}

function readSignedByte(memory: ByteMemory, address: ByteAddress): Int32 {
  const value = (memory[address] ?? 0) & 0xff;
  return toInt32((value << 24) >> 24);
}

function readUnsignedByte(memory: ByteMemory, address: ByteAddress): Int32 {
  return toInt32((memory[address] ?? 0) & 0xff);
}

function readSignedHalfword(memory: ByteMemory, address: ByteAddress): Int32 {
  const value = ((memory[address] ?? 0) & 0xff) | (((memory[address + 1] ?? 0) & 0xff) << 8);
  return toInt32((value << 16) >> 16);
}

function readUnsignedHalfword(memory: ByteMemory, address: ByteAddress): Int32 {
  const value = ((memory[address] ?? 0) & 0xff) | (((memory[address + 1] ?? 0) & 0xff) << 8);
  return toInt32(value);
}

function isAlignedWordAddress(address: ByteAddress): boolean {
  return address % 4 === 0;
}

function isAlignedHalfwordAddress(address: ByteAddress): boolean {
  return address % 2 === 0;
}

function errorEvent(
  cycle: number,
  slot: StageSlot,
  message: string,
  detail: Record<string, string | number | boolean> = {},
): PipelineEvent {
  return {
    id: eventId(cycle, "error", slot.instructionId),
    cycle,
    seqId: slot.seqId,
    instructionId: slot.instructionId,
    kind: "error",
    label: "error",
    message,
    detail: { pc: slot.pc, ...detail },
  };
}
