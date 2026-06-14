import clsx from "clsx";
import type { CycleSnapshot, Instruction, PipelineEvent, SelectedCell } from "../../core";

interface TimelineRow {
  seqId: number;
  instructionId: number;
  pc: number;
  instruction: Instruction | undefined;
}

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
  const instructionMap = new Map(instructions.map((instruction) => [instruction.id, instruction]));
  const rows = buildRows(cells, instructionMap);
  const cellMap = new Map(cells.map((cell) => [`${cell.seqId}:${cell.cycle}`, cell]));
  const rowStyle = { gridTemplateColumns: `148px repeat(${cycles.length}, 72px)` };
  return (
    <section className="timeline-shell">
      <div className="timeline" role="grid" aria-label="Pipeline timeline">
        <div className="timeline-row header-row" style={rowStyle}>
          <div className="instruction-header">Instruction</div>
          {cycles.map((cycle) => (
            <div className={clsx("cycle-header", cycle === currentCycle && "current")} key={cycle}>
              {cycle}
            </div>
          ))}
        </div>
        {rows.map((row) => (
          <div className="timeline-row" key={row.seqId} style={rowStyle}>
            <div className="instruction-cell" title={row.instruction?.text ?? `pc 0x${formatHex(row.pc)}`}>
              <span className="seq-number">S{row.seqId}</span>
              {row.instruction ? (
                <>
                  <span className="line-number">L{row.instruction.source.line}</span>
                  <span className="instruction-op">{row.instruction.op}</span>
                </>
              ) : (
                <span className="instruction-op">0x{formatHex(row.pc)}</span>
              )}
            </div>
            {cycles.map((cycle) => {
              const cell = cellMap.get(`${row.seqId}:${cycle}`);
              const selected = selectedCell?.cycle === cycle && selectedCell.seqId === row.seqId;
              return (
                <button
                  className={clsx(
                    "timeline-cell",
                    cell?.stage.toLowerCase(),
                    cycle === currentCycle && "current-cycle",
                    selected && "selected",
                  )}
                  key={cycle}
                  disabled={!cell}
                  onClick={() => {
                    if (cell) onSelect({ cycle, seqId: row.seqId, instructionId: row.instructionId });
                  }}
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

function buildRows(cells: CycleSnapshot["timeline"], instructionMap: Map<number, Instruction>): TimelineRow[] {
  const rows = new Map<number, TimelineRow>();
  for (const cell of cells) {
    if (rows.has(cell.seqId)) continue;
    rows.set(cell.seqId, {
      seqId: cell.seqId,
      instructionId: cell.instructionId,
      pc: cell.pc,
      instruction: instructionMap.get(cell.instructionId),
    });
  }
  return Array.from(rows.values()).sort((left, right) => left.seqId - right.seqId);
}

function formatHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
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
