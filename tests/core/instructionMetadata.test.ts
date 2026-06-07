import { describe, expect, it } from "vitest";
import {
  destinationRegister,
  INSTRUCTION_METADATA,
  instructionSet,
  REAL_OPCODES,
  sourceRegisters,
  writesRegister,
  type Instruction,
  type Opcode,
} from "../../src/core";
import { toByteAddress, toRegisterIndex, toSigned12Immediate } from "../../src/core/numbers";

const EXPECTED_OPCODES: Opcode[] = [
  "add",
  "sub",
  "addi",
  "lw",
  "sw",
  "beq",
  "bne",
  "blt",
  "jal",
  "and",
  "or",
  "xor",
  "sll",
  "srl",
];

describe("instruction metadata", () => {
  it("covers the real opcode set without treating nop as a real instruction", () => {
    expect(new Set(REAL_OPCODES)).toEqual(new Set(EXPECTED_OPCODES));
    expect(Object.keys(INSTRUCTION_METADATA)).toHaveLength(EXPECTED_OPCODES.length);
    expect(Object.prototype.hasOwnProperty.call(INSTRUCTION_METADATA, "nop")).toBe(false);
  });

  it("keeps assembler mnemonics as real opcodes plus nop", () => {
    expect(new Set(instructionSet())).toEqual(new Set([...EXPECTED_OPCODES, "nop"]));
  });

  it("describes representative source and destination registers", () => {
    const add: Instruction = {
      id: 0,
      op: "add",
      rd: toRegisterIndex(1),
      rs1: toRegisterIndex(2),
      rs2: toRegisterIndex(3),
      source: { line: 1, text: "add x1, x2, x3" },
      text: "add x1, x2, x3",
    };
    const sw: Instruction = {
      id: 1,
      op: "sw",
      rs1: toRegisterIndex(4),
      rs2: toRegisterIndex(5),
      imm: toSigned12Immediate(0),
      source: { line: 2, text: "sw x5, 0(x4)" },
      text: "sw x5, 0(x4)",
    };
    const jal: Instruction = {
      id: 2,
      op: "jal",
      rd: toRegisterIndex(6),
      target: toByteAddress(16),
      label: "target",
      source: { line: 3, text: "jal x6, target" },
      text: "jal x6, target",
    };

    expect(sourceRegisters(add)).toEqual([2, 3]);
    expect(destinationRegister(add)).toBe(1);
    expect(writesRegister(add)).toBe(true);

    expect(sourceRegisters(sw)).toEqual([4, 5]);
    expect(destinationRegister(sw)).toBeNull();
    expect(writesRegister(sw)).toBe(false);

    expect(sourceRegisters(jal)).toEqual([]);
    expect(destinationRegister(jal)).toBe(6);
    expect(writesRegister(jal)).toBe(true);
  });

  it("marks load and addi as single-source writeback instructions", () => {
    const lw: Instruction = {
      id: 0,
      op: "lw",
      rd: toRegisterIndex(7),
      rs1: toRegisterIndex(8),
      imm: toSigned12Immediate(4),
      source: { line: 1, text: "lw x7, 4(x8)" },
      text: "lw x7, 4(x8)",
    };
    const addi: Instruction = {
      id: 1,
      op: "addi",
      rd: toRegisterIndex(9),
      rs1: toRegisterIndex(10),
      imm: toSigned12Immediate(-1),
      source: { line: 2, text: "addi x9, x10, -1" },
      text: "addi x9, x10, -1",
    };

    expect(sourceRegisters(lw)).toEqual([8]);
    expect(destinationRegister(lw)).toBe(7);
    expect(writesRegister(lw)).toBe(true);

    expect(sourceRegisters(addi)).toEqual([10]);
    expect(destinationRegister(addi)).toBe(9);
    expect(writesRegister(addi)).toBe(true);
  });
});
