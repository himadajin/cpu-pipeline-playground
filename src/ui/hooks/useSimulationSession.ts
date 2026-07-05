import { useMemo, useState } from "react";
import {
  assemble,
  createSimulation,
  stepBackSimulation,
  stepSimulation,
  type CycleSnapshot,
  type SelectedCell,
  type SimulationState,
} from "../../core";

export function createSimulationForSource(source: string) {
  const result = assemble(source);
  return createSimulation(result.ok ? result.executionImage : []);
}

interface SimulationSessionState {
  programId: string;
  simulation: SimulationState;
  simSource: string;
  selectedCell: SelectedCell | null;
}

export function useSimulationSession({ programId, source }: { programId: string; source: string }) {
  const [state, setState] = useState<SimulationSessionState>(() => ({
    programId,
    simulation: createSimulationForSource(source),
    simSource: source,
    selectedCell: null,
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
    });
  }

  const { simulation, selectedCell } = state;
  const assembled = useMemo(() => assemble(source), [source]);
  const invalidated = state.simSource !== source && simulation.current.cycle > 0;
  const snapshots = simulation.history;
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
  const activeEventSnapshot: CycleSnapshot = selectedSnapshot ?? simulation.current;

  function reset() {
    if (!assembled.ok) return;
    setState({
      programId,
      simulation: createSimulation(assembled.executionImage),
      simSource: source,
      selectedCell: null,
    });
  }

  function step() {
    if (invalidated || !assembled.ok) return;
    setState((current) => {
      // Rebuild before stepping when nothing has run yet and the source moved
      // on (edits at cycle 0 never attach to a stale simulation), or when the
      // last assemble failed and left an empty program.
      const stale =
        current.simulation.program.length === 0 ||
        (current.simSource !== source && current.simulation.current.cycle === 0);
      const baseSimulation = stale ? createSimulation(assembled.executionImage) : current.simulation;
      return {
        programId,
        simulation: stepSimulation(baseSimulation),
        simSource: source,
        selectedCell: current.selectedCell,
      };
    });
  }

  function stepBack() {
    setState((current) => ({ ...current, simulation: stepBackSimulation(current.simulation) }));
  }

  function selectCell(cell: SelectedCell) {
    setState((current) => ({ ...current, selectedCell: cell }));
  }

  return {
    assembled,
    simulation,
    snapshots,
    timelineCells,
    selectedCell,
    selectedInstruction,
    selectedSnapshot,
    selectedTimelineCell,
    selectedEvents,
    activeEventSnapshot,
    invalidated,
    actions: {
      reset,
      step,
      stepBack,
      selectCell,
    },
  };
}
