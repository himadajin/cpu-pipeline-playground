import { describe, expect, it } from "vitest";
import { assemble, instructionSet, RASK_RESET_PC } from "../../src/core";

describe("assembler", () => {
  it("assembles the initial instruction subset", () => {
    const source = `
addi x1, x0, 4
addi x2, x0, 7
add x3, x1, x2
sub x4, x3, x1
slt x5, x4, x2
sltu x5, x4, x2
slti x5, x4, -1
sltiu x5, x4, -1
andi x5, x4, 0xff
ori x5, x4, -1
xori x5, x4, 0x7ff
and x6, x4, x2
or x7, x6, x1
xor x8, x7, x2
sll x9, x8, x1
srl x10, x9, x1
sra x10, x9, x1
slli x10, x9, 1
srli x10, x9, 1
srai x10, x9, 1
sb x10, 1(x1)
sh x10, 2(x1)
sw x10, 0(x1)
lb x11, 1(x1)
lbu x11, 1(x1)
lh x11, 2(x1)
lhu x11, 2(x1)
lw x12, 0(x1)
beq x12, x10, done
bne x12, x0, done
blt x0, x12, done
bge x12, x0, done
bltu x0, x12, done
bgeu x12, x0, done
jal x0, done
jalr x13, 0(x1)
lui x14, 0x12345
auipc x15, 1
nop
done:
nop
`;
    const result = assemble(source);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(instructionSet()).toContain("nop");
    expect(result.instructions.map((instruction) => instruction.op)).not.toContain("nop");
    expect(result.instructions.map((instruction) => instruction.text)).toContain("nop");
  });

  it("reports unknown labels and instructions with line numbers", () => {
    const result = assemble("addi x1, x0, 1\nbeq x1, x0, missing\nbogus x2, x0, x1\n");
    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.line)).toEqual([2, 3]);
  });

  it("resolves labels to byte addresses", () => {
    const result = assemble("first:\naddi x1, x0, 1\nsecond:\naddi x2, x0, 2\n");
    expect(result.errors).toEqual([]);
    expect(result.labels).toEqual({ first: RASK_RESET_PC, second: RASK_RESET_PC + 4 });
    expect(result.executionImage.baseAddress).toBe(RASK_RESET_PC);
    expect(result.executionImage.instructions.map((instruction) => instruction.address)).toEqual([
      RASK_RESET_PC,
      RASK_RESET_PC + 4,
    ]);
  });

  it("normalizes nop to addi x0, x0, 0", () => {
    const result = assemble("nop\n");
    expect(result.errors).toEqual([]);
    expect(result.instructions[0]).toMatchObject({ op: "addi", rd: 0, rs1: 0, imm: 0, text: "nop" });
    expect(result.executionImage.instructions[0]).toMatchObject({
      address: RASK_RESET_PC,
      word: 0x00000013,
      expandedFrom: { line: 1, text: "nop" },
    });
  });

  it("validates signed 12-bit immediates for I-type ALU and memory offsets", () => {
    const result = assemble(
      "addi x1, x0, 2048\nslti x1, x0, 2048\nsltiu x1, x0, -2049\nandi x1, x0, 2048\nori x1, x0, -2049\nxori x1, x0, 1abc\nlb x2, 2048(x1)\nlbu x2, 2048(x1)\nlh x2, 2048(x1)\nlhu x2, -2049(x1)\nlw x2, -2049(x1)\nsb x2, -2049(x1)\nsh x2, 2048(x1)\nsw x2, 2048(x1)\naddi x3, x0, 1abc\n",
    );
    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(assemble("addi x1, x0, -0x800\n").errors).toEqual([]);
  });

  it("validates shift immediate amounts", () => {
    const result = assemble("slli x1, x2, 32\nsrli x1, x2, -1\nsrai x1, x2, 1abc\n");
    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.line)).toEqual([1, 2, 3]);
    expect(result.errors[0]?.message).toContain("5-bit");
    expect(assemble("slli x1, x2, 31\nsrli x3, x4, 0\nsrai x5, x6, 1\n").errors).toEqual([]);
  });

  it("parses compare and byte memory operands", () => {
    const result = assemble(
      "slt x1, x2, x3\nsltu x4, x5, x6\nslti x7, x8, -1\nsltiu x9, x10, 1\nandi x11, x12, 0xff\nori x13, x14, -1\nxori x15, x16, 1\nlb x17, -1(x18)\nlbu x19, 2(x20)\nlh x21, 4(x22)\nlhu x23, 6(x24)\nsb x25, 7(x26)\nsh x27, 8(x28)\n",
    );
    expect(result.errors).toEqual([]);
    expect(result.instructions[0]).toMatchObject({ op: "slt", rd: 1, rs1: 2, rs2: 3 });
    expect(result.instructions[1]).toMatchObject({ op: "sltu", rd: 4, rs1: 5, rs2: 6 });
    expect(result.instructions[2]).toMatchObject({ op: "slti", rd: 7, rs1: 8, imm: -1 });
    expect(result.instructions[3]).toMatchObject({ op: "sltiu", rd: 9, rs1: 10, imm: 1 });
    expect(result.instructions[4]).toMatchObject({ op: "andi", rd: 11, rs1: 12, imm: 0xff });
    expect(result.instructions[5]).toMatchObject({ op: "ori", rd: 13, rs1: 14, imm: -1 });
    expect(result.instructions[6]).toMatchObject({ op: "xori", rd: 15, rs1: 16, imm: 1 });
    expect(result.instructions[7]).toMatchObject({ op: "lb", rd: 17, rs1: 18, imm: -1 });
    expect(result.instructions[8]).toMatchObject({ op: "lbu", rd: 19, rs1: 20, imm: 2 });
    expect(result.instructions[9]).toMatchObject({ op: "lh", rd: 21, rs1: 22, imm: 4 });
    expect(result.instructions[10]).toMatchObject({ op: "lhu", rd: 23, rs1: 24, imm: 6 });
    expect(result.instructions[11]).toMatchObject({ op: "sb", rs1: 26, rs2: 25, imm: 7 });
    expect(result.instructions[12]).toMatchObject({ op: "sh", rs1: 28, rs2: 27, imm: 8 });
  });

  it("parses register and immediate shift operands", () => {
    const result = assemble("sra x1, x2, x3\nslli x4, x5, 31\nsrli x6, x7, 0\nsrai x8, x9, 1\n");
    expect(result.errors).toEqual([]);
    expect(result.instructions[0]).toMatchObject({ op: "sra", rd: 1, rs1: 2, rs2: 3 });
    expect(result.instructions[1]).toMatchObject({ op: "slli", rd: 4, rs1: 5, imm: 31 });
    expect(result.instructions[2]).toMatchObject({ op: "srli", rd: 6, rs1: 7, imm: 0 });
    expect(result.instructions[3]).toMatchObject({ op: "srai", rd: 8, rs1: 9, imm: 1 });
  });

  it("parses jalr with a signed 12-bit register offset", () => {
    const result = assemble("jalr x1, -4(x2)\n");
    expect(result.errors).toEqual([]);
    expect(result.instructions[0]).toMatchObject({ op: "jalr", rd: 1, rs1: 2, imm: -4 });

    const invalid = assemble("jalr x1, 2048(x2)\njalr x1, x2, 0\n");
    expect(invalid.ok).toBe(false);
    expect(invalid.errors.map((error) => error.line)).toEqual([1, 2]);
    expect(invalid.errors[0]?.message).toContain("signed 12-bit");
  });

  it("validates upper 20-bit immediates for lui and auipc", () => {
    const result = assemble("lui x1, 0xfffff\nauipc x2, 0\n");
    expect(result.errors).toEqual([]);
    expect(result.instructions[0]).toMatchObject({ op: "lui", rd: 1, imm: 0xfffff });
    expect(result.instructions[1]).toMatchObject({ op: "auipc", rd: 2, imm: 0 });

    const invalid = assemble("lui x1, 0x100000\nauipc x2, -1\n");
    expect(invalid.ok).toBe(false);
    expect(invalid.errors.map((error) => error.line)).toEqual([1, 2]);
    expect(invalid.errors.every((error) => error.message.includes("20-bit"))).toBe(true);
  });

  it("validates PC-relative branch target range", () => {
    const farBody = Array.from({ length: 1025 }, () => "addi x0, x0, 0").join("\n");
    const result = assemble(`beq x0, x0, far\n${farBody}\nfar:\naddi x1, x0, 1\n`);
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.message).toContain("signed 13-bit");
  });

  it("validates PC-relative jal target range", () => {
    const farBody = Array.from({ length: 262_145 }, () => "addi x0, x0, 0").join("\n");
    const result = assemble(`jal x0, far\n${farBody}\nfar:\naddi x1, x0, 1\n`);
    expect(result.ok).toBe(false);
    expect(result.errors[0]?.message).toContain("signed 21-bit");
  });

  it("keeps system and ordering instructions out of scope for now", () => {
    const result = assemble("ecall\nebreak\nfence\n");
    expect(result.ok).toBe(false);
    expect(result.errors).toHaveLength(3);
    expect(result.errors.every((error) => error.message.startsWith("Unknown instruction"))).toBe(true);
  });
});
