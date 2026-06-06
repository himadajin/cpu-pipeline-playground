import { describe, expect, it } from "vitest";
import { assemble, instructionSet } from "../../src/core";

describe("assembler", () => {
  it("assembles the initial instruction subset", () => {
    const source = `
addi x1, x0, 4
addi x2, x0, 7
add x3, x1, x2
sub x4, x3, x1
and x5, x4, x2
or x6, x5, x1
xor x7, x6, x2
sll x8, x7, x1
srl x9, x8, x1
sw x9, 0(x1)
lw x10, 0(x1)
beq x10, x9, done
bne x10, x0, done
blt x0, x10, done
jal x0, done
nop
done:
nop
`;
    const result = assemble(source);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.instructions.map((instruction) => instruction.op)).toEqual(expect.arrayContaining(instructionSet()));
  });

  it("reports unknown labels and instructions with line numbers", () => {
    const result = assemble("addi x1, x0, 1\nbeq x1, x0, missing\nbogus x2, x0, x1\n");
    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.line)).toEqual([2, 3]);
  });
});
