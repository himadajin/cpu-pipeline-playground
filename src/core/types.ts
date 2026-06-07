export type Opcode =
  | "add"
  | "sub"
  | "addi"
  | "lw"
  | "sw"
  | "beq"
  | "bne"
  | "blt"
  | "jal"
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

export interface Instruction {
  id: number;
  op: Opcode;
  rd?: number;
  rs1?: number;
  rs2?: number;
  imm?: number;
  target?: number;
  label?: string;
  source: SourceLine;
  text: string;
}

export interface AssembleError {
  line: number;
  column: number;
  message: string;
}

export interface AssembleResult {
  ok: boolean;
  instructions: Instruction[];
  labels: Record<string, number>;
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
  register: number;
  before: number;
  after: number;
}

export interface MemoryDiff {
  address: number;
  before: number;
  after: number;
}

export interface StageSlot {
  instructionId: number;
  pc: number;
  instruction: Instruction;
  result?: number;
  address?: number;
  storeValue?: number;
  loadedValue?: number;
  taken?: boolean;
  nextPc?: number;
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
  pc: number;
  stages: StageSlots;
  registers: number[];
  memory: Record<number, number>;
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
