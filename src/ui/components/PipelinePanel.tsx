import clsx from "clsx";
import type { AssembleResult, CycleSnapshot, SelectedCell } from "../../core";
import { pluralize } from "../format";
import { StageBoard } from "./StageBoard";
import { Timeline } from "./Timeline";

export function PipelinePanel({
  assembled,
  cells,
  current,
  invalidated,
  onSelectCell,
  selectedCell,
  snapshots,
}: {
  assembled: AssembleResult;
  cells: CycleSnapshot["timeline"];
  current: CycleSnapshot;
  invalidated: boolean;
  onSelectCell: (cell: SelectedCell) => void;
  selectedCell: SelectedCell | null;
  snapshots: CycleSnapshot[];
}) {
  return (
    <section className="pipeline-panel">
      <div className="pipeline-header">
        <span>Pipeline</span>
        <div className="pipeline-status">
          <span className="mini-status">cycle {current.cycle}</span>
          {current.paused && <span className="mini-status warn">paused</span>}
          <span className={clsx("mini-status", !assembled.ok && "bad")}>
            {assembled.ok
              ? pluralize(assembled.instructions.length, "instruction")
              : pluralize(assembled.errors.length, "assemble error", "assemble errors")}
          </span>
          {invalidated && <span className="mini-status warn">simulation invalidated</span>}
        </div>
      </div>
      <StageBoard snapshot={current} />
      <Timeline
        instructions={assembled.instructions}
        snapshots={snapshots}
        cells={cells}
        currentCycle={current.cycle}
        selectedCell={selectedCell}
        onSelect={onSelectCell}
      />
    </section>
  );
}
