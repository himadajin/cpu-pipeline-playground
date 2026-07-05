import clsx from "clsx";
import { X } from "lucide-react";
import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { CycleSnapshot, Instruction, PipelineEvent, SelectedCell } from "../../core";
import { EventList } from "./EventList";

const TIMELINE_PADDING = 10;
const LABEL_COLUMN_WIDTH = 148;
const CYCLE_COLUMN_WIDTH = 72;
const ROW_HEIGHT = 40;
const POPOVER_WIDTH = 260;

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
  selectedEvents,
  onSelect,
  onClearSelection,
  onCursorChange,
}: {
  instructions: Instruction[];
  cells: CycleSnapshot["timeline"];
  cursor: number;
  latestCycle: number;
  selectedCell: SelectedCell | null;
  selectedEvents: PipelineEvent[];
  onSelect: (cell: SelectedCell) => void;
  onClearSelection: () => void;
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

  function closeSelection(returnFocus: boolean) {
    const target = selectedCell;
    onClearSelection();
    if (returnFocus && target) {
      shellRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${target.seqId}:${target.cycle}"]`)?.focus();
    }
  }

  function handleTimelineClick(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target as Element;
    // Clicking the empty canvas dismisses the popover; cells, the popover
    // itself, and the ruler (cursor scrubbing) keep the selection alive.
    if (!target.closest(".timeline-cell") && !target.closest(".cell-popover") && !target.closest(".header-row")) {
      onClearSelection();
    }
  }

  function handleTimelineKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && selectedCell) {
      event.stopPropagation();
      closeSelection(true);
    }
  }

  const selectedRowIndex = selectedCell ? rows.findIndex((row) => row.seqId === selectedCell.seqId) : -1;
  const selectedTimelineCell = selectedCell
    ? (cellMap.get(`${selectedCell.seqId}:${selectedCell.cycle}`) ?? null)
    : null;

  return (
    <section className="timeline-shell" ref={shellRef}>
      <div
        className="timeline"
        role="grid"
        aria-label="Pipeline timeline"
        onClick={handleTimelineClick}
        onKeyDown={handleTimelineKeyDown}
      >
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
                  data-cell={`${row.seqId}:${cycle}`}
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
        {selectedCell && selectedTimelineCell && selectedRowIndex >= 0 && (
          <CellPopover
            cell={selectedTimelineCell}
            cellKey={`${selectedCell.seqId}:${selectedCell.cycle}`}
            events={selectedEvents}
            instruction={instructionMap.get(selectedCell.instructionId)}
            position={popoverPosition(selectedCell.cycle, selectedRowIndex, cycles.length)}
            onClose={closeSelection}
          />
        )}
      </div>
    </section>
  );
}

/**
 * Places the popover beside and below the selected cell using the fixed
 * timeline geometry; flips to the left of the cell near the right edge.
 */
function popoverPosition(cycle: number, rowIndex: number, cycleCount: number): { left: number; top: number } {
  const cellLeft = TIMELINE_PADDING + LABEL_COLUMN_WIDTH + (cycle - 1) * CYCLE_COLUMN_WIDTH;
  const timelineWidth = TIMELINE_PADDING * 2 + LABEL_COLUMN_WIDTH + cycleCount * CYCLE_COLUMN_WIDTH;
  let left = cellLeft + CYCLE_COLUMN_WIDTH + 8;
  if (left + POPOVER_WIDTH > timelineWidth) {
    left = Math.max(TIMELINE_PADDING, cellLeft - POPOVER_WIDTH - 8);
  }
  const top = TIMELINE_PADDING + ROW_HEIGHT + rowIndex * ROW_HEIGHT + ROW_HEIGHT + 6;
  return { left, top };
}

function CellPopover({
  cell,
  cellKey,
  events,
  instruction,
  position,
  onClose,
}: {
  cell: CycleSnapshot["timeline"][number];
  cellKey: string;
  events: PipelineEvent[];
  instruction: Instruction | undefined;
  position: { left: number; top: number };
  onClose: (returnFocus: boolean) => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, [cellKey]);

  return (
    <div
      className="cell-popover"
      role="dialog"
      aria-label="Cell details"
      tabIndex={-1}
      ref={dialogRef}
      style={position}
    >
      <button
        className="panel-close-button popover-close"
        type="button"
        aria-label="Close cell details"
        onClick={() => onClose(false)}
      >
        <X size={13} />
      </button>
      <h2>{instruction?.text ?? `pc 0x${formatHex(cell.pc)}`}</h2>
      <p className="muted">
        S{cell.seqId}, {cell.stage}, cycle {cell.cycle}
        {instruction ? `, line ${instruction.source.line}` : ""}
      </p>
      <EventList events={events} emptyText="No events in this cycle." />
    </div>
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
