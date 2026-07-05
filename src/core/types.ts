type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type RegisterIndex = Brand<number, "RegisterIndex">;
export type ByteAddress = Brand<number, "ByteAddress">;
export type ByteValue = Brand<number, "ByteValue">;
export type InstructionWord = Brand<number, "InstructionWord">;
export type Int32 = Brand<number, "Int32">;
export type Signed12Immediate = Brand<number, "Signed12Immediate">;
export type ShiftAmountImmediate = Brand<number, "ShiftAmountImmediate">;
export type Upper20Immediate = Brand<number, "Upper20Immediate">;

export type LabelTable = Record<string, ByteAddress>;
export type ByteMemory = Record<number, ByteValue>;
export type RegisterFile = Int32[];

export const RASK_RESET_PC = 0x80000000;
export const RASK_RAM_BASE = RASK_RESET_PC;
export const RASK_RAM_SIZE_BYTES = 4 * 1024 * 1024;
export const RASK_RAM_LIMIT_EXCLUSIVE = RASK_RAM_BASE + RASK_RAM_SIZE_BYTES;
export const RASK_UART_DATA_ADDRESS = 0x10000000;
export const RASK_EXIT_DEVICE_ADDRESS = 0x00100000;

export type Opcode =
  | "add"
  | "sub"
  | "slt"
  | "sltu"
  | "addi"
  | "slti"
  | "sltiu"
  | "andi"
  | "ori"
  | "xori"
  | "lb"
  | "lbu"
  | "lh"
  | "lhu"
  | "lw"
  | "sb"
  | "sh"
  | "sw"
  | "beq"
  | "bne"
  | "blt"
  | "bge"
  | "bltu"
  | "bgeu"
  | "jal"
  | "jalr"
  | "lui"
  | "auipc"
  | "and"
  | "or"
  | "xor"
  | "sll"
  | "srl"
  | "sra"
  | "slli"
  | "srli"
  | "srai"
  | "fence"
  | "ecall"
  | "ebreak";

export type StageName = "IF" | "ID" | "EX" | "MEM" | "WB";
export type EventKind = "stall" | "flush" | "retire" | "memory" | "branch" | "error";

export interface SourceLine {
  line: number;
  text: string;
}

interface InstructionBase {
  id: number;
  source: SourceLine;
  text: string;
}

export type RTypeOpcode = "add" | "sub" | "slt" | "sltu" | "and" | "or" | "xor" | "sll" | "srl" | "sra";
export type ITypeOpcode =
  | "addi"
  | "slti"
  | "sltiu"
  | "andi"
  | "ori"
  | "xori"
  | "lb"
  | "lbu"
  | "lh"
  | "lhu"
  | "lw"
  | "jalr";
export type ShiftImmediateOpcode = "slli" | "srli" | "srai";
export type STypeOpcode = "sb" | "sh" | "sw";
export type BTypeOpcode = "beq" | "bne" | "blt" | "bge" | "bltu" | "bgeu";
export type JTypeOpcode = "jal";
export type UTypeOpcode = "lui" | "auipc";
export type SystemOpcode = "fence" | "ecall" | "ebreak";

export interface RTypeInstruction extends InstructionBase {
  op: RTypeOpcode;
  rd: RegisterIndex;
  rs1: RegisterIndex;
  rs2: RegisterIndex;
}

export interface ITypeInstruction extends InstructionBase {
  op: ITypeOpcode;
  rd: RegisterIndex;
  rs1: RegisterIndex;
  imm: Signed12Immediate;
}

export interface ShiftImmediateInstruction extends InstructionBase {
  op: ShiftImmediateOpcode;
  rd: RegisterIndex;
  rs1: RegisterIndex;
  imm: ShiftAmountImmediate;
}

export interface STypeInstruction extends InstructionBase {
  op: STypeOpcode;
  rs1: RegisterIndex;
  rs2: RegisterIndex;
  imm: Signed12Immediate;
}

export interface BTypeInstruction extends InstructionBase {
  op: BTypeOpcode;
  rs1: RegisterIndex;
  rs2: RegisterIndex;
  target: ByteAddress;
  label: string;
}

export interface JTypeInstruction extends InstructionBase {
  op: JTypeOpcode;
  rd: RegisterIndex;
  target: ByteAddress;
  label: string;
}

export interface UTypeInstruction extends InstructionBase {
  op: UTypeOpcode;
  rd: RegisterIndex;
  imm: Upper20Immediate;
}

export interface SystemInstruction extends InstructionBase {
  op: SystemOpcode;
}

export type Instruction =
  | RTypeInstruction
  | ITypeInstruction
  | ShiftImmediateInstruction
  | STypeInstruction
  | BTypeInstruction
  | JTypeInstruction
  | UTypeInstruction
  | SystemInstruction;

export interface AssembleError {
  line: number;
  column: number;
  message: string;
}

export interface AssembleResult {
  ok: boolean;
  instructions: Instruction[];
  executionImage: ExecutionImage;
  labels: LabelTable;
  errors: AssembleError[];
}

export interface ExecutionImageInstruction {
  id: number;
  address: ByteAddress;
  word: InstructionWord;
  instruction?: Instruction;
  source: SourceLine;
  expandedFrom?: SourceLine;
}

export interface ExecutionImage {
  baseAddress: ByteAddress;
  instructions: ExecutionImageInstruction[];
  instructionMemory: Record<number, ExecutionImageInstruction>;
}

export interface PipelineEvent {
  id: string;
  cycle: number;
  seqId?: number;
  instructionId?: number;
  kind: EventKind;
  label: string;
  message: string;
  detail?: Record<string, string | number | boolean>;
}

export interface RegisterDiff {
  register: RegisterIndex;
  before: Int32;
  after: Int32;
}

export interface MemoryDiff {
  address: ByteAddress;
  before: ByteValue;
  after: ByteValue;
}

export interface ExitRequest {
  code: number;
}

export type DecodeErrorKind = "undef-instr" | "ecall";
export type SimulatorErrorKind =
  | "fetch-unmapped"
  | "fetch-misaligned"
  | DecodeErrorKind
  | "mem-unmapped"
  | "mem-misaligned"
  | "mmio-violation";

export interface DecodeError {
  kind: DecodeErrorKind;
  message: string;
}

export interface SimulatorError {
  kind: SimulatorErrorKind;
  message: string;
}

export type MemoryEffectWidth = "b" | "h" | "w";

export interface MemoryEffect {
  direction: "load" | "store";
  width: MemoryEffectWidth;
  address: ByteAddress;
  value: number;
}

export interface RetireLogEntry {
  pc: ByteAddress;
  instructionWord: InstructionWord | null;
  instruction: Instruction;
  memoryEffect?: MemoryEffect;
  register?: RegisterIndex;
  registerValue?: Int32;
}

export type TerminalRecord =
  | { kind: "exit"; code: number }
  | { kind: "error"; errorKind: SimulatorErrorKind; pc: ByteAddress; instructionWord: InstructionWord | null };

export interface StageSlot {
  seqId: number;
  instructionId: number;
  pc: ByteAddress;
  instructionWord: InstructionWord | null;
  instruction: Instruction;
  decodeError?: DecodeError;
  error?: SimulatorError;
  result?: Int32;
  address?: ByteAddress;
  storeValue?: Int32;
  loadedValue?: Int32;
  memoryEffect?: MemoryEffect;
  taken?: boolean;
  nextPc?: ByteAddress;
  exitRequest?: ExitRequest;
  isEbreak?: boolean;
}

export type StageSlots = Record<StageName, StageSlot | null>;

export interface PipelineLatches {
  ifId: StageSlot | null;
  idEx: StageSlot | null;
  exMem: StageSlot | null;
  memWb: StageSlot | null;
}

export interface TimelineCell {
  cycle: number;
  seqId: number;
  pc: ByteAddress;
  instructionId: number;
  stage: StageName;
  events: PipelineEvent[];
}

export interface CycleSnapshot {
  cycle: number;
  pc: ByteAddress;
  nextSeqId: number;
  /** End-of-cycle latch values (state handed to the next cycle). */
  latches: PipelineLatches;
  /** End-of-cycle IF stage slot; non-null only while a stall holds the fetched instruction. */
  ifSlot: StageSlot | null;
  /** What each stage processed during this cycle. Not a projection of `latches`. */
  stages: StageSlots;
  registers: RegisterFile;
  memory: ByteMemory;
  consoleOutput: ByteValue[];
  events: PipelineEvent[];
  retireLog: RetireLogEntry[];
  terminalRecord?: TerminalRecord;
  registerDiffs: RegisterDiff[];
  memoryDiffs: MemoryDiff[];
  timeline: TimelineCell[];
  occupancyTable: string[];
  paused: boolean;
  halted: boolean;
}

export interface SimulationState {
  executionImage: ExecutionImage;
  program: Instruction[];
  history: CycleSnapshot[];
  current: CycleSnapshot;
}

export interface SimulationInitialState {
  registers?: Record<number, number>;
  memory?: Record<number, number>;
}

export interface ProgramDocument {
  id: string;
  name: string;
  source: string;
  updatedAt: number;
}

export interface SelectedCell {
  cycle: number;
  seqId: number;
  instructionId: number;
}
