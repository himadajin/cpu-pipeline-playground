import { spawnSync } from "node:child_process";

export interface OracleEnvironmentStatus {
  available: boolean;
  reason?: string;
}

export function checkOracleEnvironment(): OracleEnvironmentStatus {
  const dockerVersion = spawnSync("docker", ["--version"], { encoding: "utf8" });
  if (dockerVersion.status !== 0) {
    return {
      available: false,
      reason: "docker command is not available",
    };
  }

  const dockerInfo = spawnSync("docker", ["info"], { encoding: "utf8" });
  if (dockerInfo.status !== 0) {
    const detail = firstLine(dockerInfo.stderr) ?? firstLine(dockerInfo.stdout);
    return {
      available: false,
      reason: detail ? `docker daemon is not available: ${detail}` : "docker daemon is not available",
    };
  }

  return { available: true };
}

function firstLine(value: string): string | undefined {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
}
