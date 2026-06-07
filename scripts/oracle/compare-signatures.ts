import { readFileSync } from "node:fs";
import { join } from "node:path";
import { listFixtureIds } from "./manifest";
import { parseSignature } from "./signature";

const repoRoot = process.cwd();
const fixtureIds = process.argv.slice(2);
const targets = fixtureIds.length > 0 ? fixtureIds : listFixtureIds(repoRoot);

for (const fixtureId of targets) {
  const simulatorPath = join(repoRoot, "oracle/signatures/simulator", `${fixtureId}.sig`);
  const qemuPath = join(repoRoot, "oracle/signatures/qemu", `${fixtureId}.sig`);
  const simulator = parseSignature(readFileSync(simulatorPath, "utf8"));
  const qemu = parseSignature(readFileSync(qemuPath, "utf8"));
  const simulatorMap = new Map(simulator.map((line) => [line.key, line.value]));
  const qemuMap = new Map(qemu.map((line) => [line.key, line.value]));
  const keys = Array.from(new Set([...Array.from(simulatorMap.keys()), ...Array.from(qemuMap.keys())])).sort();
  const mismatches = keys.filter((key) => simulatorMap.get(key) !== qemuMap.get(key));

  if (mismatches.length > 0) {
    console.error(`${fixtureId}: signature mismatch`);
    for (const key of mismatches) {
      console.error(
        `  ${key}: simulator=${simulatorMap.get(key) ?? "<missing>"} qemu=${qemuMap.get(key) ?? "<missing>"}`,
      );
    }
    process.exitCode = 1;
  }
}
