import { useEffect, useMemo, useState } from "react";
import {
  assemble,
  createSimulation,
  stepSimulation,
  type CycleSnapshot,
  type SelectedCell,
  type SimulationState,
} from "../../core";

const RUN_INTERVAL_MS = 150;

export function createSimulationForSource(source: string) {
  const result = assemble(source);
  return createSimulation(result.ok ? result.executionImage : []);
}

interface SimulationSessionState {
  programId: string;
  simulation: SimulationState;
  simSource: string;
  selectedCell: SelectedCell | null;
  /**
   * The single observation time: which cycle snapshot the workbench displays.
   * Stepping at the newest cycle extends the simulation; stepping behind it
   * only replays. Back never destroys history.
   */
  cursor: number;
  running: boolean;
}

export function useSimulationSession({ programId, source }: { programId: string; source: string }) {
  const [state, setState] = useState<SimulationSessionState>(() => ({
    programId,
    simulation: createSimulationForSource(source),
    simSource: source,
    selectedCell: null,
    cursor: 0,
    running: false,
  }));
  // Program switch: adjust state during render so the reset has a single
  // path. React re-renders immediately with the fresh state, so everything
  // derived below is recomputed from it before anything is committed.
  if (state.programId !== programId) {
    setState({
      programId,
      simulation: createSimulationForSource(source),
      simSource: source,
      selectedCell: null,
      cursor: 0,
      running: false,
    });
  }

  const { simulation, selectedCell, cursor, running } = state;
  const assembled = useMemo(() => assemble(source), [source]);
  const invalidated = state.simSource !== source && simulation.current.cycle > 0;
  const snapshots = simulation.history;
  const latestCycle = simulation.current.cycle;
  const atLatest = cursor >= latestCycle;
  // History holds one snapshot per cycle starting at cycle 0.
  const viewSnapshot: CycleSnapshot = snapshots[Math.min(cursor, snapshots.length - 1)] ?? simulation.current;
  const timelineCells = snapshots.flatMap((snapshot) => snapshot.timeline);
  const selectedInstruction = selectedCell
    ? simulation.program.find((instruction) => instruction.id === selectedCell.instructionId)
    : null;
  const selectedSnapshot = selectedCell
    ? snapshots.find((snapshot) => snapshot.cycle === selectedCell.cycle)
    : undefined;
  const selectedTimelineCell = selectedCell
    ? (selectedSnapshot?.timeline.find((cell) => cell.seqId === selectedCell.seqId) ?? null)
    : null;
  const selectedEvents = selectedSnapshot?.events.filter((event) => event.seqId === selectedCell?.seqId) ?? [];
  const canStep = assembled.ok && !invalidated && (!atLatest || !simulation.current.halted);

  function reset() {
    if (!assembled.ok) return;
    setState({
      programId,
      simulation: createSimulation(assembled.executionImage),
      simSource: source,
      selectedCell: null,
      cursor: 0,
      running: false,
    });
  }

  function stepOnce(current: SimulationSessionState): SimulationSessionState {
    // Behind the newest cycle the step is a replay: only the cursor moves.
    if (current.cursor < current.simulation.current.cycle) {
      return { ...current, cursor: current.cursor + 1 };
    }
    // Rebuild before stepping when nothing has run yet and the source moved
    // on (edits at cycle 0 never attach to a stale simulation), or when the
    // last assemble failed and left an empty program.
    const stale =
      current.simulation.program.length === 0 ||
      (current.simSource !== source && current.simulation.current.cycle === 0);
    if (current.simulation.current.halted && !stale) return current;
    const baseSimulation = stale ? createSimulation(assembled.executionImage) : current.simulation;
    const simulation = stepSimulation(baseSimulation);
    return {
      ...current,
      simulation,
      simSource: source,
      cursor: simulation.current.cycle,
    };
  }

  function step() {
    if (invalidated || !assembled.ok) return;
    setState((current) => stepOnce(current));
  }

  function stepBack() {
    setState((current) => ({ ...current, cursor: Math.max(0, current.cursor - 1), running: false }));
  }

  function setCursor(cycle: number) {
    setState((current) => ({
      ...current,
      cursor: Math.max(0, Math.min(cycle, current.simulation.current.cycle)),
    }));
  }

  function jumpToLatest() {
    setState((current) => ({ ...current, cursor: current.simulation.current.cycle }));
  }

  function selectCell(cell: SelectedCell) {
    setState((current) => ({
      ...current,
      selectedCell: cell,
      cursor: Math.max(0, Math.min(cell.cycle, current.simulation.current.cycle)),
    }));
  }

  function clearSelection() {
    setState((current) => (current.selectedCell ? { ...current, selectedCell: null } : current));
  }

  function toggleRun() {
    if (invalidated || !assembled.ok) return;
    setState((current) => ({ ...current, running: !current.running }));
  }

  const runnable = canStep;
  useEffect(() => {
    if (!running) return;
    if (!runnable) {
      setState((current) => (current.running ? { ...current, running: false } : current));
      return;
    }
    const timer = window.setInterval(() => {
      setState((current) => {
        const next = stepOnce(current);
        // Stop at the pause point (ebreak retire) and when the machine halts;
        // both are states the user asked to observe, not to skip.
        const reachedLatest = next.cursor >= next.simulation.current.cycle;
        const shouldStop = reachedLatest && (next.simulation.current.halted || next.simulation.current.paused);
        return shouldStop ? { ...next, running: false } : next;
      });
    }, RUN_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [running, runnable, source]);

  // Editing while running invalidates the simulation; stop the clock too.
  useEffect(() => {
    if (invalidated && running) {
      setState((current) => ({ ...current, running: false }));
    }
  }, [invalidated, running]);

  return {
    assembled,
    simulation,
    snapshots,
    timelineCells,
    cursor,
    latestCycle,
    atLatest,
    viewSnapshot,
    running,
    canStep,
    selectedCell,
    selectedInstruction,
    selectedSnapshot,
    selectedTimelineCell,
    selectedEvents,
    invalidated,
    actions: {
      reset,
      step,
      stepBack,
      setCursor,
      jumpToLatest,
      selectCell,
      clearSelection,
      toggleRun,
    },
  };
}
