import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolveFixture } from "./manifest";

const repoRoot = process.cwd();
const fixtureId = process.argv[2];

if (!fixtureId) {
  console.error("Usage: tsx scripts/oracle/build-fixture.ts <fixture-id>");
  process.exit(2);
}

const fixture = resolveFixture(repoRoot, fixtureId);
const outputDir = join(repoRoot, "oracle/generated");
const outputPath = join(outputDir, `${fixture.id}.S`);

mkdirSync(outputDir, { recursive: true });
writeFileSync(
  outputPath,
  `.include "oracle/harness/start.S"

.section .text
.global oracle_test
oracle_test:
${fixture.source.trimEnd()}
  j oracle_finish

.include "oracle/harness/finish.S"
.include "oracle/harness/signature.S"
`,
);

console.log(outputPath);
