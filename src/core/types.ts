type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type RegisterIndex = Brand<number, "RegisterIndex">;
export type ByteAddress = Brand<number, "ByteAddress">;
export type ByteValue = Brand<number, "ByteValue">;
export type Int32 = Brand<number, "Int32">;
export type Signed12Immediate = Brand<number, "Signed12Immediate">;
export type Upper20Immediate = Brand<number, "Upper20Immediate">;

export type LabelTable = Record<string, ByteAddress>;
export type ByteMemory = Record<number, ByteValue>;
export type RegisterFile = Int32[];

export type Opcode =
  | "add"
  | "sub"
  | "slt"
  | "sltu"
  | "addi"
  | "slti"
  | "sltiu"
  | "lb"
  | "lw"
  | "sb"
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
  | "srl";

export type StageName = "IF" | "ID" | "EX" | "MEM" | "WB";
export type EventKind = "stall" | "flush" | "forward" | "commit" | "memory" | "branch" | "error";

export interface SourceLine {
  line: number;
  text: string;
}

interface InstructionBase {
  id: number;
  source: SourceLine;
  text: string;
}

export type RTypeOpcode = "add" | "sub" | "slt" | "sltu" | "and" | "or" | "xor" | "sll" | "srl";
export type ITypeOpcode = "addi" | "slti" | "sltiu" | "lb" | "lw" | "jalr";
export type STypeOpcode = "sb" | "sw";
export type BTypeOpcode = "beq" | "bne" | "blt" | "bge" | "bltu" | "bgeu";
export type JTypeOpcode = "jal";
export type UTypeOpcode = "lui" | "auipc";

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

export type Instruction =
  | RTypeInstruction
  | ITypeInstruction
  | STypeInstruction
  | BTypeInstruction
  | JTypeInstruction
  | UTypeInstruction;

export interface AssembleError {
  line: number;
  column: number;
  message: string;
}

export interface AssembleResult {
  ok: boolean;
  instructions: Instruction[];
  labels: LabelTable;
  errors: AssembleError[];
}

export interface PipelineEvent {
  id: string;
  cycle: number;
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

export interface StageSlot {
  instructionId: number;
  pc: ByteAddress;
  instruction: Instruction;
  result?: Int32;
  address?: ByteAddress;
  storeValue?: Int32;
  loadedValue?: Int32;
  taken?: boolean;
  nextPc?: ByteAddress;
  halted?: boolean;
}

export type StageSlots = Record<StageName, StageSlot | null>;

export interface TimelineCell {
  cycle: number;
  instructionId: number;
  stage: StageName;
  events: PipelineEvent[];
}

export interface CycleSnapshot {
  cycle: number;
  pc: ByteAddress;
  stages: StageSlots;
  registers: RegisterFile;
  memory: ByteMemory;
  events: PipelineEvent[];
  registerDiffs: RegisterDiff[];
  memoryDiffs: MemoryDiff[];
  timeline: TimelineCell[];
  halted: boolean;
}

export interface SimulationState {
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
  instructionId: number;
}
