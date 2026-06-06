import { useEffect, useMemo, useState } from "react";
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
  return createSimulation(result.ok ? result.instructions : []);
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
  const programChanged = state.programId !== programId;
  const programResetSimulation = useMemo(
    () => (programChanged ? createSimulationForSource(source) : null),
    [programChanged, source],
  );
  const simulation = programResetSimulation ?? state.simulation;
  const selectedCell = programChanged ? null : state.selectedCell;
  const assembled = useMemo(() => assemble(source), [source]);
  const invalidated = !programChanged && state.simSource !== source && simulation.current.cycle > 0;
  const snapshots = simulation.history;
  const timelineCells = snapshots.flatMap((snapshot) => snapshot.timeline);
  const selectedInstruction = selectedCell
    ? assembled.instructions.find((instruction) => instruction.id === selectedCell.instructionId)
    : null;
  const selectedSnapshot = selectedCell
    ? snapshots.find((snapshot) => snapshot.cycle === selectedCell.cycle)
    : undefined;
  const selectedEvents =
    selectedSnapshot?.events.filter((event) => event.instructionId === selectedCell?.instructionId) ?? [];
  const activeEventSnapshot: CycleSnapshot = selectedSnapshot ?? simulation.current;

  useEffect(() => {
    if (!programChanged) return;
    setState({
      programId,
      simulation: createSimulationForSource(source),
      simSource: source,
      selectedCell: null,
    });
  }, [programChanged, programId, source]);

  function reset() {
    const result = assemble(source);
    if (!result.ok) return;
    setState({
      programId,
      simulation: createSimulation(result.instructions),
      simSource: source,
      selectedCell: null,
    });
  }

  function step() {
    if (invalidated || !assembled.ok) return;
    setState((current) => {
      const baseSimulation =
        current.programId !== programId
          ? createSimulation(assembled.instructions)
          : current.simulation.program.length === 0
            ? createSimulation(assembled.instructions)
            : current.simulation;

      return {
        programId,
        simulation: stepSimulation(baseSimulation),
        simSource: source,
        selectedCell: current.programId === programId ? current.selectedCell : null,
      };
    });
  }

  function stepBack() {
    setState((current) => ({
      ...current,
      programId,
      simulation:
        current.programId === programId ? stepBackSimulation(current.simulation) : createSimulationForSource(source),
      simSource: current.programId === programId ? current.simSource : source,
      selectedCell: current.programId === programId ? current.selectedCell : null,
    }));
  }

  function selectCell(cell: SelectedCell) {
    setState((current) => ({
      ...current,
      programId,
      selectedCell: current.programId === programId ? cell : null,
    }));
  }

  return {
    assembled,
    simulation,
    snapshots,
    timelineCells,
    selectedCell,
    selectedInstruction,
    selectedSnapshot,
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
