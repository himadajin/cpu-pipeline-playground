import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listFixtureIds, resolveFixture } from "./manifest";
import { type ResolvedOracleFixture, type SignatureLine } from "./types";
import { formatSignature, normalizeAddress, parseSignature } from "./signature";

const repoRoot = process.cwd();
const fixtureIds = process.argv.slice(2);
const targets = fixtureIds.length > 0 ? fixtureIds : listFixtureIds(repoRoot);
const dockerRun = join(repoRoot, "oracle/docker-run.sh");
const outputDir = join(repoRoot, "oracle/signatures/qemu");

mkdirSync(outputDir, { recursive: true });

for (const fixtureId of targets) {
  const fixture = resolveFixture(repoRoot, fixtureId);
  const build = spawnSync("npx", ["tsx", "scripts/oracle/build-fixture.ts", fixture.id], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  if (build.status !== 0) {
    process.stderr.write(build.stderr);
    process.exit(build.status ?? 1);
  }

  const assemblyPath = build.stdout.trim();
  const elfPath = join(repoRoot, "oracle/generated", `${fixture.id}.elf`);
  runDocker([
    "riscv-none-elf-gcc",
    "-march=rv32i",
    "-mabi=ilp32",
    "-nostdlib",
    "-T",
    "oracle/harness/linker.ld",
    "-o",
    elfPath,
    assemblyPath,
  ]);

  const output = await runQemu(elfPath);
  const signature = selectSignatureLines(fixture, output);
  const outputPath = join(outputDir, `${fixture.id}.sig`);
  writeFileSync(outputPath, signature);
  process.stdout.write(signature);
}

function runDocker(args: string[]): void {
  const result = spawnSync(dockerRun, args, { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
}

async function runQemu(elfPath: string): Promise<string> {
  const child = spawn(
    dockerRun,
    [
      "timeout",
      "3s",
      "qemu-system-riscv32",
      "-machine",
      "virt",
      "-cpu",
      "rv32",
      "-bios",
      "none",
      "-nographic",
      "-monitor",
      "none",
      "-serial",
      "stdio",
      "-device",
      `loader,file=${elfPath},cpu-num=0`,
    ],
    { cwd: repoRoot },
  );

  const { stdout, stderr, exitCode } = await new Promise<{ stdout: string; stderr: string; exitCode: number | null }>(
    (resolve) => {
      let stdout = "";
      let stderr = "";
      const timeout = setTimeout(() => {
        child.kill("SIGTERM");
      }, 10000);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
      child.on("exit", (exitCode) => {
        clearTimeout(timeout);
        resolve({ stdout, stderr, exitCode });
      });
    },
  );

  if (!stdout.includes("oracle:end")) {
    process.stderr.write(stderr);
    if (stdout.trim()) {
      process.stderr.write(`QEMU stdout before timeout:\n${stdout.slice(0, 2000)}\n`);
    }
    throw new Error(`QEMU did not emit oracle:end. Exit code: ${exitCode ?? "signal"}.`);
  }

  return stdout;
}

function selectSignatureLines(fixture: ResolvedOracleFixture, output: string): string {
  const rawLines = parseSignature(
    output
      .split(/\r?\n/)
      .filter((line) => line.includes("="))
      .join("\n"),
  );
  const values = new Map(rawLines.map((line) => [line.key, line.value]));
  const selected: SignatureLine[] = [{ key: "fixture", value: fixture.id }];

  for (const register of fixture.compareRegisters) {
    selected.push({
      key: `x${register}`,
      value: normalizeQemuRegisterValue(requireValue(values, `x${register}`), fixture),
    });
  }
  for (const range of fixture.compareMemory) {
    for (let offset = 0; offset < range.words; offset += 1) {
      const key = `mem[${normalizeAddress((range.address + offset * 4) | 0)}]`;
      selected.push({ key, value: requireValue(values, key) });
    }
  }

  return formatSignature(selected);
}

function normalizeQemuRegisterValue(value: string, fixture: ResolvedOracleFixture): string {
  const parsed = Number.parseInt(value, 16) >>> 0;
  const oracleTestBase = 0x80000014;
  const instructionCount = fixture.source
    .split(/\r?\n/)
    .map((line) => line.replace(/[#;].*$/, "").trim())
    .filter((line) => line && !line.endsWith(":")).length;
  const textEnd = oracleTestBase + instructionCount * 4 + 4;

  if (parsed >= oracleTestBase && parsed <= textEnd && (parsed - oracleTestBase) % 4 === 0) {
    return `0x${((parsed - oracleTestBase) / 4).toString(16).padStart(8, "0")}`;
  }

  return value;
}

function requireValue(values: Map<string, string>, key: string): string {
  const value = values.get(key);
  if (value == null) {
    throw new Error(`QEMU signature did not include ${key}.`);
  }
  return value;
}
