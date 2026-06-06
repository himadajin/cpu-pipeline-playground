import { describe, expect, it } from "vitest";
import { assemble, createSimulation, runSimulation, stepSimulation } from "../../src/core";

function assembled(source: string) {
  const result = assemble(source);
  expect(result.errors).toEqual([]);
  return result.instructions;
}

describe("simulator", () => {
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
  });

  it("records forwarding events for ALU dependencies", () => {
    const program = assembled(`
addi x1, x0, 4
add x2, x1, x1
`);
    const simulation = runSimulation(createSimulation(program));
    expect(simulation.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "forward")).toBe(true);
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
    expect(simulation.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "stall")).toBe(true);
    expect(simulation.current.registers[4]).toBe(10);
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
    expect(simulation.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "flush")).toBe(true);
    expect(simulation.current.registers[2]).toBe(0);
    expect(simulation.current.registers[3]).toBe(7);
  });

  it("steps backward through history", async () => {
    const { stepBackSimulation } = await import("../../src/core");
    const program = assembled("addi x1, x0, 1\n");
    const once = stepSimulation(createSimulation(program));
    const back = stepBackSimulation(once);
    expect(back.current.cycle).toBe(0);
  });
});
