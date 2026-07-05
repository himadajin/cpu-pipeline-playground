import clsx from "clsx";
import type { AssembleResult, CycleSnapshot, PipelineEvent, SelectedCell } from "../../core";
import { pluralize } from "../format";
import { Timeline } from "./Timeline";

export function PipelinePanel({
  assembled,
  cells,
  current,
  cursor,
  invalidated,
  onClearSelection,
  onCursorChange,
  onJumpToLatest,
  onSelectCell,
  selectedCell,
  selectedEvents,
}: {
  assembled: AssembleResult;
  cells: CycleSnapshot["timeline"];
  current: CycleSnapshot;
  cursor: number;
  invalidated: boolean;
  onClearSelection: () => void;
  onCursorChange: (cycle: number) => void;
  onJumpToLatest: () => void;
  onSelectCell: (cell: SelectedCell) => void;
  selectedCell: SelectedCell | null;
  selectedEvents: PipelineEvent[];
}) {
  const latestCycle = current.cycle;
  const viewingPast = cursor < latestCycle;

  return (
    <section className="pipeline-panel">
      <div className="pipeline-header">
        <span>Pipeline</span>
        <div className="pipeline-status">
          {viewingPast ? (
            <>
              <span className="mini-status">viewing cycle {cursor}</span>
              <button className="mini-status jump-latest" type="button" onClick={onJumpToLatest}>
                → cycle {latestCycle}
              </button>
            </>
          ) : (
            <span className="mini-status">cycle {latestCycle}</span>
          )}
          {current.paused && <span className="mini-status warn">paused</span>}
          {current.halted && <span className="mini-status">halted</span>}
          <span className={clsx("mini-status", !assembled.ok && "bad")}>
            {assembled.ok
              ? pluralize(assembled.instructions.length, "instruction")
              : pluralize(assembled.errors.length, "assemble error", "assemble errors")}
          </span>
          {invalidated && <span className="mini-status warn">simulation invalidated</span>}
        </div>
      </div>
      <Timeline
        instructions={assembled.instructions}
        cells={cells}
        cursor={cursor}
        latestCycle={latestCycle}
        selectedCell={selectedCell}
        selectedEvents={selectedEvents}
        onSelect={onSelectCell}
        onClearSelection={onClearSelection}
        onCursorChange={onCursorChange}
      />
    </section>
  );
}
