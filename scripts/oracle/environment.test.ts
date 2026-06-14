import { spawnSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkOracleEnvironment } from "./environment";

vi.mock("node:child_process", () => {
  const mockedSpawnSync = vi.fn();
  return {
    default: { spawnSync: mockedSpawnSync },
    spawnSync: mockedSpawnSync,
  };
});

const mockedSpawnSync = vi.mocked(spawnSync);
const spawnResult = (status: number, stdout = "", stderr = "") =>
  ({ status, stdout, stderr }) as ReturnType<typeof spawnSync>;

describe("oracle environment check", () => {
  beforeEach(() => {
    mockedSpawnSync.mockReset();
  });

  it("reports Docker as available only when command and daemon checks pass", () => {
    mockedSpawnSync
      .mockReturnValueOnce(spawnResult(0, "Docker version 1\n"))
      .mockReturnValueOnce(spawnResult(0, "ok\n"));

    expect(checkOracleEnvironment()).toEqual({ available: true });
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(1, "docker", ["--version"], { encoding: "utf8" });
    expect(mockedSpawnSync).toHaveBeenNthCalledWith(2, "docker", ["info"], { encoding: "utf8" });
  });

  it("reports a missing Docker command as an unavailable oracle environment", () => {
    mockedSpawnSync.mockReturnValueOnce(spawnResult(127, "", "not found\n"));

    expect(checkOracleEnvironment()).toEqual({
      available: false,
      reason: "docker command is not available",
    });
  });

  it("reports an unavailable Docker daemon with a concrete reason", () => {
    mockedSpawnSync
      .mockReturnValueOnce(spawnResult(0, "Docker version 1\n"))
      .mockReturnValueOnce(spawnResult(1, "", "Cannot connect to the Docker daemon\n"));

    expect(checkOracleEnvironment()).toEqual({
      available: false,
      reason: "docker daemon is not available: Cannot connect to the Docker daemon",
    });
  });
});
