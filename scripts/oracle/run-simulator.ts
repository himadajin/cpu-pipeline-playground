import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assemble, createSimulation, runSimulation } from "../../src/core";
import { listFixtureIds, resolveFixture } from "./manifest";
import { signatureFromSnapshot } from "./signature";

const repoRoot = process.cwd();
const fixtureIds = process.argv.slice(2);
const targets = fixtureIds.length > 0 ? fixtureIds : listFixtureIds(repoRoot);
const outputDir = join(repoRoot, "oracle/signatures/simulator");

mkdirSync(outputDir, { recursive: true });

for (const fixtureId of targets) {
  const fixture = resolveFixture(repoRoot, fixtureId);
  const assembled = assemble(fixture.source);

  if (!assembled.ok) {
    for (const error of assembled.errors) {
      console.error(`${fixture.sourcePath}:${error.line}:${error.column} ${error.message}`);
    }
    process.exitCode = 1;
    continue;
  }

  const simulation = runSimulation(
    createSimulation(assembled.executionImage, {
      registers: fixture.initialRegisters,
      memory: fixture.initialMemory,
    }),
    fixture.maxCycles,
  );

  if (!simulation.current.halted) {
    console.error(`${fixture.id}: simulator did not halt within ${fixture.maxCycles} cycles.`);
    process.exitCode = 1;
    continue;
  }

  const signature = signatureFromSnapshot(fixture, simulation.current);
  const outputPath = join(outputDir, `${fixture.id}.sig`);
  writeFileSync(outputPath, signature);
  process.stdout.write(signature);
}
