import { describe, expect, it } from "vitest";
import {
  assemble,
  createSimulation,
  formatPipelineOccupancyTable,
  formatRetireLog,
  RASK_RAM_LIMIT_EXCLUSIVE,
  RASK_RESET_PC,
  RASK_UART_DATA_ADDRESS,
  runSimulation,
  stepSimulation,
  type ExecutionImage,
} from "../../src/core";
import { toByteAddress, toInstructionWord } from "../../src/core/numbers";

const RESET_LINK = -2147483648;
const DATA_ADDRESS = RASK_RESET_PC + 0x10000;
const JAL_X0_ZERO = 0x0000006f;

function assembled(source: string) {
  const result = assemble(source);
  expect(result.errors).toEqual([]);
  return result.instructions;
}

function eventCount(simulation: ReturnType<typeof runSimulation>, kind: "stall" | "flush") {
  return simulation.history.flatMap((snapshot) => snapshot.events).filter((event) => event.kind === kind).length;
}

function occupancyBySeq(simulation: ReturnType<typeof runSimulation>): Record<number, string> {
  const maxCycle = simulation.current.cycle;
  const symbol = { IF: "F", ID: "D", EX: "X", MEM: "M", WB: "W" } as const;
  const rows: Record<number, string[]> = {};
  for (const snapshot of simulation.history.slice(1)) {
    for (const cell of snapshot.timeline) {
      rows[cell.seqId] ??= Array.from({ length: maxCycle }, () => ".");
      rows[cell.seqId][cell.cycle - 1] = symbol[cell.stage];
    }
  }
  return Object.fromEntries(
    Object.entries(rows).map(([seqId, cells]) => [Number(seqId), cells.join("").replace(/\.+$/, "")]),
  );
}

describe("simulator", () => {
  it("accepts initial architectural state while keeping x0 hardwired to zero", () => {
    const simulation = createSimulation(assembled("lw x2, 0(x1)\n"), {
      registers: { 0: 123, 1: DATA_ADDRESS },
      memory: { [DATA_ADDRESS]: 42, [DATA_ADDRESS + 1]: 0, [DATA_ADDRESS + 2]: 0, [DATA_ADDRESS + 3]: 0 },
    });

    const result = runSimulation(simulation);
    expect(result.current.registers[0]).toBe(0);
    expect(result.current.registers[1]).toBe(RESET_LINK + 0x10000);
    expect(result.current.registers[2]).toBe(42);
  });

  it("retires register and memory updates", () => {
    const program = assembled(`
lui x1, 0x80010
addi x2, x0, 42
sw x2, 0(x1)
lw x3, 0(x1)
`);
    const simulation = runSimulation(createSimulation(program));
    expect(simulation.current.registers[1]).toBe(RESET_LINK + 0x10000);
    expect(simulation.current.registers[2]).toBe(42);
    expect(simulation.current.registers[3]).toBe(42);
    expect(simulation.current.memory[DATA_ADDRESS]).toBe(42);
    expect(simulation.current.memory[DATA_ADDRESS + 1]).toBe(0);
    expect(simulation.current.memory[DATA_ADDRESS + 2]).toBe(0);
    expect(simulation.current.memory[DATA_ADDRESS + 3]).toBe(0);
  });

  it("stalls on ALU dependencies without forwarding", () => {
    const program = assembled(`
addi x1, x0, 4
add x2, x1, x1
`);
    const simulation = runSimulation(createSimulation(program));
    expect(eventCount(simulation, "stall")).toBe(3);
    expect(
      simulation.history.flatMap((snapshot) => snapshot.events).some((event) => (event.kind as string) === "forward"),
    ).toBe(false);
    expect(simulation.current.registers[2]).toBe(8);
  });

  it("stalls on load-use hazards", () => {
    const program = assembled(`
lui x1, 0x80010
addi x2, x0, 5
sw x2, 0(x1)
lw x3, 0(x1)
add x4, x3, x2
`);
    const simulation = runSimulation(createSimulation(program));
    expect(eventCount(simulation, "stall")).toBeGreaterThanOrEqual(3);
    expect(simulation.current.registers[4]).toBe(10);
  });

  it("stalls for store data dependencies before writing memory", () => {
    const program = assembled(`
lui x1, 0x80010
addi x2, x0, 41
addi x3, x2, 1
sw x3, 0(x1)
`);
    const simulation = runSimulation(createSimulation(program));
    expect(eventCount(simulation, "stall")).toBeGreaterThanOrEqual(3);
    expect(simulation.current.memory[DATA_ADDRESS]).toBe(42);
    expect(simulation.current.memory[DATA_ADDRESS + 1]).toBe(0);
    expect(simulation.current.memory[DATA_ADDRESS + 2]).toBe(0);
    expect(simulation.current.memory[DATA_ADDRESS + 3]).toBe(0);
  });

  it("preserves fetched instructions while a load-use stall holds decode", () => {
    const program = assembled(`
lui x1, 0x80010
addi x2, x0, 42
sw x2, 0(x1)
lw x3, 0(x1)
addi x4, x3, 1
sw x4, 4(x1)
`);
    const simulation = runSimulation(createSimulation(program));
    expect(simulation.current.registers[4]).toBe(43);
    expect(simulation.current.memory[DATA_ADDRESS + 4]).toBe(43);
  });

  it("stalls branches until compared source registers retire", () => {
    const simulation = runSimulation(
      createSimulation(
        assembled(`
addi x1, x0, 1
beq x1, x1, target
addi x2, x0, 99
target:
addi x3, x0, 7
`),
      ),
    );

    expect(eventCount(simulation, "stall")).toBe(3);
    expect(eventCount(simulation, "flush")).toBeGreaterThan(0);
    expect(simulation.current.registers[2]).toBe(0);
    expect(simulation.current.registers[3]).toBe(7);
  });

  it("separates the during-cycle stage view from end-of-cycle latches while keeping bubbles distinct from real nop", () => {
    const simulation = stepSimulation(createSimulation(assembled("nop\naddi x1, x0, 1\n")));

    expect(simulation.current.stages.IF?.instruction.text).toBe("nop");
    expect(simulation.current.stages.ID).toBeNull();
    expect(simulation.current.ifSlot).toBeNull();
    expect(simulation.current.latches.ifId?.instruction.text).toBe("nop");
    expect(simulation.current.latches.ifId?.instruction).toMatchObject({ op: "addi", rd: 0, rs1: 0, imm: 0 });
  });

  it("assigns seqId at fetch and does not reuse ids after a flush", () => {
    const simulation = runSimulation(
      createSimulation(
        assembled(`
jal x0, target
addi x1, x0, 1
target:
addi x2, x0, 2
`),
      ),
    );
    const slots = simulation.history
      .flatMap((snapshot) => Object.values(snapshot.stages))
      .filter((slot) => slot != null);
    const seenBySeqId = new Map(slots.map((slot) => [slot.seqId, slot.instruction.text]));

    expect(Array.from(seenBySeqId.keys())).toEqual([0, 1, 2, 3]);
    expect(seenBySeqId.get(1)).toBe("addi x1, x0, 1");
    expect(seenBySeqId.get(2)).toBe("addi x2, x0, 2");
    expect(seenBySeqId.get(3)).toBe("addi x2, x0, 2");
    expect(simulation.current.nextSeqId).toBe(4);
  });

  it("matches the representative hazard occupancy golden", () => {
    const simulation = runSimulation(
      createSimulation(
        assembled(`
addi x5, x0, 3
add x6, x5, x5
beq x6, x6, target
addi x7, x0, 1
target:
addi x8, x0, 2
`),
      ),
    );

    expect(occupancyBySeq(simulation)).toMatchObject({
      0: "FDXMW",
      1: ".FDDDDXMW",
      2: "..FFFFDDDDXMW",
      3: "......FFFFD",
      4: "..........F",
      5: "...........FDXMW",
    });
    expect(formatPipelineOccupancyTable(simulation.current)).toBe(
      [
        "S0 80000000 FDXMW",
        "S1 80000004 .FDDDDXMW",
        "S2 80000008 ..FFFFDDDDXMW",
        "S3 8000000c ......FFFFD",
        "S4 80000010 ..........F",
        "S5 80000010 ...........FDXMW",
      ].join("\n"),
    );
    expect(formatRetireLog(simulation.current)).toBe(
      [
        "80000000 00300293 x05=00000003",
        "80000004 00528333 x06=00000006",
        "80000008 00630463",
        "80000010 00200413 x08=00000002",
      ].join("\n"),
    );
  });

  it("lets redirect win when a younger stalled instruction would otherwise hold fetch", () => {
    const simulation = runSimulation(
      createSimulation(
        assembled(`
addi x1, x0, 1
add x2, x1, x1
beq x0, x0, target
add x3, x2, x2
target:
addi x4, x0, 4
`),
      ),
    );
    const branchCycles = new Set(
      simulation.history
        .flatMap((snapshot) => snapshot.events)
        .filter((event) => event.kind === "branch")
        .map((event) => event.cycle),
    );
    const competingStalls = simulation.history
      .flatMap((snapshot) => snapshot.events)
      .filter((event) => event.kind === "stall" && branchCycles.has(event.cycle));

    expect(branchCycles.size).toBeGreaterThan(0);
    expect(competingStalls).toEqual([]);
    expect(simulation.current.registers[3]).toBe(0);
    expect(simulation.current.registers[4]).toBe(4);
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
    expect(program[0].target).toBe(RASK_RESET_PC + 8);
    expect(simulation.current.registers[1]).toBe(RESET_LINK + 4);
    expect(simulation.current.registers[2]).toBe(0);
    expect(simulation.current.registers[3]).toBe(7);
  });

  it("executes jalr as register-based control flow and writes pc plus 4", () => {
    const program = assembled(`
lui x2, 0x80000
addi x2, x2, 16
jalr x1, 0(x2)
addi x3, x0, 99
target:
addi x5, x0, 7
`);
    const simulation = runSimulation(createSimulation(program));
    expect(simulation.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "flush")).toBe(
      true,
    );
    expect(simulation.current.registers[1]).toBe(RESET_LINK + 12);
    expect(simulation.current.registers[3]).toBe(0);
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
        { registers: { 2: RESET_LINK + 9 } },
      ),
    );
    expect(clearBitZero.current.registers[1]).toBe(RESET_LINK + 4);
    expect(clearBitZero.current.registers[3]).toBe(0);
    expect(clearBitZero.current.registers[4]).toBe(7);

    const misaligned = runSimulation(
      createSimulation(assembled("jalr x1, 0(x2)\n"), { registers: { 2: RESET_LINK + 11 } }),
    );
    expect(misaligned.current.halted).toBe(true);
    expect(misaligned.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "error")).toBe(
      true,
    );
    // The jalr itself redirects and retires normally (writing its link value);
    // the error belongs to the instruction fetched at the misaligned target.
    expect(misaligned.current.registers[1]).toBe(RESET_LINK + 4);
    expect(misaligned.current.terminalRecord).toMatchObject({
      kind: "error",
      errorKind: "fetch-misaligned",
      pc: 0x8000000a,
      instructionWord: null,
    });
    expect(formatRetireLog(misaligned.current).split("\n").at(-1)).toBe("ERROR fetch-misaligned 8000000a --------");
  });

  it("stalls when jalr depends on a loaded source register", () => {
    const program = assembled(`
lui x1, 0x80010
lw x2, 0(x1)
jalr x3, 0(x2)
addi x4, x0, 99
target:
addi x5, x0, 1
`);
    const simulation = runSimulation(
      createSimulation(program, {
        memory: { [DATA_ADDRESS]: 16, [DATA_ADDRESS + 1]: 0, [DATA_ADDRESS + 2]: 0, [DATA_ADDRESS + 3]: 128 },
      }),
    );

    expect(simulation.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "stall")).toBe(
      true,
    );
    expect(simulation.current.registers[3]).toBe(RESET_LINK + 12);
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
    expect(simulation.current.registers[2]).toBe(RESET_LINK + 0x1004);
  });

  it("uses instruction forms for writeback and source register behavior", () => {
    const program = assembled(`
lui x1, 0x80010
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
    const retireEvents = simulation.history.flatMap((snapshot) =>
      snapshot.events.filter((event) => event.kind === "retire"),
    );

    expect(retireEvents.some((event) => event.instructionId === program[2]?.id)).toBe(false);
    expect(retireEvents.some((event) => event.instructionId === program[3]?.id)).toBe(true);
    expect(retireEvents.some((event) => event.instructionId === program[4]?.id)).toBe(true);
    expect(retireEvents.some((event) => event.instructionId === program[5]?.id)).toBe(true);
    expect(retireEvents.some((event) => event.instructionId === program[6]?.id)).toBe(false);
    expect(simulation.current.registers[5]).toBe(RESET_LINK + 24);
  });

  it("does not treat jal as a load-use source register consumer", () => {
    const program = assembled(`
lw x2, 0(x1)
jal x3, done
done:
addi x4, x0, 1
`);
    const simulation = runSimulation(
      createSimulation(program, {
        registers: { 1: DATA_ADDRESS },
        memory: { [DATA_ADDRESS]: 1, [DATA_ADDRESS + 1]: 0, [DATA_ADDRESS + 2]: 0, [DATA_ADDRESS + 3]: 0 },
      }),
    );

    expect(simulation.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "stall")).toBe(
      false,
    );
    expect(simulation.current.registers[3]).toBe(RESET_LINK + 8);
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
        registers: { 1: DATA_ADDRESS },
        memory: { [DATA_ADDRESS + 1]: 0xff, [DATA_ADDRESS + 2]: 0x7f },
      }),
    );
    expect(simulation.current.registers[2]).toBe(-1);
    expect(simulation.current.registers[3]).toBe(127);
  });

  it("loads zero-extended bytes and signed or zero-extended halfwords", () => {
    const simulation = runSimulation(
      createSimulation(assembled("lbu x2, 1(x1)\nlh x3, 2(x1)\nlhu x4, 2(x1)\nlh x5, 4(x1)\n"), {
        registers: { 1: DATA_ADDRESS },
        memory: {
          [DATA_ADDRESS + 1]: 0xff,
          [DATA_ADDRESS + 2]: 0x80,
          [DATA_ADDRESS + 3]: 0xff,
          [DATA_ADDRESS + 4]: 0x34,
          [DATA_ADDRESS + 5]: 0x12,
        },
      }),
    );
    expect(simulation.current.registers[2]).toBe(255);
    expect(simulation.current.registers[3]).toBe(-128);
    expect(simulation.current.registers[4]).toBe(0xff80);
    expect(simulation.current.registers[5]).toBe(0x1234);
  });

  it("stores one byte at unaligned byte addresses and records one byte diff", () => {
    const simulation = runSimulation(
      createSimulation(assembled("sb x2, 1(x1)\n"), {
        registers: { 1: DATA_ADDRESS, 2: 0x12345678 },
        memory: { [DATA_ADDRESS]: 0xaa, [DATA_ADDRESS + 1]: 0xbb, [DATA_ADDRESS + 2]: 0xcc },
      }),
    );
    expect(simulation.current.memory[DATA_ADDRESS]).toBe(0xaa);
    expect(simulation.current.memory[DATA_ADDRESS + 1]).toBe(0x78);
    expect(simulation.current.memory[DATA_ADDRESS + 2]).toBe(0xcc);
    expect(simulation.history.flatMap((snapshot) => snapshot.memoryDiffs)).toEqual([
      { address: DATA_ADDRESS + 1, before: 0xbb, after: 0x78 },
    ]);
    expect(simulation.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "error")).toBe(
      false,
    );
  });

  it("stores little-endian halfwords and records two byte diffs", () => {
    const simulation = runSimulation(
      createSimulation(assembled("sh x2, 2(x1)\n"), {
        registers: { 1: DATA_ADDRESS, 2: 0x12345678 },
        memory: { [DATA_ADDRESS + 2]: 0xaa, [DATA_ADDRESS + 3]: 0xbb, [DATA_ADDRESS + 4]: 0xcc },
      }),
    );
    expect(simulation.current.memory[DATA_ADDRESS + 2]).toBe(0x78);
    expect(simulation.current.memory[DATA_ADDRESS + 3]).toBe(0x56);
    expect(simulation.current.memory[DATA_ADDRESS + 4]).toBe(0xcc);
    expect(simulation.history.flatMap((snapshot) => snapshot.memoryDiffs)).toEqual([
      { address: DATA_ADDRESS + 2, before: 0xaa, after: 0x78 },
      { address: DATA_ADDRESS + 3, before: 0xbb, after: 0x56 },
    ]);
  });

  it("stalls when an instruction depends on a loaded byte", () => {
    const program = assembled(`
lb x2, 1(x1)
addi x3, x2, 1
`);
    const simulation = runSimulation(
      createSimulation(program, {
        registers: { 1: DATA_ADDRESS },
        memory: { [DATA_ADDRESS + 1]: 0x7f },
      }),
    );
    expect(simulation.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "stall")).toBe(
      true,
    );
    expect(simulation.current.registers[3]).toBe(128);
  });

  it("stalls when an instruction depends on a loaded halfword", () => {
    const program = assembled(`
lh x2, 0(x1)
addi x3, x2, 1
`);
    const simulation = runSimulation(
      createSimulation(program, {
        registers: { 1: DATA_ADDRESS },
        memory: { [DATA_ADDRESS]: 0xff, [DATA_ADDRESS + 1]: 0x7f },
      }),
    );
    expect(simulation.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "stall")).toBe(
      true,
    );
    expect(simulation.current.registers[3]).toBe(0x8000);
  });

  it("loads little-endian words from byte memory", () => {
    const simulation = runSimulation(
      createSimulation(assembled("lw x2, 0(x1)\n"), {
        registers: { 1: DATA_ADDRESS },
        memory: {
          [DATA_ADDRESS]: 0x78,
          [DATA_ADDRESS + 1]: 0x56,
          [DATA_ADDRESS + 2]: 0x34,
          [DATA_ADDRESS + 3]: 0x12,
        },
      }),
    );
    expect(simulation.current.registers[2]).toBe(0x12345678);
  });

  it("stores little-endian words and records byte diffs", () => {
    const simulation = runSimulation(
      createSimulation(assembled("sw x2, 0(x1)\n"), { registers: { 1: DATA_ADDRESS, 2: 0x12345678 } }),
    );
    expect(simulation.current.memory[DATA_ADDRESS]).toBe(0x78);
    expect(simulation.current.memory[DATA_ADDRESS + 1]).toBe(0x56);
    expect(simulation.current.memory[DATA_ADDRESS + 2]).toBe(0x34);
    expect(simulation.current.memory[DATA_ADDRESS + 3]).toBe(0x12);
    expect(simulation.history.flatMap((snapshot) => snapshot.memoryDiffs)).toEqual([
      { address: DATA_ADDRESS, before: 0, after: 0x78 },
      { address: DATA_ADDRESS + 1, before: 0, after: 0x56 },
      { address: DATA_ADDRESS + 2, before: 0, after: 0x34 },
      { address: DATA_ADDRESS + 3, before: 0, after: 0x12 },
    ]);
  });

  it("halts with an error event on unaligned word memory access", () => {
    const load = runSimulation(createSimulation(assembled("lw x2, 0(x1)\n"), { registers: { 1: DATA_ADDRESS + 2 } }));
    expect(load.current.halted).toBe(true);
    expect(load.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "error")).toBe(true);

    const store = runSimulation(
      createSimulation(assembled("sw x2, 0(x1)\n"), { registers: { 1: DATA_ADDRESS + 2, 2: 1 } }),
    );
    expect(store.current.halted).toBe(true);
    expect(store.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "error")).toBe(true);
    expect(store.history.flatMap((snapshot) => snapshot.memoryDiffs)).toEqual([]);
    expect(store.current.terminalRecord).toMatchObject({ kind: "error", errorKind: "mem-misaligned" });
  });

  it("halts with an error event on unaligned halfword memory access", () => {
    const load = runSimulation(createSimulation(assembled("lh x2, 0(x1)\n"), { registers: { 1: DATA_ADDRESS + 1 } }));
    expect(load.current.halted).toBe(true);
    expect(load.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "error")).toBe(true);

    const store = runSimulation(
      createSimulation(assembled("sh x2, 0(x1)\n"), { registers: { 1: DATA_ADDRESS + 1, 2: 1 } }),
    );
    expect(store.current.halted).toBe(true);
    expect(store.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "error")).toBe(true);
  });

  it("halts on unmapped RAM and invalid MMIO loads", () => {
    const unmapped = runSimulation(createSimulation(assembled("lw x2, 0(x1)\n"), { registers: { 1: 16 } }));
    expect(unmapped.current.halted).toBe(true);
    expect(unmapped.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "error")).toBe(true);

    const mmioLoad = runSimulation(createSimulation(assembled("lb x2, 0(x1)\n"), { registers: { 1: 0x10000000 } }));
    expect(mmioLoad.current.halted).toBe(true);
    expect(mmioLoad.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "error")).toBe(true);
    expect(unmapped.current.terminalRecord).toMatchObject({ kind: "error", errorKind: "mem-unmapped" });
    expect(mmioLoad.current.terminalRecord).toMatchObject({ kind: "error", errorKind: "mmio-violation" });
  });

  it("records UART output and exit device requests without RAM diffs", () => {
    const uart = runSimulation(
      createSimulation(assembled("sb x2, 0(x1)\n"), { registers: { 1: 0x10000000, 2: 0x41 } }),
    );
    expect(uart.current.consoleOutput).toEqual([0x41]);
    expect(uart.history.flatMap((snapshot) => snapshot.memoryDiffs)).toEqual([]);

    const exit = runSimulation(
      createSimulation(assembled("sw x2, 0(x1)\n"), { registers: { 1: 0x00100000, 2: 0x00005555 } }),
    );
    const exitSlot = exit.history
      .flatMap((snapshot) => Object.values(snapshot.stages))
      .find((slot) => slot?.exitRequest);
    expect(exitSlot?.exitRequest).toEqual({ code: 0 });
    expect(exit.history.flatMap((snapshot) => snapshot.memoryDiffs)).toEqual([]);
    expect(exit.current.terminalRecord).toEqual({ kind: "exit", code: 0 });
    expect(formatRetireLog(exit.current)).toContain("store w [00100000]=00005555");
    expect(formatRetireLog(exit.current).split("\n").at(-1)).toBe("EXIT 0");
  });

  it("classifies undefined accesses inside device regions as mmio violations and outside as unmapped", () => {
    const errorKindFor = (source: string, registers: Record<number, number>) => {
      const simulation = runSimulation(createSimulation(assembled(source), { registers }));
      expect(simulation.current.terminalRecord?.kind).toBe("error");
      return simulation.current.terminalRecord?.kind === "error"
        ? simulation.current.terminalRecord.errorKind
        : undefined;
    };

    // Inside the UART region but not a defined register access.
    expect(errorKindFor("sw x2, 0(x1)\n", { 1: 0x10000004, 2: 1 })).toBe("mmio-violation");
    expect(errorKindFor("sb x2, 0(x1)\n", { 1: 0x10000fff, 2: 1 })).toBe("mmio-violation");
    expect(errorKindFor("lb x2, 0(x1)\n", { 1: 0x10000008 })).toBe("mmio-violation");
    // Inside the exit region but not the exit register.
    expect(errorKindFor("sw x2, 0(x1)\n", { 1: 0x00100004, 2: 0x5555 })).toBe("mmio-violation");
    // Just past the region limits, and below the exit region: unmapped.
    expect(errorKindFor("sb x2, 0(x1)\n", { 1: 0x10001000, 2: 1 })).toBe("mem-unmapped");
    expect(errorKindFor("sb x2, 0(x1)\n", { 1: 0x000fffff, 2: 1 })).toBe("mem-unmapped");
    expect(errorKindFor("sb x2, 0(x1)\n", { 1: 0x00101000, 2: 1 })).toBe("mem-unmapped");
  });

  it("exits with the failure code from the high half of a 0x3333 exit store", () => {
    const simulation = runSimulation(
      createSimulation(assembled("sw x2, 0(x1)\n"), { registers: { 1: 0x00100000, 2: 0x00013333 } }),
    );
    expect(simulation.current.terminalRecord).toEqual({ kind: "exit", code: 1 });
    expect(formatRetireLog(simulation.current).split("\n").at(-1)).toBe("EXIT 1");
  });

  it("treats non-word stores and undefined values on the exit device as mmio violations", () => {
    const byteStore = runSimulation(
      createSimulation(assembled("sb x2, 0(x1)\n"), { registers: { 1: 0x00100000, 2: 0x55 } }),
    );
    expect(byteStore.current.terminalRecord).toMatchObject({ kind: "error", errorKind: "mmio-violation" });

    const halfStore = runSimulation(
      createSimulation(assembled("sh x2, 0(x1)\n"), { registers: { 1: 0x00100000, 2: 0x5555 } }),
    );
    expect(halfStore.current.terminalRecord).toMatchObject({ kind: "error", errorKind: "mmio-violation" });

    const undefinedValue = runSimulation(
      createSimulation(assembled("sw x2, 0(x1)\n"), { registers: { 1: 0x00100000, 2: 42 } }),
    );
    expect(undefinedValue.current.terminalRecord).toMatchObject({ kind: "error", errorKind: "mmio-violation" });

    const highBitsWithSuccessPattern = runSimulation(
      createSimulation(assembled("sw x2, 0(x1)\n"), { registers: { 1: 0x00100000, 2: 0x00015555 } }),
    );
    expect(highBitsWithSuccessPattern.current.terminalRecord).toMatchObject({
      kind: "error",
      errorKind: "mmio-violation",
    });
  });

  it("suppresses device side effects when a device access errors", () => {
    const simulation = runSimulation(
      createSimulation(assembled("sw x2, 0(x1)\n"), { registers: { 1: RASK_UART_DATA_ADDRESS, 2: 0x41424344 } }),
    );

    expect(simulation.current.halted).toBe(true);
    expect(simulation.current.consoleOutput).toEqual([]);
    expect(simulation.current.terminalRecord).toMatchObject({ kind: "error", errorKind: "mmio-violation" });
  });

  it("executes fence as a real no-op and identifies ebreak for later pause handling", () => {
    const simulation = runSimulation(createSimulation(assembled("addi x1, x0, 1\nfence\nebreak\naddi x2, x1, 1\n")));
    const ebreakSlot = simulation.history
      .flatMap((snapshot) => Object.values(snapshot.stages))
      .find((slot) => slot?.instruction.op === "ebreak" && slot.isEbreak);

    expect(simulation.current.halted).toBe(true);
    expect(simulation.current.registers[1]).toBe(1);
    expect(simulation.current.registers[2]).toBe(2);
    expect(ebreakSlot?.isEbreak).toBe(true);
    expect(simulation.history.flatMap((snapshot) => snapshot.events).some((event) => event.kind === "error")).toBe(
      false,
    );
  });

  it("pauses on ebreak for interactive runs while non-interactive runs continue", () => {
    const initial = createSimulation(assembled("addi x1, x0, 1\nebreak\naddi x2, x0, 2\n"));
    const paused = runSimulation(initial, 50, { stopOnPause: true });

    expect(paused.current.paused).toBe(true);
    expect(paused.current.halted).toBe(false);
    expect(formatRetireLog(paused.current)).not.toMatch(/cycle|seqId|S\d/);

    const continued = runSimulation(paused, 50);
    expect(continued.current.halted).toBe(true);
    expect(continued.current.registers[2]).toBe(2);

    const nonInteractive = runSimulation(initial);
    expect(nonInteractive.current.halted).toBe(true);
    expect(nonInteractive.current.registers[2]).toBe(2);
  });

  it("reports ecall as a decode-time error condition", () => {
    const simulation = runSimulation(createSimulation(assembled("ecall\naddi x1, x0, 1\n")));
    const errorEvents = simulation.history
      .flatMap((snapshot) => snapshot.events)
      .filter((event) => event.kind === "error");

    expect(simulation.current.halted).toBe(true);
    expect(simulation.current.registers[1]).toBe(0);
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0]?.detail).toMatchObject({ errorKind: "ecall" });
    expect(formatRetireLog(simulation.current).split("\n").at(-1)).toMatch(/^ERROR ecall /);
  });

  it("carries fetch and undefined-instruction errors until retire", () => {
    const fetchError = runSimulation(createSimulation(rawImageAt([0x00000013], RASK_RAM_LIMIT_EXCLUSIVE)));
    expect(fetchError.current.terminalRecord).toMatchObject({ kind: "error", errorKind: "fetch-unmapped" });
    expect(formatRetireLog(fetchError.current).split("\n").at(-1)).toBe(
      `ERROR fetch-unmapped ${RASK_RAM_LIMIT_EXCLUSIVE.toString(16).padStart(8, "0")} --------`,
    );

    const undefinedInstruction = runSimulation(createSimulation(rawImageAt([0xffffffff])));
    expect(undefinedInstruction.current.terminalRecord).toMatchObject({ kind: "error", errorKind: "undef-instr" });
    expect(formatRetireLog(undefinedInstruction.current).split("\n").at(-1)).toMatch(/^ERROR undef-instr /);
  });

  it("does not report errors from flushed wrong-path instructions", () => {
    const decodeErrorFlushed = runSimulation(
      createSimulation(
        assembled(`
jal x0, target
ecall
target:
addi x1, x0, 1
`),
      ),
    );
    expect(decodeErrorFlushed.current.halted).toBe(true);
    expect(decodeErrorFlushed.current.terminalRecord).toBeUndefined();
    expect(
      decodeErrorFlushed.history.flatMap((snapshot) => snapshot.events).filter((event) => event.kind === "error"),
    ).toEqual([]);

    const fetchErrorFlushed = runSimulation(
      createSimulation(rawImageAt([JAL_X0_ZERO], RASK_RAM_LIMIT_EXCLUSIVE - 4)),
      12,
    );
    expect(fetchErrorFlushed.current.halted).toBe(false);
    expect(
      fetchErrorFlushed.history.flatMap((snapshot) => snapshot.events).filter((event) => event.kind === "error"),
    ).toEqual([]);
  });

  it("attaches retire events to W cells and branch events to X cells in the same cycle", () => {
    const simulation = runSimulation(
      createSimulation(
        assembled(`
addi x5, x0, 3
add x6, x5, x5
beq x6, x6, target
addi x7, x0, 1
target:
addi x8, x0, 2
`),
      ),
    );
    const expectedStages = { retire: "WB", branch: "EX", memory: "MEM", stall: "ID" } as const;
    const checked: Record<string, number> = { retire: 0, branch: 0, stall: 0 };

    for (const snapshot of simulation.history) {
      for (const event of snapshot.events) {
        const expected = expectedStages[event.kind as keyof typeof expectedStages];
        if (!expected) continue;
        const cell = snapshot.timeline.find((candidate) => candidate.seqId === event.seqId);
        expect(cell?.stage).toBe(expected);
        expect(cell?.cycle).toBe(event.cycle);
        checked[event.kind] = (checked[event.kind] ?? 0) + 1;
      }
    }
    expect(checked.retire).toBeGreaterThan(0);
    expect(checked.branch).toBeGreaterThan(0);
    expect(checked.stall).toBeGreaterThan(0);
  });

  it("has a timeline cell for every event so no event is orphaned", () => {
    const programs = [
      "addi x5, x0, 3\nadd x6, x5, x5\nbeq x6, x6, target\naddi x7, x0, 1\ntarget:\naddi x8, x0, 2\n",
      "lui x1, 0x00100\nlui x2, 0x5\naddi x2, x2, 0x555\nsw x2, 0(x1)\naddi x3, x0, 1\naddi x4, x0, 2\n",
      "ecall\naddi x1, x0, 1\n",
    ];
    for (const source of programs) {
      const simulation = runSimulation(createSimulation(assembled(source)));
      for (const snapshot of simulation.history) {
        for (const event of snapshot.events) {
          expect(event.cycle).toBe(snapshot.cycle);
          const cell = snapshot.timeline.find((candidate) => candidate.seqId === event.seqId);
          expect(cell, `event ${event.id} (${event.kind}) has no cell`).toBeDefined();
        }
      }
    }
  });

  it("keeps exactly one W per retired instruction when an exit store terminates the run", () => {
    const simulation = runSimulation(
      createSimulation(
        assembled(`
lui x1, 0x00100
lui x2, 0x5
addi x2, x2, 0x555
sw x2, 0(x1)
addi x3, x0, 1
addi x4, x0, 2
`),
      ),
    );

    expect(simulation.current.terminalRecord).toEqual({ kind: "exit", code: 0 });
    const rows = formatPipelineOccupancyTable(simulation.current).split("\n");
    const retiredRows = rows.filter((row) => row.endsWith("W"));
    expect(retiredRows).toHaveLength(simulation.current.retireLog.length);
    for (const row of rows) {
      const wCount = row.split("W").length - 1;
      expect(wCount, `row "${row}" must have at most one W`).toBeLessThanOrEqual(1);
      if (wCount === 1) expect(row.endsWith("W"), `row "${row}" must end with its W`).toBe(true);
    }
    const discardedRows = rows.filter((row) => !row.endsWith("W"));
    expect(discardedRows.length).toBeGreaterThan(0);
  });

  it("steps backward through history", async () => {
    const { stepBackSimulation } = await import("../../src/core");
    const program = assembled("addi x1, x0, 1\n");
    const once = stepSimulation(createSimulation(program));
    const back = stepBackSimulation(once);
    expect(back.current.cycle).toBe(0);
  });
});

function rawImageAt(words: number[], baseAddress = RASK_RESET_PC): ExecutionImage {
  const instructions = words.map((word, index) => {
    const address = toByteAddress(baseAddress + index * 4);
    return {
      id: index,
      address,
      word: toInstructionWord(word),
      source: { line: index + 1, text: `.word 0x${word.toString(16).padStart(8, "0")}` },
    };
  });
  return {
    baseAddress: toByteAddress(baseAddress),
    instructions,
    instructionMemory: Object.fromEntries(instructions.map((instruction) => [instruction.address, instruction])),
  };
}
