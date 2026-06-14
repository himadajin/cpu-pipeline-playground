import type { SignatureLine } from "./types";

export type OracleMismatchClassification =
  | "fixture-selection"
  | "register-observable-state"
  | "memory-observable-state"
  | "producer-output"
  | "signature-shape";

export interface OracleSignatureMismatch {
  key: string;
  simulator: string | null;
  qemu: string | null;
  classification: OracleMismatchClassification;
  suspects: string[];
}

export interface OracleSignatureComparison {
  ok: boolean;
  mismatches: OracleSignatureMismatch[];
}

export function compareSignatures(simulator: SignatureLine[], qemu: SignatureLine[]): OracleSignatureComparison {
  const simulatorMap = new Map(simulator.map((line) => [line.key, line.value]));
  const qemuMap = new Map(qemu.map((line) => [line.key, line.value]));
  const keys = Array.from(new Set([...Array.from(simulatorMap.keys()), ...Array.from(qemuMap.keys())])).sort();
  const mismatches = keys
    .filter((key) => simulatorMap.get(key) !== qemuMap.get(key))
    .map((key) => {
      const simulatorValue = simulatorMap.get(key) ?? null;
      const qemuValue = qemuMap.get(key) ?? null;
      const classification = classifyMismatch(key, simulatorValue, qemuValue);
      return {
        key,
        simulator: simulatorValue,
        qemu: qemuValue,
        classification,
        suspects: suspectsForClassification(classification),
      };
    });

  return { ok: mismatches.length === 0, mismatches };
}

export function formatComparisonFailure(fixtureId: string, mismatches: OracleSignatureMismatch[]): string {
  const lines = [`${fixtureId}: signature mismatch`];
  for (const mismatch of mismatches) {
    lines.push(
      [
        `  ${mismatch.key}: simulator=${mismatch.simulator ?? "<missing>"}`,
        `qemu=${mismatch.qemu ?? "<missing>"}`,
        `classification=${mismatch.classification}`,
        `suspects=${mismatch.suspects.join(",")}`,
      ].join(" "),
    );
  }
  return `${lines.join("\n")}\n`;
}

function classifyMismatch(
  key: string,
  simulatorValue: string | null,
  qemuValue: string | null,
): OracleMismatchClassification {
  if (simulatorValue == null || qemuValue == null) return "producer-output";
  if (key === "fixture") return "fixture-selection";
  if (/^x(?:[0-9]|[12][0-9]|3[01])$/.test(key)) return "register-observable-state";
  if (/^mem\[.+\]$/.test(key)) return "memory-observable-state";
  return "signature-shape";
}

function suspectsForClassification(classification: OracleMismatchClassification): string[] {
  switch (classification) {
    case "fixture-selection":
      return ["manifest target selection", "producer fixture id"];
    case "register-observable-state":
      return ["simulator semantics", "register normalization", "QEMU harness register capture"];
    case "memory-observable-state":
      return ["simulator memory semantics", "signature normalization", "QEMU harness memory capture"];
    case "producer-output":
      return ["producer output", "manifest compare set", "signature selection"];
    case "signature-shape":
      return ["signature schema", "comparator normalization"];
  }
}
