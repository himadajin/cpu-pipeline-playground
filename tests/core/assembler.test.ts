import { describe, expect, it } from "vitest";
import { assemble, instructionSet } from "../../src/core";

describe("assembler", () => {
  it("assembles the initial instruction subset", () => {
    const source = `
addi x1, x0, 4
addi x2, x0, 7
add x3, x1, x2
sub x4, x3, x1
sltu x5, x4, x2
and x6, x4, x2
or x7, x6, x1
xor x8, x7, x2
sll x9, x8, x1
srl x10, x9, x1
sb x10, 1(x1)
sw x10, 0(x1)
lb x11, 1(x1)
lw x12, 0(x1)
beq x12, x10, done
bne x12, x0, done
blt x0, x12, done
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
    expect(result.labels).toEqual({ first: 0, second: 4 });
  });

  it("normalizes nop to addi x0, x0, 0", () => {
    const result = assemble("nop\n");
    expect(result.errors).toEqual([]);
    expect(result.instructions[0]).toMatchObject({ op: "addi", rd: 0, rs1: 0, imm: 0, text: "nop" });
  });

  it("validates signed 12-bit immediates for addi and memory offsets", () => {
    const result = assemble(
      "addi x1, x0, 2048\nlb x2, 2048(x1)\nlw x2, -2049(x1)\nsb x2, -2049(x1)\nsw x2, 2048(x1)\naddi x3, x0, 1abc\n",
    );
    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.line)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(assemble("addi x1, x0, -0x800\n").errors).toEqual([]);
  });

  it("parses sltu and byte memory operands", () => {
    const result = assemble("sltu x1, x2, x3\nlb x4, -1(x5)\nsb x6, 7(x8)\n");
    expect(result.errors).toEqual([]);
    expect(result.instructions[0]).toMatchObject({ op: "sltu", rd: 1, rs1: 2, rs2: 3 });
    expect(result.instructions[1]).toMatchObject({ op: "lb", rd: 4, rs1: 5, imm: -1 });
    expect(result.instructions[2]).toMatchObject({ op: "sb", rs1: 8, rs2: 6, imm: 7 });
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
