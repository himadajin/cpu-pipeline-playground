import type { AssembleError, AssembleResult, Instruction, Opcode } from "./types";

const INSTRUCTION_SET = new Set<Opcode>([
  "add",
  "sub",
  "addi",
  "lw",
  "sw",
  "beq",
  "bne",
  "blt",
  "jal",
  "nop",
  "and",
  "or",
  "xor",
  "sll",
  "srl",
]);

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
}

export function assemble(source: string): AssembleResult {
  const labels: Record<string, number> = {};
  const errors: AssembleError[] = [];
  const parsedLines: ParsedLine[] = [];
  let pc = 0;

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

    parsedLines.push({ line, text, body });
    pc += 1;
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

export function instructionSet(): Opcode[] {
  return Array.from(INSTRUCTION_SET);
}

function parseInstruction(
  parsed: ParsedLine,
  id: number,
  labels: Record<string, number>,
  errors: AssembleError[],
): Instruction | null {
  const [opToken, rest = ""] = splitWhitespace(parsed.body);
  const op = opToken.toLowerCase() as Opcode;
  if (!INSTRUCTION_SET.has(op)) {
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
    op,
    source: { line: parsed.line, text: parsed.text },
    text: parsed.body,
  };

  if (op === "nop") {
    if (args.length !== 0) return fail("nop does not take operands.");
    return base;
  }

  if (["add", "sub", "and", "or", "xor", "sll", "srl"].includes(op)) {
    if (args.length !== 3) return fail(`${op} expects rd, rs1, rs2.`);
    const rd = parseRegister(args[0]);
    const rs1 = parseRegister(args[1]);
    const rs2 = parseRegister(args[2]);
    if (rd == null || rs1 == null || rs2 == null) return fail(`Invalid register in "${parsed.body}".`);
    return { ...base, rd, rs1, rs2 };
  }

  if (op === "addi") {
    if (args.length !== 3) return fail("addi expects rd, rs1, imm.");
    const rd = parseRegister(args[0]);
    const rs1 = parseRegister(args[1]);
    const imm = parseImmediate(args[2]);
    if (rd == null || rs1 == null || imm == null) return fail(`Invalid addi operands in "${parsed.body}".`);
    return { ...base, rd, rs1, imm };
  }

  if (op === "lw") {
    if (args.length !== 2) return fail("lw expects rd, offset(rs1).");
    const rd = parseRegister(args[0]);
    const memory = parseMemoryOperand(args[1]);
    if (rd == null || !memory) return fail(`Invalid lw operands in "${parsed.body}".`);
    return { ...base, rd, rs1: memory.base, imm: memory.offset };
  }

  if (op === "sw") {
    if (args.length !== 2) return fail("sw expects rs2, offset(rs1).");
    const rs2 = parseRegister(args[0]);
    const memory = parseMemoryOperand(args[1]);
    if (rs2 == null || !memory) return fail(`Invalid sw operands in "${parsed.body}".`);
    return { ...base, rs1: memory.base, rs2, imm: memory.offset };
  }

  if (["beq", "bne", "blt"].includes(op)) {
    if (args.length !== 3) return fail(`${op} expects rs1, rs2, label.`);
    const rs1 = parseRegister(args[0]);
    const rs2 = parseRegister(args[1]);
    const target = labels[args[2]];
    if (rs1 == null || rs2 == null) return fail(`Invalid branch registers in "${parsed.body}".`);
    if (target === undefined) return fail(`Unknown label "${args[2]}".`);
    return { ...base, rs1, rs2, target, label: args[2] };
  }

  if (op === "jal") {
    if (args.length !== 2) return fail("jal expects rd, label.");
    const rd = parseRegister(args[0]);
    const target = labels[args[1]];
    if (rd == null) return fail(`Invalid jal destination in "${parsed.body}".`);
    if (target === undefined) return fail(`Unknown label "${args[1]}".`);
    return { ...base, rd, target, label: args[1] };
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

function parseRegister(token: string): number | null {
  const normalized = token.trim().toLowerCase();
  const xMatch = /^x([0-9]|[12][0-9]|3[01])$/.exec(normalized);
  if (xMatch) return Number(xMatch[1]);
  return REGISTER_ALIASES[normalized] ?? null;
}

function parseImmediate(token: string): number | null {
  const normalized = token.trim().toLowerCase();
  const value = normalized.startsWith("0x") ? Number.parseInt(normalized, 16) : Number.parseInt(normalized, 10);
  return Number.isFinite(value) ? value : null;
}

function parseMemoryOperand(token: string): { offset: number; base: number } | null {
  const match = /^(-?(?:0x[0-9a-f]+|\d+))\(([^)]+)\)$/i.exec(token.trim());
  if (!match) return null;
  const offset = parseImmediate(match[1]);
  const base = parseRegister(match[2]);
  if (offset == null || base == null) return null;
  return { offset, base };
}
