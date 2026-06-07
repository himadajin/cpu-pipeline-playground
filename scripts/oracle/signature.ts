import type { CycleSnapshot } from "../../src/core";
import { ORACLE_DATA_BASE, type ResolvedOracleFixture, type SignatureLine } from "./types";

export function normalizeWord(value: number): string {
  return `0x${(value >>> 0).toString(16).padStart(8, "0")}`;
}

export function formatSignature(lines: SignatureLine[]): string {
  return `${lines.map(({ key, value }) => `${key}=${value}`).join("\n")}\n`;
}

export function parseSignature(text: string): SignatureLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf("=");
      if (index < 1) {
        throw new Error(`Invalid signature line: ${line}`);
      }
      return { key: line.slice(0, index), value: line.slice(index + 1) };
    });
}

export function signatureFromSnapshot(fixture: ResolvedOracleFixture, snapshot: CycleSnapshot): string {
  const lines: SignatureLine[] = [{ key: "fixture", value: fixture.id }];

  for (const register of fixture.compareRegisters) {
    lines.push({ key: `x${register}`, value: normalizeWord(snapshot.registers[register] ?? 0) });
  }

  for (const range of fixture.compareMemory) {
    for (let offset = 0; offset < range.words; offset += 1) {
      const address = (range.address + offset * 4) | 0;
      lines.push({ key: `mem[${normalizeAddress(address)}]`, value: normalizeWord(snapshot.memory[address] ?? 0) });
    }
  }

  return formatSignature(lines);
}

export function normalizeAddress(address: number): string {
  const unsigned = address >>> 0;
  if (unsigned >= ORACLE_DATA_BASE) {
    return `data+${unsigned - ORACLE_DATA_BASE}`;
  }
  return normalizeWord(unsigned);
}
