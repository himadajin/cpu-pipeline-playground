import { describe, expect, it } from "vitest";
import {
  assemble,
  createSimulation,
  decodeInstruction,
  RASK_RESET_PC,
  runSimulation,
  type ExecutionImage,
  type Instruction,
} from "../../src/core";
import { toByteAddress, toInstructionWord } from "../../src/core/numbers";

const ROUND_TRIP_SOURCE = `
addi x1, x0, -4
add x2, x1, x1
sub x3, x2, x1
slt x4, x1, x2
sltu x5, x1, x2
andi x6, x5, 0xff
ori x7, x6, 1
xori x8, x7, -1
sll x9, x8, x1
srl x10, x9, x1
sra x11, x10, x1
slli x12, x11, 3
srli x13, x12, 2
srai x14, x13, 1
fence
ebreak
lui x15, 0x80010
auipc x16, 1
sw x2, 0(x15)
lw x17, 0(x15)
lh x18, 0(x15)
lhu x19, 0(x15)
lb x20, 0(x15)
lbu x21, 0(x15)
sh x17, 4(x15)
sb x17, 6(x15)
beq x1, x2, done
bne x1, x2, done
blt x1, x2, done
bge x2, x1, done
bltu x1, x2, done
bgeu x2, x1, done
jal x22, done
jalr x23, 0(x22)
done:
addi x24, x0, 1
`;

describe("instruction codec", () => {
  it("round trips representative assembled instructions through instruction words", () => {
    const result = assemble(ROUND_TRIP_SOURCE);
    expect(result.errors).toEqual([]);

    for (const entry of result.executionImage.instructions) {
      const decoded = decodeInstruction(entry.word, entry.address, entry.id, entry.source, entry.instruction?.text);
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) continue;
      expect(normalizeInstruction(decoded.instruction)).toEqual(normalizeInstruction(entry.instruction!));
    }
  });

  it("lets the simulator execute from instruction words without assembler-only instruction objects", () => {
    const result = assemble("addi x1, x0, 7\naddi x2, x1, 5\n");
    expect(result.errors).toEqual([]);
    const rawImage: ExecutionImage = {
      ...result.executionImage,
      instructions: result.executionImage.instructions.map(({ instruction: _instruction, ...entry }) => entry),
      instructionMemory: Object.fromEntries(
        result.executionImage.instructions.map(({ instruction: _instruction, ...entry }) => [entry.address, entry]),
      ),
    };

    const simulation = runSimulation(createSimulation(rawImage));

    expect(simulation.program.map((instruction) => instruction.text)).toEqual([".word 0x00700093", ".word 0x00508113"]);
    expect(simulation.current.registers[1]).toBe(7);
    expect(simulation.current.registers[2]).toBe(12);
  });

  it("keeps source diagnostics separate from decode-time ecall and undefined-instruction errors", () => {
    const assembled = assemble("ecall\n");
    expect(assembled.errors).toEqual([]);
    expect(assembled.executionImage.instructions[0]?.word).toBe(0x00000073);

    const ecall = decodeInstruction(toInstructionWord(0x00000073), toByteAddress(RASK_RESET_PC), 0);
    expect(ecall).toMatchObject({ ok: false, error: { kind: "ecall" } });

    const undefinedInstruction = decodeInstruction(toInstructionWord(0xffffffff), toByteAddress(RASK_RESET_PC), 1);
    expect(undefinedInstruction).toMatchObject({ ok: false, error: { kind: "undef-instr" } });
  });

  it("reports decode-time errors through the simulator instead of assembler diagnostics", () => {
    const image = rawImage([0x00000073]);
    const simulation = runSimulation(createSimulation(image));
    const errorEvents = simulation.history
      .flatMap((snapshot) => snapshot.events)
      .filter((event) => event.kind === "error");

    expect(simulation.current.halted).toBe(true);
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0]?.detail).toMatchObject({ errorKind: "ecall" });
  });
});

function normalizeInstruction(instruction: Instruction) {
  const normalized: Record<string, unknown> = { op: instruction.op };
  for (const key of ["rd", "rs1", "rs2", "imm", "target"] as const) {
    if (key in instruction) normalized[key] = (instruction as unknown as Record<typeof key, unknown>)[key];
  }
  return normalized;
}

function rawImage(words: number[]): ExecutionImage {
  const instructions = words.map((word, index) => {
    const address = toByteAddress(RASK_RESET_PC + index * 4);
    return {
      id: index,
      address,
      word: toInstructionWord(word),
      source: { line: index + 1, text: `.word 0x${word.toString(16).padStart(8, "0")}` },
    };
  });
  return {
    baseAddress: toByteAddress(RASK_RESET_PC),
    instructions,
    instructionMemory: Object.fromEntries(instructions.map((instruction) => [instruction.address, instruction])),
  };
}
