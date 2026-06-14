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
import { toByteAddress, toRegisterIndex, toSigned12Immediate, toUpper20Immediate } from "../../src/core/numbers";

const EXPECTED_OPCODES: Opcode[] = [
  "add",
  "sub",
  "slt",
  "sltu",
  "addi",
  "slti",
  "sltiu",
  "andi",
  "ori",
  "xori",
  "lb",
  "lbu",
  "lh",
  "lhu",
  "lw",
  "sb",
  "sh",
  "sw",
  "beq",
  "bne",
  "blt",
  "bge",
  "bltu",
  "bgeu",
  "jal",
  "jalr",
  "lui",
  "auipc",
  "and",
  "or",
  "xor",
  "sll",
  "srl",
  "sra",
  "slli",
  "srli",
  "srai",
  "fence",
  "ecall",
  "ebreak",
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
    const lb: Instruction = {
      id: 0,
      op: "lb",
      rd: toRegisterIndex(6),
      rs1: toRegisterIndex(8),
      imm: toSigned12Immediate(1),
      source: { line: 1, text: "lb x6, 1(x8)" },
      text: "lb x6, 1(x8)",
    };
    const lw: Instruction = {
      id: 1,
      op: "lw",
      rd: toRegisterIndex(7),
      rs1: toRegisterIndex(8),
      imm: toSigned12Immediate(4),
      source: { line: 2, text: "lw x7, 4(x8)" },
      text: "lw x7, 4(x8)",
    };
    const addi: Instruction = {
      id: 2,
      op: "addi",
      rd: toRegisterIndex(9),
      rs1: toRegisterIndex(10),
      imm: toSigned12Immediate(-1),
      source: { line: 3, text: "addi x9, x10, -1" },
      text: "addi x9, x10, -1",
    };

    expect(sourceRegisters(lb)).toEqual([8]);
    expect(destinationRegister(lb)).toBe(6);
    expect(writesRegister(lb)).toBe(true);

    expect(sourceRegisters(lw)).toEqual([8]);
    expect(destinationRegister(lw)).toBe(7);
    expect(writesRegister(lw)).toBe(true);

    expect(sourceRegisters(addi)).toEqual([10]);
    expect(destinationRegister(addi)).toBe(9);
    expect(writesRegister(addi)).toBe(true);
  });

  it("marks byte stores as memory writers without register writeback", () => {
    const sb: Instruction = {
      id: 0,
      op: "sb",
      rs1: toRegisterIndex(4),
      rs2: toRegisterIndex(5),
      imm: toSigned12Immediate(3),
      source: { line: 1, text: "sb x5, 3(x4)" },
      text: "sb x5, 3(x4)",
    };

    expect(sourceRegisters(sb)).toEqual([4, 5]);
    expect(destinationRegister(sb)).toBeNull();
    expect(writesRegister(sb)).toBe(false);
  });

  it("marks jalr and upper-immediate instructions by their architectural operands", () => {
    const jalr: Instruction = {
      id: 0,
      op: "jalr",
      rd: toRegisterIndex(1),
      rs1: toRegisterIndex(2),
      imm: toSigned12Immediate(4),
      source: { line: 1, text: "jalr x1, 4(x2)" },
      text: "jalr x1, 4(x2)",
    };
    const lui: Instruction = {
      id: 1,
      op: "lui",
      rd: toRegisterIndex(3),
      imm: toUpper20Immediate(0x12345),
      source: { line: 2, text: "lui x3, 0x12345" },
      text: "lui x3, 0x12345",
    };

    expect(sourceRegisters(jalr)).toEqual([2]);
    expect(destinationRegister(jalr)).toBe(1);
    expect(writesRegister(jalr)).toBe(true);

    expect(sourceRegisters(lui)).toEqual([]);
    expect(destinationRegister(lui)).toBe(3);
    expect(writesRegister(lui)).toBe(true);
  });
});
