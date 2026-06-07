import { toByteAddress, toRegisterIndex, toSigned12Immediate, toUpper20Immediate } from "./numbers";
import {
  ASSEMBLER_MNEMONICS,
  isAssemblerMnemonic,
  isBTypeOpcode,
  isOpcode,
  isRTypeOpcode,
} from "./instructionMetadata";
import type { AssembleError, AssembleResult, ByteAddress, Instruction, LabelTable, RegisterIndex } from "./types";

const INSTRUCTION_SIZE_BYTES = 4;
const SIGNED_12_MIN = -2048;
const SIGNED_12_MAX = 2047;
const B_OFFSET_MIN = -4096;
const B_OFFSET_MAX = 4094;
const J_OFFSET_MIN = -1_048_576;
const J_OFFSET_MAX = 1_048_574;
const UPPER_20_MIN = 0;
const UPPER_20_MAX = 0xfffff;

const REGISTER_ALIASES: Record<string, number> = {
  zero: 0,
  ra: 1,
  sp: 2,
  gp: 3,
  tp: 4,
  t0: 5,
  t1: 6,
  t2: 7,
  s0: 8,
  fp: 8,
  s1: 9,
  a0: 10,
  a1: 11,
  a2: 12,
  a3: 13,
  a4: 14,
  a5: 15,
  a6: 16,
  a7: 17,
  s2: 18,
  s3: 19,
  s4: 20,
  s5: 21,
  s6: 22,
  s7: 23,
  s8: 24,
  s9: 25,
  s10: 26,
  s11: 27,
  t3: 28,
  t4: 29,
  t5: 30,
  t6: 31,
};

interface ParsedLine {
  line: number;
  text: string;
  body: string;
  pc: ByteAddress;
}

export function assemble(source: string): AssembleResult {
  const labels: LabelTable = {};
  const errors: AssembleError[] = [];
  const parsedLines: ParsedLine[] = [];
  let pc = toByteAddress(0);

  source.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    const text = raw.replace(/\t/g, "  ");
    let body = stripComment(text).trim();
    if (!body) return;

    while (body.includes(":")) {
      const [candidate, rest] = splitOnce(body, ":");
      const label = candidate.trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(label)) {
        errors.push({ line, column: 1, message: `Invalid label "${label}".` });
        return;
      }
      if (labels[label] !== undefined) {
        errors.push({ line, column: 1, message: `Duplicate label "${label}".` });
        return;
      }
      labels[label] = pc;
      body = rest.trim();
      if (!body) return;
    }

    parsedLines.push({ line, text, body, pc });
    pc = toByteAddress(pc + INSTRUCTION_SIZE_BYTES);
  });

  const instructions: Instruction[] = [];
  parsedLines.forEach((parsed) => {
    const inst = parseInstruction(parsed, instructions.length, labels, errors);
    if (inst) instructions.push(inst);
  });

  return {
    ok: errors.length === 0,
    instructions,
    labels,
    errors,
  };
}

export function instructionSet(): string[] {
  return [...ASSEMBLER_MNEMONICS];
}

function parseInstruction(
  parsed: ParsedLine,
  id: number,
  labels: LabelTable,
  errors: AssembleError[],
): Instruction | null {
  const [opToken, rest = ""] = splitWhitespace(parsed.body);
  const mnemonic = opToken.toLowerCase();
  if (!isAssemblerMnemonic(mnemonic)) {
    errors.push({ line: parsed.line, column: 1, message: `Unknown instruction "${opToken}".` });
    return null;
  }

  const args = rest
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const fail = (message: string) => {
    errors.push({ line: parsed.line, column: parsed.body.indexOf(opToken) + 1, message });
    return null;
  };
  const base = {
    id,
    source: { line: parsed.line, text: parsed.text },
    text: parsed.body,
  };

  if (mnemonic === "nop") {
    if (args.length !== 0) return fail("nop does not take operands.");
    return {
      ...base,
      op: "addi",
      rd: toRegisterIndex(0),
      rs1: toRegisterIndex(0),
      imm: toSigned12Immediate(0),
    };
  }

  if (!isOpcode(mnemonic)) {
    return fail(`Unsupported instruction "${mnemonic}".`);
  }

  const op = mnemonic;
  if (isRTypeOpcode(op)) {
    if (args.length !== 3) return fail(`${op} expects rd, rs1, rs2.`);
    const rd = parseRegister(args[0]);
    const rs1 = parseRegister(args[1]);
    const rs2 = parseRegister(args[2]);
    if (rd == null || rs1 == null || rs2 == null) return fail(`Invalid register in "${parsed.body}".`);
    return { ...base, op, rd, rs1, rs2 };
  }

  if (op === "addi") {
    if (args.length !== 3) return fail("addi expects rd, rs1, imm.");
    const rd = parseRegister(args[0]);
    const rs1 = parseRegister(args[1]);
    const imm = parseImmediate(args[2]);
    if (rd == null || rs1 == null || imm == null) return fail(`Invalid addi operands in "${parsed.body}".`);
    if (!isSigned12(imm)) return fail("addi immediate must be a signed 12-bit value (-2048..2047).");
    return { ...base, op, rd, rs1, imm: toSigned12Immediate(imm) };
  }

  if (op === "lw") {
    if (args.length !== 2) return fail("lw expects rd, offset(rs1).");
    const rd = parseRegister(args[0]);
    const memory = parseMemoryOperand(args[1]);
    if (rd == null || !memory) return fail(`Invalid lw operands in "${parsed.body}".`);
    if (!isSigned12(memory.offset)) return fail("lw offset must be a signed 12-bit value (-2048..2047).");
    return { ...base, op, rd, rs1: memory.base, imm: toSigned12Immediate(memory.offset) };
  }

  if (op === "jalr") {
    if (args.length !== 2) return fail("jalr expects rd, offset(rs1).");
    const rd = parseRegister(args[0]);
    const memory = parseMemoryOperand(args[1]);
    if (rd == null || !memory) return fail(`Invalid jalr operands in "${parsed.body}".`);
    if (!isSigned12(memory.offset)) return fail("jalr offset must be a signed 12-bit value (-2048..2047).");
    return { ...base, op, rd, rs1: memory.base, imm: toSigned12Immediate(memory.offset) };
  }

  if (op === "sw") {
    if (args.length !== 2) return fail("sw expects rs2, offset(rs1).");
    const rs2 = parseRegister(args[0]);
    const memory = parseMemoryOperand(args[1]);
    if (rs2 == null || !memory) return fail(`Invalid sw operands in "${parsed.body}".`);
    if (!isSigned12(memory.offset)) return fail("sw offset must be a signed 12-bit value (-2048..2047).");
    return { ...base, op, rs1: memory.base, rs2, imm: toSigned12Immediate(memory.offset) };
  }

  if (isBTypeOpcode(op)) {
    if (args.length !== 3) return fail(`${op} expects rs1, rs2, label.`);
    const rs1 = parseRegister(args[0]);
    const rs2 = parseRegister(args[1]);
    if (rs1 == null || rs2 == null) return fail(`Invalid branch registers in "${parsed.body}".`);
    const target = lookupLabel(labels, args[2]);
    if (target === undefined) return fail(`Unknown label "${args[2]}".`);
    const offset = target - parsed.pc;
    if (!isAlignedInstructionAddress(target) || !isBranchOffset(offset)) {
      return fail(`${op} target must be 4-byte aligned and fit a signed 13-bit PC-relative offset.`);
    }
    return { ...base, op, rs1, rs2, target, label: args[2] };
  }

  if (op === "jal") {
    if (args.length !== 2) return fail("jal expects rd, label.");
    const rd = parseRegister(args[0]);
    if (rd == null) return fail(`Invalid jal destination in "${parsed.body}".`);
    const target = lookupLabel(labels, args[1]);
    if (target === undefined) return fail(`Unknown label "${args[1]}".`);
    const offset = target - parsed.pc;
    if (!isAlignedInstructionAddress(target) || !isJumpOffset(offset)) {
      return fail("jal target must be 4-byte aligned and fit a signed 21-bit PC-relative offset.");
    }
    return { ...base, op, rd, target, label: args[1] };
  }

  if (op === "lui" || op === "auipc") {
    if (args.length !== 2) return fail(`${op} expects rd, imm20.`);
    const rd = parseRegister(args[0]);
    const imm = parseImmediate(args[1]);
    if (rd == null || imm == null) return fail(`Invalid ${op} operands in "${parsed.body}".`);
    if (!isUpper20(imm)) return fail(`${op} immediate must be a 20-bit value (0..0xfffff).`);
    return { ...base, op, rd, imm: toUpper20Immediate(imm) };
  }

  return fail(`Unsupported instruction "${op}".`);
}

function stripComment(line: string): string {
  return line.replace(/[#;].*$/, "");
}

function splitOnce(value: string, delimiter: string): [string, string] {
  const index = value.indexOf(delimiter);
  return [value.slice(0, index), value.slice(index + delimiter.length)];
}

function splitWhitespace(value: string): [string, string] {
  const match = /^(\S+)(?:\s+(.*))?$/.exec(value.trim());
  return [match?.[1] ?? "", match?.[2] ?? ""];
}

function parseRegister(token: string): RegisterIndex | null {
  const normalized = token.trim().toLowerCase();
  const xMatch = /^x([0-9]|[12][0-9]|3[01])$/.exec(normalized);
  if (xMatch) return toRegisterIndex(Number(xMatch[1]));
  const alias = REGISTER_ALIASES[normalized];
  return alias == null ? null : toRegisterIndex(alias);
}

function parseImmediate(token: string): number | null {
  const normalized = token.trim().toLowerCase();
  const value = /^-?0x[0-9a-f]+$/.test(normalized)
    ? Number.parseInt(normalized.replace("0x", ""), 16)
    : /^-?\d+$/.test(normalized)
      ? Number.parseInt(normalized, 10)
      : Number.NaN;
  return Number.isFinite(value) ? value : null;
}

function isSigned12(value: number): boolean {
  return Number.isInteger(value) && value >= SIGNED_12_MIN && value <= SIGNED_12_MAX;
}

function isAlignedInstructionAddress(value: ByteAddress): boolean {
  return value % INSTRUCTION_SIZE_BYTES === 0;
}

function isBranchOffset(value: number): boolean {
  return Number.isInteger(value) && value >= B_OFFSET_MIN && value <= B_OFFSET_MAX && value % 2 === 0;
}

function isJumpOffset(value: number): boolean {
  return Number.isInteger(value) && value >= J_OFFSET_MIN && value <= J_OFFSET_MAX && value % 2 === 0;
}

function isUpper20(value: number): boolean {
  return Number.isInteger(value) && value >= UPPER_20_MIN && value <= UPPER_20_MAX;
}

function parseMemoryOperand(token: string): { offset: number; base: RegisterIndex } | null {
  const match = /^(-?(?:0x[0-9a-f]+|\d+))\(([^)]+)\)$/i.exec(token.trim());
  if (!match) return null;
  const offset = parseImmediate(match[1]);
  const base = parseRegister(match[2]);
  if (offset == null || base == null) return null;
  return { offset, base };
}

function lookupLabel(labels: LabelTable, label: string): ByteAddress | undefined {
  return Object.prototype.hasOwnProperty.call(labels, label) ? labels[label] : undefined;
}
