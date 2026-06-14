import {
  INSTRUCTION_BINARY_METADATA,
  INSTRUCTION_METADATA,
  type InstructionBinaryMetadata,
} from "./instructionMetadata";
import {
  toByteAddress,
  toInstructionWord,
  toRegisterIndex,
  toShiftAmountImmediate,
  toSigned12Immediate,
  toUpper20Immediate,
} from "./numbers";
import type {
  ByteAddress,
  Instruction,
  InstructionWord,
  Opcode,
  SourceLine,
  BTypeOpcode,
  DecodeError,
  ITypeOpcode,
  JTypeOpcode,
  RTypeOpcode,
  ShiftImmediateOpcode,
  STypeOpcode,
  UTypeOpcode,
} from "./types";

export type DecodeInstructionResult = { ok: true; instruction: Instruction } | { ok: false; error: DecodeError };

const DEFAULT_SOURCE: SourceLine = { line: 0, text: "" };

export function encodeInstruction(instruction: Instruction, pc: ByteAddress): InstructionWord {
  const encoding = binary(instruction.op);
  switch (instruction.op) {
    case "add":
    case "sub":
    case "slt":
    case "sltu":
    case "and":
    case "or":
    case "xor":
    case "sll":
    case "srl":
    case "sra":
      return encodeR(
        encoding.funct7 ?? 0,
        instruction.rs2,
        instruction.rs1,
        encoding.funct3 ?? 0,
        instruction.rd,
        encoding.opcode,
      );
    case "slli":
    case "srli":
    case "srai":
      return encodeI(
        ((encoding.funct7 ?? 0) << 5) | instruction.imm,
        instruction.rs1,
        encoding.funct3 ?? 0,
        instruction.rd,
        encoding.opcode,
      );
    case "addi":
    case "slti":
    case "sltiu":
    case "andi":
    case "ori":
    case "xori":
    case "lb":
    case "lbu":
    case "lh":
    case "lhu":
    case "lw":
    case "jalr":
      return encodeI(instruction.imm, instruction.rs1, encoding.funct3 ?? 0, instruction.rd, encoding.opcode);
    case "sb":
    case "sh":
    case "sw":
      return encodeS(instruction.imm, instruction.rs2, instruction.rs1, encoding.funct3 ?? 0, encoding.opcode);
    case "beq":
    case "bne":
    case "blt":
    case "bge":
    case "bltu":
    case "bgeu":
      return encodeB(instruction.target - pc, instruction.rs2, instruction.rs1, encoding.funct3 ?? 0, encoding.opcode);
    case "jal":
      return encodeJ(instruction.target - pc, instruction.rd, encoding.opcode);
    case "lui":
    case "auipc":
      return encodeU(instruction.imm, instruction.rd, encoding.opcode);
  }
}

export function decodeInstruction(
  word: InstructionWord,
  pc: ByteAddress,
  id: number,
  source: SourceLine = DEFAULT_SOURCE,
  text?: string,
): DecodeInstructionResult {
  const raw = word >>> 0;
  if (raw === 0x00000073) {
    return { ok: false, error: { kind: "ecall", message: "ecall is an error condition in rask." } };
  }

  const opcode = raw & 0x7f;
  const rd = toRegisterIndex((raw >>> 7) & 0x1f);
  const funct3 = (raw >>> 12) & 0x7;
  const rs1 = toRegisterIndex((raw >>> 15) & 0x1f);
  const rs2 = toRegisterIndex((raw >>> 20) & 0x1f);
  const funct7 = (raw >>> 25) & 0x7f;
  const displayText = text ?? formatDecodedText(raw);
  const base = { id, source, text: displayText };

  const rOpcode = findOpcode("R", opcode, funct3, funct7);
  if (rOpcode) return { ok: true, instruction: { ...base, op: rOpcode, rd, rs1, rs2 } };

  const iOpcode = findOpcode("I", opcode, funct3, funct7ForI(raw, opcode, funct3));
  if (iOpcode) {
    if (iOpcode === "slli" || iOpcode === "srli" || iOpcode === "srai") {
      return {
        ok: true,
        instruction: { ...base, op: iOpcode, rd, rs1, imm: toShiftAmountImmediate((raw >>> 20) & 0x1f) },
      };
    }
    return {
      ok: true,
      instruction: { ...base, op: iOpcode, rd, rs1, imm: toSigned12Immediate(signExtend(raw >>> 20, 12)) },
    };
  }

  const sOpcode = findOpcode("S", opcode, funct3);
  if (sOpcode) {
    const imm = ((raw >>> 7) & 0x1f) | (((raw >>> 25) & 0x7f) << 5);
    return { ok: true, instruction: { ...base, op: sOpcode, rs1, rs2, imm: toSigned12Immediate(signExtend(imm, 12)) } };
  }

  const bOpcode = findOpcode("B", opcode, funct3);
  if (bOpcode) {
    const offset =
      (((raw >>> 31) & 0x1) << 12) |
      (((raw >>> 7) & 0x1) << 11) |
      (((raw >>> 25) & 0x3f) << 5) |
      (((raw >>> 8) & 0xf) << 1);
    const target = toByteAddress(pc + signExtend(offset, 13));
    return { ok: true, instruction: { ...base, op: bOpcode, rs1, rs2, target, label: formatAddress(target) } };
  }

  const jOpcode = findOpcode("J", opcode);
  if (jOpcode) {
    const offset =
      (((raw >>> 31) & 0x1) << 20) |
      (((raw >>> 12) & 0xff) << 12) |
      (((raw >>> 20) & 0x1) << 11) |
      (((raw >>> 21) & 0x3ff) << 1);
    const target = toByteAddress(pc + signExtend(offset, 21));
    return { ok: true, instruction: { ...base, op: jOpcode, rd, target, label: formatAddress(target) } };
  }

  const uOpcode = findOpcode("U", opcode);
  if (uOpcode) {
    return { ok: true, instruction: { ...base, op: uOpcode, rd, imm: toUpper20Immediate(raw >>> 12) } };
  }

  return {
    ok: false,
    error: { kind: "undef-instr", message: `Undefined instruction word ${formatWord(raw)} at byte address ${pc}.` },
  };
}

function findOpcode(format: "R", opcode: number, funct3: number, funct7: number): RTypeOpcode | null;
function findOpcode(
  format: "I",
  opcode: number,
  funct3: number,
  funct7: number,
): ITypeOpcode | ShiftImmediateOpcode | null;
function findOpcode(format: "S", opcode: number, funct3: number): STypeOpcode | null;
function findOpcode(format: "B", opcode: number, funct3: number): BTypeOpcode | null;
function findOpcode(format: "J", opcode: number): JTypeOpcode | null;
function findOpcode(format: "U", opcode: number): UTypeOpcode | null;
function findOpcode(
  format: "R" | "I" | "S" | "B" | "J" | "U",
  opcode: number,
  funct3?: number,
  funct7?: number,
): Opcode | null {
  for (const op of Object.keys(INSTRUCTION_BINARY_METADATA) as Opcode[]) {
    const metadata = INSTRUCTION_METADATA[op];
    const encoding = binary(op);
    if (metadata.format !== format || encoding.opcode !== opcode) continue;
    if (encoding.funct3 !== undefined && encoding.funct3 !== funct3) continue;
    if (encoding.funct7 !== undefined && encoding.funct7 !== funct7) continue;
    return op;
  }
  return null;
}

function binary(op: Opcode): InstructionBinaryMetadata {
  return INSTRUCTION_BINARY_METADATA[op];
}

function funct7ForI(raw: number, opcode: number, funct3: number): number {
  const isShiftImmediate = opcode === 0x13 && (funct3 === 0x1 || funct3 === 0x5);
  return isShiftImmediate ? (raw >>> 25) & 0x7f : 0;
}

function encodeR(
  funct7: number,
  rs2: number,
  rs1: number,
  funct3: number,
  rd: number,
  opcode: number,
): InstructionWord {
  return toInstructionWord((funct7 << 25) | (rs2 << 20) | (rs1 << 15) | (funct3 << 12) | (rd << 7) | opcode);
}

function encodeI(imm: number, rs1: number, funct3: number, rd: number, opcode: number): InstructionWord {
  return toInstructionWord(((imm & 0xfff) << 20) | (rs1 << 15) | (funct3 << 12) | (rd << 7) | opcode);
}

function encodeS(imm: number, rs2: number, rs1: number, funct3: number, opcode: number): InstructionWord {
  const value = imm & 0xfff;
  return toInstructionWord(
    ((value >>> 5) << 25) | (rs2 << 20) | (rs1 << 15) | (funct3 << 12) | ((value & 0x1f) << 7) | opcode,
  );
}

function encodeB(offset: number, rs2: number, rs1: number, funct3: number, opcode: number): InstructionWord {
  const value = offset & 0x1fff;
  return toInstructionWord(
    (((value >>> 12) & 0x1) << 31) |
      (((value >>> 5) & 0x3f) << 25) |
      (rs2 << 20) |
      (rs1 << 15) |
      (funct3 << 12) |
      (((value >>> 1) & 0xf) << 8) |
      (((value >>> 11) & 0x1) << 7) |
      opcode,
  );
}

function encodeU(imm: number, rd: number, opcode: number): InstructionWord {
  return toInstructionWord(((imm & 0xfffff) << 12) | (rd << 7) | opcode);
}

function encodeJ(offset: number, rd: number, opcode: number): InstructionWord {
  const value = offset & 0x1fffff;
  return toInstructionWord(
    (((value >>> 20) & 0x1) << 31) |
      (((value >>> 1) & 0x3ff) << 21) |
      (((value >>> 11) & 0x1) << 20) |
      (((value >>> 12) & 0xff) << 12) |
      (rd << 7) |
      opcode,
  );
}

function signExtend(value: number, bits: number): number {
  const shift = 32 - bits;
  return (value << shift) >> shift;
}

function formatDecodedText(word: number): string {
  return `.word ${formatWord(word)}`;
}

function formatAddress(address: number): string {
  return `0x${(address >>> 0).toString(16).padStart(8, "0")}`;
}

function formatWord(word: number): string {
  return `0x${(word >>> 0).toString(16).padStart(8, "0")}`;
}
