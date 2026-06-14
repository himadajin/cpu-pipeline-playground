import { spawnSync } from "node:child_process";
import { checkOracleEnvironment } from "./environment";

const simulator = run("npm", ["run", "oracle:sim"]);
if (simulator.status !== 0) {
  process.exit(simulator.status);
}

const environment = checkOracleEnvironment();
if (!environment.available) {
  process.stderr.write(
    [
      `oracle:test skipped QEMU producer and comparator: ${environment.reason}.`,
      "Simulator producer completed; comparator behavior is covered by Vitest.",
      "Run npm run oracle:qemu && npm run oracle:compare in an environment with Docker to complete QEMU comparison.",
      "",
    ].join("\n"),
  );
  process.exit(0);
}

const qemu = run("npm", ["run", "oracle:qemu"]);
if (qemu.status !== 0) {
  process.exit(qemu.status);
}

const compare = run("npm", ["run", "oracle:compare"]);
process.exit(compare.status);

function run(command: string, args: string[]): { status: number } {
  const result = spawnSync(command, args, { stdio: "inherit" });
  return { status: result.status ?? 1 };
}
