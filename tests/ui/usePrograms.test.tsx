import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePrograms } from "../../src/ui/hooks/usePrograms";

const STORAGE_KEY = "cpu-pipeline-playground.programs.v1";

function seedPrograms() {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify([
      { id: "one", name: "One", source: "addi x1, x0, 1\n", updatedAt: 0 },
      { id: "two", name: "Two", source: "addi x2, x0, 2\n", updatedAt: 0 },
      { id: "bad", name: "Bad", source: "broken x1\n", updatedAt: 0 },
    ]),
  );
}

describe("usePrograms", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("loads persisted programs and computes assemble status", () => {
    seedPrograms();

    const { result } = renderHook(() => usePrograms());

    expect(result.current.programs).toHaveLength(3);
    expect(result.current.selectedProgram?.id).toBe("one");
    expect(result.current.statuses.get("one")?.errors).toBe(0);
    expect(result.current.statuses.get("bad")?.errors).toBe(1);
  });

  it("creates a new program and selects it", () => {
    seedPrograms();
    const { result } = renderHook(() => usePrograms());

    act(() => {
      result.current.actions.createNewProgram();
    });

    expect(result.current.programs).toHaveLength(4);
    expect(result.current.selectedProgram?.name).toBe("Untitled");
  });

  it("duplicates the selected program and selects the copy", () => {
    seedPrograms();
    const { result } = renderHook(() => usePrograms());

    act(() => {
      result.current.actions.duplicateSelectedProgram();
    });

    expect(result.current.programs).toHaveLength(4);
    expect(result.current.selectedProgram?.name).toBe("One copy");
    expect(result.current.selectedProgram?.source).toBe("addi x1, x0, 1\n");
  });

  it("renames and edits the selected program", () => {
    seedPrograms();
    const { result } = renderHook(() => usePrograms());

    act(() => {
      result.current.actions.renameProgram("one", "Renamed");
      result.current.actions.updateSelectedProgram({ source: "addi x5, x0, 5\n" });
    });

    expect(result.current.selectedProgram?.name).toBe("Renamed");
    expect(result.current.selectedProgram?.source).toBe("addi x5, x0, 5\n");
  });

  it("selects an existing program and ignores unknown ids", () => {
    seedPrograms();
    const { result } = renderHook(() => usePrograms());

    act(() => result.current.actions.selectProgram("two"));
    expect(result.current.selectedProgram?.id).toBe("two");

    act(() => result.current.actions.selectProgram("missing"));
    expect(result.current.selectedProgram?.id).toBe("two");
  });

  it("selects the adjacent program after deleting the selected program", () => {
    seedPrograms();
    const { result } = renderHook(() => usePrograms());

    act(() => result.current.actions.selectProgram("two"));
    act(() => result.current.actions.deleteProgram("two"));

    expect(result.current.programs.map((program) => program.id)).toEqual(["one", "bad"]);
    expect(result.current.selectedProgram?.id).toBe("bad");
  });

  it("does not delete the final program", () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: "solo", name: "Solo", source: "addi x1, x0, 1\n", updatedAt: 0 }]),
    );
    const { result } = renderHook(() => usePrograms());

    act(() => result.current.actions.deleteProgram("solo"));

    expect(result.current.programs).toHaveLength(1);
    expect(result.current.selectedProgram?.id).toBe("solo");
  });

  it("persists program changes", async () => {
    seedPrograms();
    const { result } = renderHook(() => usePrograms());

    act(() => {
      result.current.actions.renameProgram("one", "Stored");
    });

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as Array<{ name: string }>;
      expect(stored[0]?.name).toBe("Stored");
    });
  });
});
