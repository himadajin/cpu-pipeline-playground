import CodeMirror from "@uiw/react-codemirror";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import * as Tooltip from "@radix-ui/react-tooltip";
import clsx from "clsx";
import { ChevronDown, Copy, FilePlus, Pencil, RotateCcw, StepBack, StepForward, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  assemble,
  type CycleSnapshot,
  type PipelineEvent,
  type ProgramDocument,
  type SelectedCell,
  type StageName,
} from "../core";
import { assemblyExtensions } from "./asmLanguage";
import { usePrograms, type ProgramStatus } from "./hooks/usePrograms";
import { useSimulationSession } from "./hooks/useSimulationSession";
import { useWorkbenchLayout, type BottomTab, type RightTab } from "./hooks/useWorkbenchLayout";

const STAGES: StageName[] = ["IF", "ID", "EX", "MEM", "WB"];

export function App() {
  const programLibrary = usePrograms();
  const { programs, selectedProgram, statuses: programStatuses } = programLibrary;
  const session = useSimulationSession({
    programId: selectedProgram?.id ?? "",
    source: selectedProgram?.source ?? "",
  });
  const workbenchLayout = useWorkbenchLayout();
  const { dimensions, layout } = workbenchLayout;
  const [lintCount, setLintCount] = useState(0);
  const {
    activeEventSnapshot,
    assembled,
    invalidated,
    selectedCell,
    selectedEvents,
    selectedInstruction,
    selectedSnapshot,
    simulation,
    snapshots,
    timelineCells,
  } = session;

  const editorExtensions = useMemo(
    () => [...assemblyExtensions(setLintCount), EditorView.contentAttributes.of({ "aria-label": "Assembly source" })],
    [],
  );

  return (
    <Tooltip.Provider>
      <div className="app-shell">
        <header className="toolbar">
          <div className="brand">CPU Pipeline Playground</div>
          <ProgramSwitcher
            programs={programs}
            selectedProgram={selectedProgram}
            statuses={programStatuses}
            invalidated={invalidated}
            onSelect={programLibrary.actions.selectProgram}
            onCreate={programLibrary.actions.createNewProgram}
            onDuplicate={programLibrary.actions.duplicateSelectedProgram}
            onRename={programLibrary.actions.renameProgram}
            onDelete={programLibrary.actions.deleteProgram}
          />
          <div className="toolbar-spacer" />
          <ToolbarButton label="Reset" onClick={session.actions.reset} disabled={!assembled.ok}>
            <RotateCcw size={16} />
          </ToolbarButton>
          <ToolbarButton label="Back" onClick={session.actions.stepBack}>
            <StepBack size={16} />
          </ToolbarButton>
          <ToolbarButton label="Step" onClick={session.actions.step} disabled={!assembled.ok || invalidated || simulation.current.halted}>
            <StepForward size={16} />
          </ToolbarButton>
        </header>

        <main
          className="workbench"
          style={{
            gridTemplateColumns: `minmax(0, 1fr) ${layout.rightOpen ? layout.rightWidth : dimensions.rightRailWidth}px`,
          }}
        >
          <section
            className="center-pane"
            style={{
              gridTemplateRows: `minmax(0, 1fr) ${layout.bottomOpen ? layout.bottomHeight : dimensions.bottomRailHeight}px`,
            }}
          >
            <section className="pipeline-panel">
              <div className="pipeline-header">
                <span>Pipeline</span>
                <div className="pipeline-status">
                  <span className="mini-status">cycle {simulation.current.cycle}</span>
                  <span className={clsx("mini-status", !assembled.ok && "bad")}>
                    {assembled.ok ? `${assembled.instructions.length} instructions` : `${assembled.errors.length} assemble errors`}
                  </span>
                  {invalidated && <span className="mini-status warn">simulation invalidated</span>}
                </div>
              </div>
              <StageBoard snapshot={simulation.current} />
              <Timeline
                instructions={assembled.instructions}
                snapshots={snapshots}
                cells={timelineCells}
                currentCycle={simulation.current.cycle}
                selectedCell={selectedCell}
                onSelect={session.actions.selectCell}
              />
            </section>
            <BottomDrawer
              activeTab={layout.bottomTab}
              open={layout.bottomOpen}
              onTabChange={workbenchLayout.actions.selectBottomTab}
              onOpenChange={workbenchLayout.actions.setBottomOpen}
              onResizeStart={workbenchLayout.actions.startBottomResize}
              snapshot={activeEventSnapshot}
              selectedCell={selectedCell}
              invalidated={invalidated}
              lintCount={lintCount}
              source={selectedProgram.source}
              editorExtensions={editorExtensions}
              onSourceChange={(value) => programLibrary.actions.updateSelectedProgram({ source: value })}
            />
          </section>

          <aside className={clsx("right-pane", !layout.rightOpen && "collapsed")}>
            <RightDock
              activeTab={layout.rightTab}
              open={layout.rightOpen}
              onTabChange={workbenchLayout.actions.selectRightTab}
              onOpenChange={workbenchLayout.actions.setRightOpen}
              onResizeStart={workbenchLayout.actions.startRightResize}
              selectedInstruction={selectedInstruction}
              selectedSnapshot={selectedSnapshot}
              selectedEvents={selectedEvents}
              current={simulation.current}
            />
          </aside>
        </main>
      </div>
    </Tooltip.Provider>
  );
}

function ProgramSwitcher({
  programs,
  selectedProgram,
  statuses,
  invalidated,
  onSelect,
  onCreate,
  onDuplicate,
  onRename,
  onDelete,
}: {
  programs: ProgramDocument[];
  selectedProgram: ProgramDocument;
  statuses: Map<string, ProgramStatus>;
  invalidated: boolean;
  onSelect: (programId: string) => void;
  onCreate: () => ProgramDocument;
  onDuplicate: () => void;
  onRename: (programId: string, name: string) => void;
  onDelete: (programId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const switcherRef = useRef<HTMLDivElement | null>(null);
  const selectedStatus = getProgramStatusLabel(selectedProgram, selectedProgram, statuses, invalidated);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!switcherRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setEditingId(null);
      }
    }
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function startRename(program: ProgramDocument) {
    setEditingId(program.id);
    setDraftName(program.name);
  }

  function commitRename() {
    if (!editingId) return;
    onRename(editingId, draftName.trim() || "Untitled");
    setEditingId(null);
  }

  return (
    <div className="program-switcher" ref={switcherRef}>
      <button
        className="program-trigger"
        type="button"
        aria-label={`Select program: ${selectedProgram.name}, ${selectedStatus}`}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="program-trigger-copy">
          <span className="program-trigger-name">{selectedProgram.name}</span>
          <span className="program-trigger-status">{selectedStatus}</span>
        </span>
        <ChevronDown size={15} />
      </button>

      {open && (
        <div className="program-menu" role="menu" aria-label="Programs">
          <div className="program-menu-actions">
            <button
              className="program-menu-action"
              type="button"
              aria-label="New program"
              onClick={() => {
                const next = onCreate();
                startRename(next);
              }}
            >
              <FilePlus size={14} />
              <span>New</span>
            </button>
            <button className="program-menu-action" type="button" aria-label="Duplicate program" onClick={onDuplicate}>
              <Copy size={14} />
              <span>Duplicate</span>
            </button>
          </div>
          <div className="program-menu-list">
            {programs.map((program) => {
              const selected = program.id === selectedProgram.id;
              const status = getProgramStatusLabel(program, selectedProgram, statuses, invalidated);
              const editing = editingId === program.id;
              return (
                <div className={clsx("program-menu-row", selected && "selected")} key={program.id}>
                  {editing ? (
                    <input
                      className="program-rename-input"
                      value={draftName}
                      autoFocus
                      aria-label="Program name"
                      onChange={(event) => setDraftName(event.target.value)}
                      onBlur={commitRename}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") commitRename();
                        if (event.key === "Escape") setEditingId(null);
                      }}
                    />
                  ) : (
                    <button
                      className="program-menu-select"
                      type="button"
                      onClick={() => {
                        onSelect(program.id);
                        setOpen(false);
                      }}
                      aria-current={selected ? "true" : undefined}
                    >
                      <span className="program-row-name">{program.name}</span>
                      <span className="program-row-meta">{status}</span>
                    </button>
                  )}
                  <div className="program-row-actions">
                    <ToolbarButton label={`Rename ${program.name}`} onClick={() => startRename(program)}>
                      <Pencil size={13} />
                    </ToolbarButton>
                    <ToolbarButton
                      label={`Delete ${program.name}`}
                      onClick={() => onDelete(program.id)}
                      disabled={programs.length <= 1}
                    >
                      <X size={14} />
                    </ToolbarButton>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function getProgramStatusLabel(
  program: ProgramDocument,
  selectedProgram: ProgramDocument,
  statuses: Map<string, ProgramStatus>,
  invalidated: boolean,
) {
  const status = statuses.get(program.id);
  if (program.id === selectedProgram.id && invalidated) return "modified";
  if (status && status.errors > 0) return `${status.errors} errors`;
  return "ready";
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button className="icon-button" onClick={onClick} disabled={disabled} aria-label={label}>
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={5}>
          {label}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

function TabButton<T extends string>({
  id,
  active,
  onSelect,
  children,
}: {
  id: T;
  active: boolean;
  onSelect: (id: T) => void;
  children: React.ReactNode;
}) {
  return (
    <button className={clsx("tab-button", active && "active")} type="button" onClick={() => onSelect(id)} aria-pressed={active}>
      {children}
    </button>
  );
}

function BottomDrawer({
  activeTab,
  open,
  onTabChange,
  onOpenChange,
  onResizeStart,
  snapshot,
  selectedCell,
  invalidated,
  lintCount,
  source,
  editorExtensions,
  onSourceChange,
}: {
  activeTab: BottomTab;
  open: boolean;
  onTabChange: (tab: BottomTab) => void;
  onOpenChange: (open: boolean) => void;
  onResizeStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
  snapshot: CycleSnapshot;
  selectedCell: SelectedCell | null;
  invalidated: boolean;
  lintCount: number;
  source: string;
  editorExtensions: Extension[];
  onSourceChange: (value: string) => void;
}) {
  if (!open) {
    return (
      <section className="bottom-rail" aria-label="Bottom drawer rail">
        <button
          className={clsx("rail-tab", activeTab === "assembly" && "active")}
          type="button"
          onClick={() => onTabChange("assembly")}
          aria-label="Open Assembly"
        >
          Assembly
        </button>
        <button
          className={clsx("rail-tab", activeTab === "events" && "active")}
          type="button"
          onClick={() => onTabChange("events")}
          aria-label="Open Events"
        >
          Events
        </button>
      </section>
    );
  }

  return (
    <section className="bottom-drawer">
      <button className="resize-handle bottom-resizer" type="button" aria-label="Resize bottom drawer" onPointerDown={onResizeStart} />
      <div className="tab-bar">
        <div className="tab-list" role="tablist" aria-label="Bottom drawer">
          <TabButton id="assembly" active={activeTab === "assembly"} onSelect={onTabChange}>
            Assembly
          </TabButton>
          <TabButton id="events" active={activeTab === "events"} onSelect={onTabChange}>
            Events
          </TabButton>
        </div>
        <div className="header-status">
          {activeTab === "assembly" && invalidated && <span className="mini-status warn">modified after run</span>}
          {activeTab === "assembly" && <span className={clsx("mini-status", lintCount > 0 && "bad")}>{lintCount} errors</span>}
          {activeTab === "events" && (
            <span className="mini-status">{selectedCell ? `selected cycle ${snapshot.cycle}` : `cycle ${snapshot.cycle}`}</span>
          )}
          <button className="panel-close-button" type="button" aria-label="Close bottom drawer" onClick={() => onOpenChange(false)}>
            <X size={13} />
          </button>
        </div>
      </div>
      <div className="drawer-body">
        {activeTab === "assembly" ? (
          <CodeMirror
            value={source}
            height="100%"
            basicSetup={{ foldGutter: false, highlightActiveLine: true }}
            extensions={editorExtensions}
            onChange={onSourceChange}
          />
        ) : (
          <EventList events={snapshot.events} emptyText="No events in this cycle." />
        )}
      </div>
    </section>
  );
}

function RightDock({
  activeTab,
  open,
  onTabChange,
  onOpenChange,
  onResizeStart,
  selectedInstruction,
  selectedSnapshot,
  selectedEvents,
  current,
}: {
  activeTab: RightTab;
  open: boolean;
  onTabChange: (tab: RightTab) => void;
  onOpenChange: (open: boolean) => void;
  onResizeStart: (event: React.PointerEvent<HTMLButtonElement>) => void;
  selectedInstruction: ReturnType<typeof assemble>["instructions"][number] | null | undefined;
  selectedSnapshot: CycleSnapshot | undefined;
  selectedEvents: PipelineEvent[];
  current: CycleSnapshot;
}) {
  if (!open) {
    return (
      <section className="right-rail" aria-label="Right dock rail">
        <button
          className={clsx("rail-tab vertical", activeTab === "inspector" && "active")}
          type="button"
          onClick={() => onTabChange("inspector")}
          aria-label="Open Inspector"
        >
          Inspector
        </button>
        <button
          className={clsx("rail-tab vertical", activeTab === "registers" && "active")}
          type="button"
          onClick={() => onTabChange("registers")}
          aria-label="Open Registers"
        >
          Registers
        </button>
        <button
          className={clsx("rail-tab vertical", activeTab === "memory" && "active")}
          type="button"
          onClick={() => onTabChange("memory")}
          aria-label="Open Memory"
        >
          Memory
        </button>
      </section>
    );
  }

  return (
    <section className="right-dock">
      <button className="resize-handle right-resizer" type="button" aria-label="Resize right dock" onPointerDown={onResizeStart} />
      <div className="tab-bar">
        <div className="tab-list" role="tablist" aria-label="Inspector dock">
          <TabButton id="inspector" active={activeTab === "inspector"} onSelect={onTabChange}>
            Inspector
          </TabButton>
          <TabButton id="registers" active={activeTab === "registers"} onSelect={onTabChange}>
            Registers
          </TabButton>
          <TabButton id="memory" active={activeTab === "memory"} onSelect={onTabChange}>
            Memory
          </TabButton>
        </div>
        <button className="panel-close-button" type="button" aria-label="Close right dock" onClick={() => onOpenChange(false)}>
          <X size={13} />
        </button>
      </div>
      <div className="dock-body">
        {activeTab === "inspector" && (
          <InspectorPanel
            selectedInstruction={selectedInstruction}
            selectedSnapshot={selectedSnapshot}
            selectedEvents={selectedEvents}
          />
        )}
        {activeTab === "registers" && <RegistersPanel current={current} />}
        {activeTab === "memory" && <MemoryPanel current={current} />}
      </div>
    </section>
  );
}

function StageBoard({ snapshot }: { snapshot: CycleSnapshot }) {
  return (
    <section className="stage-board">
      {STAGES.map((stage) => {
        const slot = snapshot.stages[stage];
        return (
          <div className="stage-tile" key={stage}>
            <div className="stage-name">{stage}</div>
            <div className="stage-inst">{slot?.instruction.text ?? "."}</div>
          </div>
        );
      })}
    </section>
  );
}

function Timeline({
  instructions,
  snapshots,
  cells,
  currentCycle,
  selectedCell,
  onSelect,
}: {
  instructions: ReturnType<typeof assemble>["instructions"];
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
              <span className="line-number">L{instruction.source.line}</span>
              {" "}
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

function EventList({ events, emptyText }: { events: PipelineEvent[]; emptyText: string }) {
  return (
    <div className="event-list">
      {events.length === 0 ? (
        <p className="muted">{emptyText}</p>
      ) : (
        events.map((event) => (
          <div className={clsx("event-detail", event.kind)} key={event.id}>
            <strong>{event.label}</strong>
            <span>{event.message}</span>
          </div>
        ))
      )}
    </div>
  );
}

function InspectorPanel({
  selectedInstruction,
  selectedSnapshot,
  selectedEvents,
}: {
  selectedInstruction: ReturnType<typeof assemble>["instructions"][number] | null | undefined;
  selectedSnapshot: CycleSnapshot | undefined;
  selectedEvents: PipelineEvent[];
}) {
  return (
    <section className="inspector-panel">
      {selectedInstruction ? (
        <div className="inspector-section">
          <h2>{selectedInstruction.text}</h2>
          <p className="muted">
            line {selectedInstruction.source.line}, cycle {selectedSnapshot?.cycle ?? "-"}
          </p>
          <EventList events={selectedEvents} emptyText="No event is attached to this instruction in the selected cycle." />
        </div>
      ) : (
        <p className="muted">Select a timeline cell to inspect hazards, forwarding, flushes, and diffs.</p>
      )}
    </section>
  );
}

function RegistersPanel({ current }: { current: CycleSnapshot }) {
  const changedRegisters = new Set(current.registerDiffs.map((diff) => diff.register));

  return (
    <section className="state-panel">
      {current.registerDiffs.length > 0 && (
        <div className="inspector-section">
          <h2>Register Diffs</h2>
          {current.registerDiffs.map((diff) => (
            <div className="diff-row" key={diff.register}>
              x{diff.register}: {diff.before} {"->"} {diff.after}
            </div>
          ))}
        </div>
      )}
      <div className="register-grid" aria-label="Registers">
        {current.registers.map((value, index) => (
          <div className={clsx("register-cell", changedRegisters.has(index) && "changed")} key={index}>
            <span className="register-name">x{index}</span>
            <strong className="register-value">{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function MemoryPanel({ current }: { current: CycleSnapshot }) {
  const entries = Object.entries(current.memory);

  return (
    <section className="state-panel">
      {current.memoryDiffs.length > 0 && (
        <div className="inspector-section">
          <h2>Memory Diffs</h2>
          {current.memoryDiffs.map((diff) => (
            <div className="diff-row" key={diff.address}>
              [{diff.address}]: {diff.before} {"->"} {diff.after}
            </div>
          ))}
        </div>
      )}
      <div className="inspector-section">
        <h2>Memory</h2>
        {entries.length === 0 ? (
          <p className="muted">No memory writes yet.</p>
        ) : (
          entries.map(([address, value]) => (
            <div className="diff-row" key={address}>
              [{address}] = {value}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
