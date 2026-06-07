import { describe, expect, it } from "vitest";
import { assemble, createSimulation, runSimulation, stepSimulation } from "../../src/core";

function assembled(source: string) {
  const result = assemble(source);
  expect(result.errors).toEqual([]);
  return result.instructions;
}

describe("simulator", () => {
  it("accepts initial architectural state while keeping x0 hardwired to zero", () => {
    const simulation = createSimulation(assembled("lw x2, 0(x1)\n"), {
      registers: { 0: 123, 1: 16 },
      memory: { 16: 42, 17: 0, 18: 0, 19: 0 },
    });

    const result = runSimulation(simulation);
    expect(result.current.registers[0]).toBe(0);
    expect(result.current.registers[1]).toBe(16);
    expect(result.current.registers[2]).toBe(42);
  });

  it("commits register and memory updates", () => {
    const program = assembled(`
addi x1, x0, 8
addi x2, x0, 42
sw x2, 0(x1)
lw x3, 0(x1)
`);
    const simulation = runSimulation(createSimulation(program));
    expect(simulation.current.registers[1]).toBe(8);
    expect(simulation.current.registers[2]).toBe(42);
    expect(simulation.current.registers[3]).toBe(42);
    expect(simulation.current.memory[8]).toBe(42);
    expect(simulation.current.memory[9]).toBe(0);
    expect(simulation.current.memory[10]).toBe(0);
    expect(simulation.current.memory[11]).toBe(0);
  });

  it("records forwarding events for ALU dependencies", () => {
    const program = assembled(`
addi x1, x0, 4
add x2, x1, x1
`);
    const simulation = runSimulation(createSimulation(program));
    expect(simulation.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "forward")).toBe(
      true,
    );
    expect(simulation.current.registers[2]).toBe(8);
  });

  it("stalls on load-use hazards", () => {
    const program = assembled(`
addi x1, x0, 12
addi x2, x0, 5
sw x2, 0(x1)
lw x3, 0(x1)
add x4, x3, x2
`);
    const simulation = runSimulation(createSimulation(program));
    expect(simulation.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "stall")).toBe(
      true,
    );
    expect(simulation.current.registers[4]).toBe(10);
  });

  it("forwards ALU results into store data", () => {
    const program = assembled(`
addi x1, x0, 16
addi x2, x0, 41
addi x3, x2, 1
sw x3, 0(x1)
`);
    const simulation = runSimulation(createSimulation(program));
    expect(simulation.current.memory[16]).toBe(42);
    expect(simulation.current.memory[17]).toBe(0);
    expect(simulation.current.memory[18]).toBe(0);
    expect(simulation.current.memory[19]).toBe(0);
  });

  it("preserves fetched instructions while a load-use stall holds decode", () => {
    const program = assembled(`
addi x1, x0, 16
addi x2, x0, 42
sw x2, 0(x1)
lw x3, 0(x1)
addi x4, x3, 1
sw x4, 4(x1)
`);
    const simulation = runSimulation(createSimulation(program));
    expect(simulation.current.registers[4]).toBe(43);
    expect(simulation.current.memory[20]).toBe(43);
  });

  it("flushes younger instructions after a taken branch", () => {
    const program = assembled(`
addi x1, x0, 1
beq x1, x1, done
addi x2, x0, 99
done:
addi x3, x0, 7
`);
    const simulation = runSimulation(createSimulation(program));
    expect(simulation.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "flush")).toBe(
      true,
    );
    expect(simulation.current.registers[2]).toBe(0);
    expect(simulation.current.registers[3]).toBe(7);
  });

  it("uses byte-addressed PC targets and jal writes pc plus 4", () => {
    const program = assembled(`
jal x1, target
addi x2, x0, 99
target:
addi x3, x0, 7
`);
    const simulation = runSimulation(createSimulation(program));
    expect(program[0]?.op).toBe("jal");
    if (program[0]?.op !== "jal") throw new Error("expected jal instruction");
    expect(program[0].target).toBe(8);
    expect(simulation.current.registers[1]).toBe(4);
    expect(simulation.current.registers[2]).toBe(0);
    expect(simulation.current.registers[3]).toBe(7);
  });

  it("executes jalr as register-based control flow and writes pc plus 4", () => {
    const program = assembled(`
addi x2, x0, 16
jalr x1, 0(x2)
addi x3, x0, 99
addi x4, x0, 99
target:
addi x5, x0, 7
`);
    const simulation = runSimulation(createSimulation(program));
    expect(simulation.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "flush")).toBe(
      true,
    );
    expect(simulation.current.registers[1]).toBe(8);
    expect(simulation.current.registers[3]).toBe(0);
    expect(simulation.current.registers[4]).toBe(0);
    expect(simulation.current.registers[5]).toBe(7);
  });

  it("clears bit zero for jalr targets and halts on misaligned instruction addresses", () => {
    const clearBitZero = runSimulation(
      createSimulation(
        assembled(`
jalr x1, 0(x2)
addi x3, x0, 99
target:
addi x4, x0, 7
`),
        { registers: { 2: 9 } },
      ),
    );
    expect(clearBitZero.current.registers[1]).toBe(4);
    expect(clearBitZero.current.registers[3]).toBe(0);
    expect(clearBitZero.current.registers[4]).toBe(7);

    const misaligned = runSimulation(createSimulation(assembled("jalr x1, 0(x2)\n"), { registers: { 2: 11 } }));
    expect(misaligned.current.halted).toBe(true);
    expect(misaligned.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "error")).toBe(
      true,
    );
  });

  it("stalls when jalr depends on a loaded source register", () => {
    const program = assembled(`
addi x1, x0, 16
lw x2, 0(x1)
jalr x3, 0(x2)
addi x4, x0, 99
target:
addi x5, x0, 1
`);
    const simulation = runSimulation(createSimulation(program, { memory: { 16: 16, 17: 0, 18: 0, 19: 0 } }));

    expect(simulation.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "stall")).toBe(
      true,
    );
    expect(simulation.current.registers[3]).toBe(12);
    expect(simulation.current.registers[4]).toBe(0);
    expect(simulation.current.registers[5]).toBe(1);
  });

  it("executes upper-immediate instructions with byte-addressed pc", () => {
    const program = assembled(`
lui x1, 0x80000
auipc x2, 1
`);
    const simulation = runSimulation(createSimulation(program));
    expect(simulation.current.registers[1]).toBe(-2147483648);
    expect(simulation.current.registers[2]).toBe(0x1004);
  });

  it("uses instruction forms for writeback and source register behavior", () => {
    const program = assembled(`
addi x1, x0, 16
addi x2, x0, 4
sw x2, 0(x1)
lw x3, 0(x1)
add x4, x2, x3
jal x5, done
jalr x7, 0(x1)
done:
addi x6, x0, 1
`);
    const simulation = runSimulation(createSimulation(program));
    const commitEvents = simulation.history.flatMap((snapshot) =>
      snapshot.events.filter((event) => event.kind === "commit"),
    );

    expect(commitEvents.some((event) => event.instructionId === program[2]?.id)).toBe(false);
    expect(commitEvents.some((event) => event.instructionId === program[3]?.id)).toBe(true);
    expect(commitEvents.some((event) => event.instructionId === program[4]?.id)).toBe(true);
    expect(commitEvents.some((event) => event.instructionId === program[5]?.id)).toBe(true);
    expect(commitEvents.some((event) => event.instructionId === program[6]?.id)).toBe(false);
    expect(simulation.current.registers[5]).toBe(24);
  });

  it("does not treat jal as a load-use source register consumer", () => {
    const program = assembled(`
addi x1, x0, 16
lw x2, 0(x1)
jal x3, done
done:
addi x4, x0, 1
`);
    const simulation = runSimulation(createSimulation(program, { memory: { 16: 1, 17: 0, 18: 0, 19: 0 } }));

    expect(simulation.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "stall")).toBe(
      false,
    );
    expect(simulation.current.registers[3]).toBe(12);
  });

  it("wraps ALU results to 32 bits", () => {
    const add = runSimulation(createSimulation(assembled("add x2, x1, x1\n"), { registers: { 1: 0x7fffffff } }));
    expect(add.current.registers[2]).toBe(-2);

    const sub = runSimulation(createSimulation(assembled("sub x2, x0, x1\n"), { registers: { 1: -2147483648 } }));
    expect(sub.current.registers[2]).toBe(-2147483648);
  });

  it("uses signed int32 comparison for blt", () => {
    const program = assembled(`
blt x1, x2, target
addi x3, x0, 99
target:
addi x4, x0, 1
`);
    const simulation = runSimulation(createSimulation(program, { registers: { 1: -1, 2: 1 } }));
    expect(simulation.current.registers[3]).toBe(0);
    expect(simulation.current.registers[4]).toBe(1);
  });

  it("executes signed and unsigned branch comparisons", () => {
    const program = assembled(`
bge x1, x2, bge_false
addi x3, x0, 1
bge_false:
bge x2, x1, bge_true
addi x4, x0, 1
bge_true:
bltu x1, x2, bltu_false
addi x5, x0, 1
bltu_false:
bltu x2, x1, bltu_true
addi x6, x0, 1
bltu_true:
bgeu x2, x1, bgeu_false
addi x7, x0, 1
bgeu_false:
bgeu x1, x2, bgeu_true
addi x8, x0, 1
bgeu_true:
addi x9, x0, 1
`);
    const simulation = runSimulation(createSimulation(program, { registers: { 1: -1, 2: 1 } }));
    expect(simulation.current.registers[3]).toBe(1);
    expect(simulation.current.registers[4]).toBe(0);
    expect(simulation.current.registers[5]).toBe(1);
    expect(simulation.current.registers[6]).toBe(0);
    expect(simulation.current.registers[7]).toBe(1);
    expect(simulation.current.registers[8]).toBe(0);
    expect(simulation.current.registers[9]).toBe(1);
  });

  it("uses unsigned uint32 comparison for sltu", () => {
    const program = assembled(`
sltu x3, x1, x2
sltu x4, x2, x1
`);
    const simulation = runSimulation(createSimulation(program, { registers: { 1: -1, 2: 1 } }));
    expect(simulation.current.registers[3]).toBe(0);
    expect(simulation.current.registers[4]).toBe(1);
  });

  it("executes signed and immediate compare instructions", () => {
    const program = assembled(`
slt x3, x1, x2
slt x4, x2, x1
slti x5, x1, 1
slti x6, x2, -1
sltiu x7, x1, 1
sltiu x8, x2, -1
`);
    const simulation = runSimulation(createSimulation(program, { registers: { 1: -1, 2: 1 } }));
    expect(simulation.current.registers[3]).toBe(1);
    expect(simulation.current.registers[4]).toBe(0);
    expect(simulation.current.registers[5]).toBe(1);
    expect(simulation.current.registers[6]).toBe(0);
    expect(simulation.current.registers[7]).toBe(0);
    expect(simulation.current.registers[8]).toBe(1);
  });

  it("executes immediate bitwise logic with signed 12-bit immediates", () => {
    const program = assembled(`
andi x2, x1, 0xff
ori x3, x1, -1
xori x4, x1, 0x7ff
`);
    const simulation = runSimulation(createSimulation(program, { registers: { 1: 0x12345678 } }));
    expect(simulation.current.registers[2]).toBe(0x78);
    expect(simulation.current.registers[3]).toBe(-1);
    expect(simulation.current.registers[4]).toBe(0x12345187);
  });

  it("executes register and immediate shift instructions", () => {
    const program = assembled(`
sra x3, x1, x2
slli x4, x1, 1
srli x5, x1, 1
srai x6, x1, 1
`);
    const simulation = runSimulation(createSimulation(program, { registers: { 1: -8, 2: 1 } }));
    expect(simulation.current.registers[3]).toBe(-4);
    expect(simulation.current.registers[4]).toBe(-16);
    expect(simulation.current.registers[5]).toBe(0x7ffffffc);
    expect(simulation.current.registers[6]).toBe(-4);
  });

  it("loads signed bytes from byte memory", () => {
    const simulation = runSimulation(
      createSimulation(assembled("lb x2, 1(x1)\nlb x3, 2(x1)\n"), {
        registers: { 1: 16 },
        memory: { 17: 0xff, 18: 0x7f },
      }),
    );
    expect(simulation.current.registers[2]).toBe(-1);
    expect(simulation.current.registers[3]).toBe(127);
  });

  it("stores one byte at unaligned byte addresses and records one byte diff", () => {
    const simulation = runSimulation(
      createSimulation(assembled("sb x2, 1(x1)\n"), {
        registers: { 1: 16, 2: 0x12345678 },
        memory: { 16: 0xaa, 17: 0xbb, 18: 0xcc },
      }),
    );
    expect(simulation.current.memory[16]).toBe(0xaa);
    expect(simulation.current.memory[17]).toBe(0x78);
    expect(simulation.current.memory[18]).toBe(0xcc);
    expect(simulation.history.flatMap((snapshot) => snapshot.memoryDiffs)).toEqual([
      { address: 17, before: 0xbb, after: 0x78 },
    ]);
    expect(simulation.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "error")).toBe(
      false,
    );
  });

  it("stalls when an instruction depends on a loaded byte", () => {
    const program = assembled(`
lb x2, 1(x1)
addi x3, x2, 1
`);
    const simulation = runSimulation(
      createSimulation(program, {
        registers: { 1: 16 },
        memory: { 17: 0x7f },
      }),
    );
    expect(simulation.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "stall")).toBe(
      true,
    );
    expect(simulation.current.registers[3]).toBe(128);
  });

  it("loads little-endian words from byte memory", () => {
    const simulation = runSimulation(
      createSimulation(assembled("lw x2, 0(x1)\n"), {
        registers: { 1: 16 },
        memory: { 16: 0x78, 17: 0x56, 18: 0x34, 19: 0x12 },
      }),
    );
    expect(simulation.current.registers[2]).toBe(0x12345678);
  });

  it("stores little-endian words and records byte diffs", () => {
    const simulation = runSimulation(
      createSimulation(assembled("sw x2, 0(x1)\n"), { registers: { 1: 16, 2: 0x12345678 } }),
    );
    expect(simulation.current.memory[16]).toBe(0x78);
    expect(simulation.current.memory[17]).toBe(0x56);
    expect(simulation.current.memory[18]).toBe(0x34);
    expect(simulation.current.memory[19]).toBe(0x12);
    expect(simulation.history.flatMap((snapshot) => snapshot.memoryDiffs)).toEqual([
      { address: 16, before: 0, after: 0x78 },
      { address: 17, before: 0, after: 0x56 },
      { address: 18, before: 0, after: 0x34 },
      { address: 19, before: 0, after: 0x12 },
    ]);
  });

  it("halts with an error event on unaligned word memory access", () => {
    const load = runSimulation(createSimulation(assembled("lw x2, 0(x1)\n"), { registers: { 1: 18 } }));
    expect(load.current.halted).toBe(true);
    expect(load.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "error")).toBe(true);

    const store = runSimulation(createSimulation(assembled("sw x2, 0(x1)\n"), { registers: { 1: 18, 2: 1 } }));
    expect(store.current.halted).toBe(true);
    expect(store.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "error")).toBe(true);
  });

  it("steps backward through history", async () => {
    const { stepBackSimulation } = await import("../../src/core");
    const program = assembled("addi x1, x0, 1\n");
    const once = stepSimulation(createSimulation(program));
    const back = stepBackSimulation(once);
    expect(back.current.cycle).toBe(0);
  });
});
