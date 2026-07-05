import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSimulationSession } from "../../src/ui/hooks/useSimulationSession";

const SOURCE = "addi x1, x0, 1\naddi x2, x1, 2\n";
const UPDATED_SOURCE = `${SOURCE}addi x3, x2, 3\n`;

describe("useSimulationSession", () => {
  it("initializes a simulation from the active source", () => {
    const { result } = renderHook(() => useSimulationSession({ programId: "a", source: SOURCE }));

    expect(result.current.assembled.ok).toBe(true);
    expect(result.current.simulation.current.cycle).toBe(0);
    expect(result.current.simulation.program).toHaveLength(2);
    expect(result.current.invalidated).toBe(false);
  });

  it("steps back by moving the cursor without destroying history", () => {
    const { result } = renderHook(() => useSimulationSession({ programId: "a", source: SOURCE }));

    act(() => result.current.actions.step());
    expect(result.current.simulation.current.cycle).toBe(1);
    expect(result.current.cursor).toBe(1);

    act(() => result.current.actions.stepBack());
    expect(result.current.cursor).toBe(0);
    expect(result.current.viewSnapshot.cycle).toBe(0);
    // The simulation history is preserved; Back only rewinds the view.
    expect(result.current.simulation.current.cycle).toBe(1);

    // Stepping behind the newest cycle replays instead of extending.
    act(() => result.current.actions.step());
    expect(result.current.cursor).toBe(1);
    expect(result.current.simulation.current.cycle).toBe(1);
  });

  it("clamps the cursor to the simulated range and follows cell selection", () => {
    const { result } = renderHook(() => useSimulationSession({ programId: "a", source: SOURCE }));

    act(() => {
      result.current.actions.step();
      result.current.actions.step();
    });
    act(() => result.current.actions.setCursor(99));
    expect(result.current.cursor).toBe(2);
    act(() => result.current.actions.setCursor(-5));
    expect(result.current.cursor).toBe(0);

    act(() => result.current.actions.selectCell({ cycle: 1, seqId: 0, instructionId: 0 }));
    expect(result.current.cursor).toBe(1);
    expect(result.current.viewSnapshot.cycle).toBe(1);
  });

  it("runs automatically and stops at the halt", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useSimulationSession({ programId: "a", source: SOURCE }));

      act(() => result.current.actions.toggleRun());
      expect(result.current.running).toBe(true);

      act(() => {
        vi.advanceTimersByTime(150 * 30);
      });

      expect(result.current.simulation.current.halted).toBe(true);
      expect(result.current.running).toBe(false);
      expect(result.current.cursor).toBe(result.current.simulation.current.cycle);
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks a run simulation as invalidated when the same program source changes", () => {
    const { result, rerender } = renderHook(
      (props: { programId: string; source: string }) => useSimulationSession(props),
      {
        initialProps: { programId: "a", source: SOURCE },
      },
    );

    act(() => result.current.actions.step());
    rerender({ programId: "a", source: UPDATED_SOURCE });

    expect(result.current.invalidated).toBe(true);
    expect(result.current.simulation.current.cycle).toBe(1);
  });

  it("resets to the latest source after invalidation", () => {
    const { result, rerender } = renderHook(
      (props: { programId: string; source: string }) => useSimulationSession(props),
      {
        initialProps: { programId: "a", source: SOURCE },
      },
    );

    act(() => result.current.actions.step());
    rerender({ programId: "a", source: UPDATED_SOURCE });
    act(() => result.current.actions.reset());

    expect(result.current.invalidated).toBe(false);
    expect(result.current.simulation.current.cycle).toBe(0);
    expect(result.current.simulation.program).toHaveLength(3);
  });

  it("keeps the previous simulation visible while the source has assemble errors", () => {
    const { result, rerender } = renderHook(
      (props: { programId: string; source: string }) => useSimulationSession(props),
      {
        initialProps: { programId: "a", source: SOURCE },
      },
    );

    act(() => result.current.actions.step());
    rerender({ programId: "a", source: "not_an_opcode x1\n" });

    expect(result.current.assembled.ok).toBe(false);
    expect(result.current.simulation.current.cycle).toBe(1);
  });

  it("resets simulation and selection when the active program changes", () => {
    const { result, rerender } = renderHook(
      (props: { programId: string; source: string }) => useSimulationSession(props),
      {
        initialProps: { programId: "a", source: SOURCE },
      },
    );

    act(() => result.current.actions.step());
    act(() => result.current.actions.selectCell({ cycle: 1, seqId: 0, instructionId: 0 }));
    expect(result.current.selectedCell).toEqual({ cycle: 1, seqId: 0, instructionId: 0 });

    rerender({ programId: "b", source: "addi x4, x0, 4\n" });

    expect(result.current.simulation.current.cycle).toBe(0);
    expect(result.current.simulation.program).toHaveLength(1);
    expect(result.current.selectedCell).toBeNull();
    expect(result.current.invalidated).toBe(false);
  });

  it("keeps timeline selection tied to a dynamic seqId", () => {
    const { result } = renderHook(() =>
      useSimulationSession({
        programId: "a",
        source: "jal x0, target\naddi x1, x0, 1\ntarget:\naddi x2, x0, 2\n",
      }),
    );

    act(() => {
      for (let index = 0; index < 10 && !result.current.simulation.current.halted; index += 1) {
        result.current.actions.step();
      }
    });

    const targetCells = result.current.timelineCells.filter((cell) => cell.instructionId === 2 && cell.stage === "IF");
    expect(targetCells.map((cell) => cell.seqId)).toEqual([2, 3]);

    act(() => result.current.actions.selectCell(targetCells[1]!));

    expect(result.current.selectedCell).toMatchObject({ seqId: 3, instructionId: 2 });
    expect(result.current.selectedTimelineCell).toMatchObject({ seqId: 3, stage: "IF" });
  });

  it("can step immediately after switching away from a halted program", () => {
    const { result, rerender } = renderHook(
      (props: { programId: string; source: string }) => useSimulationSession(props),
      {
        initialProps: { programId: "a", source: "addi x1, x0, 1\n" },
      },
    );

    act(() => {
      for (let index = 0; index < 20 && !result.current.simulation.current.halted; index += 1) {
        result.current.actions.step();
      }
    });
    expect(result.current.simulation.current.halted).toBe(true);

    rerender({ programId: "b", source: "addi x2, x0, 2\n" });
    expect(result.current.simulation.current.halted).toBe(false);

    act(() => result.current.actions.step());
    expect(result.current.simulation.current.cycle).toBe(1);
  });
});
