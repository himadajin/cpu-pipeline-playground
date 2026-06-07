import type { BTypeOpcode, Instruction, Opcode, RegisterIndex, RTypeOpcode } from "./types";

export type InstructionFormat = "R" | "I" | "S" | "B" | "J" | "U";
export type InstructionCategory = "alu" | "memory" | "control";
export type SourceOperand = "rs1" | "rs2";
export type DestinationOperand = "rd";
export type ImmediateKind = "signed12" | "shamt5" | "branchTarget" | "jumpTarget" | "upper20";

export interface InstructionMetadata {
  format: InstructionFormat;
  category: InstructionCategory;
  sources: readonly SourceOperand[];
  destination: DestinationOperand | null;
  immediateKind: ImmediateKind | null;
  operandSyntax: string;
  description: string;
}

export const INSTRUCTION_METADATA = {
  add: {
    format: "R",
    category: "alu",
    sources: ["rs1", "rs2"],
    destination: "rd",
    immediateKind: null,
    operandSyntax: "rd, rs1, rs2",
    description: "Add two registers.",
  },
  sub: {
    format: "R",
    category: "alu",
    sources: ["rs1", "rs2"],
    destination: "rd",
    immediateKind: null,
    operandSyntax: "rd, rs1, rs2",
    description: "Subtract one register from another.",
  },
  slt: {
    format: "R",
    category: "alu",
    sources: ["rs1", "rs2"],
    destination: "rd",
    immediateKind: null,
    operandSyntax: "rd, rs1, rs2",
    description: "Set when rs1 is less than rs2 as int32.",
  },
  sltu: {
    format: "R",
    category: "alu",
    sources: ["rs1", "rs2"],
    destination: "rd",
    immediateKind: null,
    operandSyntax: "rd, rs1, rs2",
    description: "Set when rs1 is less than rs2 as uint32.",
  },
  addi: {
    format: "I",
    category: "alu",
    sources: ["rs1"],
    destination: "rd",
    immediateKind: "signed12",
    operandSyntax: "rd, rs1, imm",
    description: "Add a signed 12-bit immediate.",
  },
  slti: {
    format: "I",
    category: "alu",
    sources: ["rs1"],
    destination: "rd",
    immediateKind: "signed12",
    operandSyntax: "rd, rs1, imm",
    description: "Set when rs1 is less than a signed 12-bit immediate as int32.",
  },
  sltiu: {
    format: "I",
    category: "alu",
    sources: ["rs1"],
    destination: "rd",
    immediateKind: "signed12",
    operandSyntax: "rd, rs1, imm",
    description: "Set when rs1 is less than a signed 12-bit immediate as uint32.",
  },
  andi: {
    format: "I",
    category: "alu",
    sources: ["rs1"],
    destination: "rd",
    immediateKind: "signed12",
    operandSyntax: "rd, rs1, imm",
    description: "Bitwise and with a signed 12-bit immediate.",
  },
  ori: {
    format: "I",
    category: "alu",
    sources: ["rs1"],
    destination: "rd",
    immediateKind: "signed12",
    operandSyntax: "rd, rs1, imm",
    description: "Bitwise or with a signed 12-bit immediate.",
  },
  xori: {
    format: "I",
    category: "alu",
    sources: ["rs1"],
    destination: "rd",
    immediateKind: "signed12",
    operandSyntax: "rd, rs1, imm",
    description: "Bitwise xor with a signed 12-bit immediate.",
  },
  lb: {
    format: "I",
    category: "memory",
    sources: ["rs1"],
    destination: "rd",
    immediateKind: "signed12",
    operandSyntax: "rd, offset(rs1)",
    description: "Load a signed byte.",
  },
  lw: {
    format: "I",
    category: "memory",
    sources: ["rs1"],
    destination: "rd",
    immediateKind: "signed12",
    operandSyntax: "rd, offset(rs1)",
    description: "Load a little-endian word.",
  },
  sb: {
    format: "S",
    category: "memory",
    sources: ["rs1", "rs2"],
    destination: null,
    immediateKind: "signed12",
    operandSyntax: "rs2, offset(rs1)",
    description: "Store one byte.",
  },
  sw: {
    format: "S",
    category: "memory",
    sources: ["rs1", "rs2"],
    destination: null,
    immediateKind: "signed12",
    operandSyntax: "rs2, offset(rs1)",
    description: "Store a little-endian word.",
  },
  beq: {
    format: "B",
    category: "control",
    sources: ["rs1", "rs2"],
    destination: null,
    immediateKind: "branchTarget",
    operandSyntax: "rs1, rs2, label",
    description: "Branch when two registers are equal.",
  },
  bne: {
    format: "B",
    category: "control",
    sources: ["rs1", "rs2"],
    destination: null,
    immediateKind: "branchTarget",
    operandSyntax: "rs1, rs2, label",
    description: "Branch when two registers are not equal.",
  },
  blt: {
    format: "B",
    category: "control",
    sources: ["rs1", "rs2"],
    destination: null,
    immediateKind: "branchTarget",
    operandSyntax: "rs1, rs2, label",
    description: "Branch when rs1 is less than rs2 as int32.",
  },
  bge: {
    format: "B",
    category: "control",
    sources: ["rs1", "rs2"],
    destination: null,
    immediateKind: "branchTarget",
    operandSyntax: "rs1, rs2, label",
    description: "Branch when rs1 is greater than or equal to rs2 as int32.",
  },
  bltu: {
    format: "B",
    category: "control",
    sources: ["rs1", "rs2"],
    destination: null,
    immediateKind: "branchTarget",
    operandSyntax: "rs1, rs2, label",
    description: "Branch when rs1 is less than rs2 as uint32.",
  },
  bgeu: {
    format: "B",
    category: "control",
    sources: ["rs1", "rs2"],
    destination: null,
    immediateKind: "branchTarget",
    operandSyntax: "rs1, rs2, label",
    description: "Branch when rs1 is greater than or equal to rs2 as uint32.",
  },
  jal: {
    format: "J",
    category: "control",
    sources: [],
    destination: "rd",
    immediateKind: "jumpTarget",
    operandSyntax: "rd, label",
    description: "Jump and write pc plus 4.",
  },
  jalr: {
    format: "I",
    category: "control",
    sources: ["rs1"],
    destination: "rd",
    immediateKind: "signed12",
    operandSyntax: "rd, offset(rs1)",
    description: "Jump through a register plus signed 12-bit offset.",
  },
  lui: {
    format: "U",
    category: "alu",
    sources: [],
    destination: "rd",
    immediateKind: "upper20",
    operandSyntax: "rd, imm20",
    description: "Load a 20-bit upper immediate.",
  },
  auipc: {
    format: "U",
    category: "alu",
    sources: [],
    destination: "rd",
    immediateKind: "upper20",
    operandSyntax: "rd, imm20",
    description: "Add a 20-bit upper immediate to pc.",
  },
  and: {
    format: "R",
    category: "alu",
    sources: ["rs1", "rs2"],
    destination: "rd",
    immediateKind: null,
    operandSyntax: "rd, rs1, rs2",
    description: "Bitwise and.",
  },
  or: {
    format: "R",
    category: "alu",
    sources: ["rs1", "rs2"],
    destination: "rd",
    immediateKind: null,
    operandSyntax: "rd, rs1, rs2",
    description: "Bitwise or.",
  },
  xor: {
    format: "R",
    category: "alu",
    sources: ["rs1", "rs2"],
    destination: "rd",
    immediateKind: null,
    operandSyntax: "rd, rs1, rs2",
    description: "Bitwise xor.",
  },
  sll: {
    format: "R",
    category: "alu",
    sources: ["rs1", "rs2"],
    destination: "rd",
    immediateKind: null,
    operandSyntax: "rd, rs1, rs2",
    description: "Shift left logical by register amount.",
  },
  srl: {
    format: "R",
    category: "alu",
    sources: ["rs1", "rs2"],
    destination: "rd",
    immediateKind: null,
    operandSyntax: "rd, rs1, rs2",
    description: "Shift right logical by register amount.",
  },
  sra: {
    format: "R",
    category: "alu",
    sources: ["rs1", "rs2"],
    destination: "rd",
    immediateKind: null,
    operandSyntax: "rd, rs1, rs2",
    description: "Shift right arithmetic by register amount.",
  },
  slli: {
    format: "I",
    category: "alu",
    sources: ["rs1"],
    destination: "rd",
    immediateKind: "shamt5",
    operandSyntax: "rd, rs1, shamt",
    description: "Shift left logical by 5-bit immediate amount.",
  },
  srli: {
    format: "I",
    category: "alu",
    sources: ["rs1"],
    destination: "rd",
    immediateKind: "shamt5",
    operandSyntax: "rd, rs1, shamt",
    description: "Shift right logical by 5-bit immediate amount.",
  },
  srai: {
    format: "I",
    category: "alu",
    sources: ["rs1"],
    destination: "rd",
    immediateKind: "shamt5",
    operandSyntax: "rd, rs1, shamt",
    description: "Shift right arithmetic by 5-bit immediate amount.",
  },
} satisfies Record<Opcode, InstructionMetadata>;

export const REAL_OPCODES = Object.keys(INSTRUCTION_METADATA) as Opcode[];
export const PSEUDO_MNEMONICS = ["nop"] as const;
export type PseudoMnemonic = (typeof PSEUDO_MNEMONICS)[number];
export type AssemblerMnemonic = Opcode | PseudoMnemonic;

export const ASSEMBLER_MNEMONICS = [...REAL_OPCODES, ...PSEUDO_MNEMONICS] as AssemblerMnemonic[];

export function isOpcode(value: string): value is Opcode {
  return Object.prototype.hasOwnProperty.call(INSTRUCTION_METADATA, value);
}

export function isAssemblerMnemonic(value: string): value is AssemblerMnemonic {
  return isOpcode(value) || (PSEUDO_MNEMONICS as readonly string[]).includes(value);
}

export function isInstructionFormat(op: Opcode, format: InstructionFormat): boolean {
  return INSTRUCTION_METADATA[op].format === format;
}

export function isRTypeOpcode(op: Opcode): op is RTypeOpcode {
  return isInstructionFormat(op, "R");
}

export function isBTypeOpcode(op: Opcode): op is BTypeOpcode {
  return isInstructionFormat(op, "B");
}

export function sourceRegisters(instruction: Instruction): RegisterIndex[] {
  const metadata = INSTRUCTION_METADATA[instruction.op];
  const registers: RegisterIndex[] = [];
  for (const source of metadata.sources) {
    if (source === "rs1" && "rs1" in instruction) registers.push(instruction.rs1);
    if (source === "rs2" && "rs2" in instruction) registers.push(instruction.rs2);
  }
  return registers;
}

export function destinationRegister(instruction: Instruction | undefined): RegisterIndex | null {
  if (!instruction) return null;
  const metadata = INSTRUCTION_METADATA[instruction.op];
  if (metadata.destination === "rd" && "rd" in instruction) return instruction.rd;
  return null;
}

export function writesRegister(instruction: Instruction | undefined): boolean {
  return destinationRegister(instruction) != null;
}
