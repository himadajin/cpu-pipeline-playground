import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ORACLE_DATA_BASE, DEFAULT_MAX_CYCLES, type OracleManifest, type ResolvedOracleFixture } from "./types";

const REGISTER_NAMES: Record<string, number> = {
  zero: 0,
  ra: 1,
  sp: 2,
  gp: 3,
  tp: 4,
  t0: 5,
  t1: 6,
  t2: 7,
  s0: 8,
  fp: 8,
  s1: 9,
  a0: 10,
  a1: 11,
  a2: 12,
  a3: 13,
  a4: 14,
  a5: 15,
  a6: 16,
  a7: 17,
  s2: 18,
  s3: 19,
  s4: 20,
  s5: 21,
  s6: 22,
  s7: 23,
  s8: 24,
  s9: 25,
  s10: 26,
  s11: 27,
  t3: 28,
  t4: 29,
  t5: 30,
  t6: 31,
};

export function loadManifest(repoRoot: string): OracleManifest {
  return JSON.parse(readFileSync(join(repoRoot, "oracle/fixtures/manifest.json"), "utf8")) as OracleManifest;
}

export function resolveFixture(repoRoot: string, fixtureId: string): ResolvedOracleFixture {
  const manifest = loadManifest(repoRoot);
  const fixture = manifest.fixtures.find((candidate) => candidate.id === fixtureId);
  if (!fixture) {
    throw new Error(`Unknown oracle fixture "${fixtureId}".`);
  }

  const sourcePath = resolve(repoRoot, "oracle/fixtures", fixture.file);
  const source = readFileSync(sourcePath, "utf8");
  const compareRegisters = (fixture.compareRegisters ?? manifest.defaults.compareRegisters).map(parseRegister);
  const compareMemory = (fixture.compareMemory ?? manifest.defaults.compareMemory).map((range) => ({
    address: parseAddress(range.address),
    words: range.words,
  }));
  const initialRegisters = parseRegisterMap({
    ...manifest.defaults.initialRegisters,
    ...(fixture.initialRegisters ?? {}),
  });
  const initialMemory = Object.fromEntries(
    [...manifest.defaults.initialMemory, ...(fixture.initialMemory ?? [])].map((seed) => [
      parseAddress(seed.address),
      parseWord(seed.value),
    ]),
  );

  return {
    ...fixture,
    sourcePath,
    source,
    compareRegisters,
    compareMemory,
    initialRegisters,
    initialMemory,
    maxCycles: fixture.maxCycles ?? manifest.defaults.maxCycles ?? DEFAULT_MAX_CYCLES,
  };
}

export function listFixtureIds(repoRoot: string): string[] {
  return loadManifest(repoRoot).fixtures.map((fixture) => fixture.id);
}

function parseRegisterMap(input: Record<string, number | string>): Record<number, number> {
  return Object.fromEntries(
    Object.entries(input).map(([register, value]) => [parseRegister(register), parseWord(value)]),
  );
}

function parseRegister(register: string): number {
  const normalized = register.toLowerCase();
  const match = /^x([0-9]|[12][0-9]|3[01])$/.exec(normalized);
  const parsed = match ? Number(match[1]) : REGISTER_NAMES[normalized];
  if (parsed == null) {
    throw new Error(`Invalid register "${register}".`);
  }
  return parsed;
}

function parseAddress(value: number | string): number {
  if (typeof value === "number") return value | 0;
  if (value === "data") return ORACLE_DATA_BASE | 0;
  if (value.startsWith("data+")) return (ORACLE_DATA_BASE + Number.parseInt(value.slice("data+".length), 10)) | 0;
  return parseWord(value);
}

function parseWord(value: number | string): number {
  if (typeof value === "number") return value | 0;
  const normalized = value.toLowerCase();
  const parsed = normalized.startsWith("0x") ? Number.parseInt(normalized, 16) : Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid word value "${value}".`);
  }
  return parsed | 0;
}
