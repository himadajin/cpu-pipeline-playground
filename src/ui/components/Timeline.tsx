import clsx from "clsx";
import type { CycleSnapshot, Instruction, PipelineEvent, SelectedCell } from "../../core";

export function Timeline({
  instructions,
  snapshots,
  cells,
  currentCycle,
  selectedCell,
  onSelect,
}: {
  instructions: Instruction[];
  snapshots: CycleSnapshot[];
  cells: CycleSnapshot["timeline"];
  currentCycle: number;
  selectedCell: SelectedCell | null;
  onSelect: (cell: SelectedCell) => void;
}) {
  const maxCycle = Math.max(12, snapshots.at(-1)?.cycle ?? 0);
  const cycles = Array.from({ length: maxCycle + 1 }, (_, index) => index);
  const cellMap = new Map(cells.map((cell) => [`${cell.instructionId}:${cell.cycle}`, cell]));
  const rowStyle = { gridTemplateColumns: `112px repeat(${cycles.length}, 72px)` };
  return (
    <section className="timeline-shell">
      <div className="timeline" role="grid" aria-label="Pipeline timeline">
        <div className="timeline-row header-row" style={rowStyle}>
          <div className="instruction-header">Line</div>
          {cycles.map((cycle) => (
            <div className={clsx("cycle-header", cycle === currentCycle && "current")} key={cycle}>
              {cycle}
            </div>
          ))}
        </div>
        {instructions.map((instruction) => (
          <div className="timeline-row" key={instruction.id} style={rowStyle}>
            <div className="instruction-cell" title={instruction.text}>
              <span className="line-number">L{instruction.source.line}</span>{" "}
              <span className="instruction-op">{instruction.op}</span>
            </div>
            {cycles.map((cycle) => {
              const cell = cellMap.get(`${instruction.id}:${cycle}`);
              const selected = selectedCell?.cycle === cycle && selectedCell.instructionId === instruction.id;
              return (
                <button
                  className={clsx(
                    "timeline-cell",
                    cell?.stage.toLowerCase(),
                    cycle === currentCycle && "current-cycle",
                    selected && "selected",
                  )}
                  key={cycle}
                  onClick={() => onSelect({ cycle, instructionId: instruction.id })}
                >
                  <span>{cell?.stage ?? ""}</span>
                  <EventMarkers events={cell?.events ?? []} />
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function EventMarkers({ events }: { events: PipelineEvent[] }) {
  const visibleEvents = events.slice(0, 2);
  const hiddenCount = Math.max(0, events.length - visibleEvents.length);
  return (
    <span className="event-markers" aria-label={events.map((event) => event.label).join(", ")}>
      {visibleEvents.map((event) => (
        <span className={clsx("event-marker", event.kind)} key={event.id} title={`${event.label}: ${event.message}`} />
      ))}
      {hiddenCount > 0 && <span className="event-marker more" title={`${hiddenCount} more events`} />}
    </span>
  );
}
