import clsx from "clsx";
import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { CycleSnapshot, Instruction, PipelineEvent, SelectedCell } from "../../core";

const LABEL_COLUMN_WIDTH = 148;
const CYCLE_COLUMN_WIDTH = 72;

interface TimelineRow {
  seqId: number;
  instructionId: number;
  pc: number;
  instruction: Instruction | undefined;
}

export function Timeline({
  instructions,
  cells,
  cursor,
  latestCycle,
  selectedCell,
  onSelect,
  onCursorChange,
}: {
  instructions: Instruction[];
  cells: CycleSnapshot["timeline"];
  cursor: number;
  latestCycle: number;
  selectedCell: SelectedCell | null;
  onSelect: (cell: SelectedCell) => void;
  onCursorChange: (cycle: number) => void;
}) {
  // Cycle numbers are 1-origin (spec §4); cycle 0 is the pre-execution reset state and has no column.
  const maxCycle = Math.max(12, latestCycle);
  const cycles = Array.from({ length: maxCycle }, (_, index) => index + 1);
  const instructionMap = new Map(instructions.map((instruction) => [instruction.id, instruction]));
  const rows = buildRows(cells, instructionMap);
  const cellMap = new Map(cells.map((cell) => [`${cell.seqId}:${cell.cycle}`, cell]));
  const rowStyle = { gridTemplateColumns: `${LABEL_COLUMN_WIDTH}px repeat(${cycles.length}, ${CYCLE_COLUMN_WIDTH}px)` };
  const shellRef = useRef<HTMLElement | null>(null);
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const cursorHeaderRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const shell = shellRef.current;
    const target = cursorHeaderRef.current;
    if (!shell || !target) return;
    // Scroll only when the cursor column leaves the visible area, so stepping
    // does not nudge the viewport on every cycle. The sticky instruction
    // column covers the left edge of the shell.
    const shellRect = shell.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const outOfView = targetRect.left < shellRect.left + LABEL_COLUMN_WIDTH || targetRect.right > shellRect.right;
    if (outOfView) target.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [cursor]);

  function cycleFromPointer(event: { clientX: number }): number {
    const ruler = rulerRef.current;
    if (!ruler) return cursor;
    const x = event.clientX - ruler.getBoundingClientRect().left - LABEL_COLUMN_WIDTH;
    return Math.max(0, Math.min(Math.ceil(x / CYCLE_COLUMN_WIDTH), latestCycle));
  }

  function handleRulerPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    onCursorChange(cycleFromPointer(event));
    const handleMove = (moveEvent: PointerEvent) => onCursorChange(cycleFromPointer(moveEvent));
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function handleRulerKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      onCursorChange(Math.min(cursor + 1, latestCycle));
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      onCursorChange(Math.max(cursor - 1, 0));
    }
    if (event.key === "Home") {
      event.preventDefault();
      onCursorChange(0);
    }
    if (event.key === "End") {
      event.preventDefault();
      onCursorChange(latestCycle);
    }
  }

  return (
    <section className="timeline-shell" ref={shellRef}>
      <div className="timeline" role="grid" aria-label="Pipeline timeline">
        <div
          className="timeline-row header-row"
          style={rowStyle}
          ref={rulerRef}
          role="slider"
          aria-label="Cycle cursor"
          aria-valuemin={0}
          aria-valuemax={latestCycle}
          aria-valuenow={cursor}
          aria-valuetext={`cycle ${cursor}`}
          tabIndex={0}
          onPointerDown={handleRulerPointerDown}
          onKeyDown={handleRulerKeyDown}
        >
          <div className="instruction-header">Instruction</div>
          {cycles.map((cycle) => (
            <div
              className={clsx("cycle-header", cycle === cursor && "current")}
              key={cycle}
              ref={cycle === cursor ? cursorHeaderRef : undefined}
            >
              {cycle}
            </div>
          ))}
        </div>
        {rows.length === 0 && (
          <p className="timeline-empty">Nothing has been fetched yet. Step runs the first cycle.</p>
        )}
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
              // A repeated stage means the instruction is held in place (the
              // spec's repeated occupancy letter); render it hatched.
              const held = cell !== undefined && cellMap.get(`${row.seqId}:${cycle - 1}`)?.stage === cell.stage;
              return (
                <button
                  className={clsx(
                    "timeline-cell",
                    cell?.stage.toLowerCase(),
                    held && "held",
                    cycle === cursor && "current-cycle",
                    cell && cycle === latestCycle && "latched",
                    cell && cycle > cursor && "ahead",
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
