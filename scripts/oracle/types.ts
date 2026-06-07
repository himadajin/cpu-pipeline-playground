export const ORACLE_DATA_BASE = 0x80010000;
export const DEFAULT_MAX_CYCLES = 300;

export type OracleFixtureKind = "alu" | "memory" | "control";

export interface OracleManifest {
  defaults: OracleFixtureDefaults;
  fixtures: OracleFixture[];
}

export interface OracleFixtureDefaults {
  compareRegisters: string[];
  compareMemory: OracleMemoryRange[];
  initialRegisters: Record<string, number | string>;
  initialMemory: OracleMemorySeed[];
  maxCycles: number;
}

export interface OracleFixture {
  id: string;
  file: string;
  kind: OracleFixtureKind;
  description: string;
  compareRegisters?: string[];
  compareMemory?: OracleMemoryRange[];
  initialRegisters?: Record<string, number | string>;
  initialMemory?: OracleMemorySeed[];
  maxCycles?: number;
}

export interface OracleMemoryRange {
  address: number | string;
  words: number;
}

export interface OracleMemorySeed {
  address: number | string;
  value: number | string;
}

export interface ResolvedOracleFixture extends Omit<
  OracleFixture,
  "compareRegisters" | "compareMemory" | "initialRegisters" | "initialMemory" | "maxCycles"
> {
  sourcePath: string;
  source: string;
  compareRegisters: number[];
  compareMemory: ResolvedOracleMemoryRange[];
  initialRegisters: Record<number, number>;
  initialMemory: Record<number, number>;
  maxCycles: number;
}

export interface ResolvedOracleMemoryRange {
  address: number;
  words: number;
}

export interface SignatureLine {
  key: string;
  value: string;
}
