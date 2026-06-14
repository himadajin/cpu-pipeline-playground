import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compareSignatures, formatComparisonFailure } from "./compare";
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
  const comparison = compareSignatures(simulator, qemu);

  if (!comparison.ok) {
    process.stderr.write(formatComparisonFailure(fixtureId, comparison.mismatches));
    process.exitCode = 1;
  }
}
