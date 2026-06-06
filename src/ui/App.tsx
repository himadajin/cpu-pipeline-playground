import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import * as Tooltip from "@radix-ui/react-tooltip";
import clsx from "clsx";
import { ChevronDown, Copy, FilePlus, Pause, Pencil, Play, RotateCcw, StepBack, StepForward, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  assemble,
  createSimulation,
  runSimulation,
  stepBackSimulation,
  stepSimulation,
  type CycleSnapshot,
  type PipelineEvent,
  type ProgramDocument,
  type SelectedCell,
  type SimulationState,
  type StageName,
} from "../core";
import { assemblyExtensions } from "./asmLanguage";
import { createProgram, duplicateProgram, loadPrograms, savePrograms } from "./programStore";

const STAGES: StageName[] = ["IF", "ID", "EX", "MEM", "WB"];
const MAX_CYCLES = 300;
type ProgramStatus = { errors: number };

export function App() {
  const [programs, setPrograms] = useState<ProgramDocument[]>(() => loadPrograms());
  const [selectedProgramId, setSelectedProgramId] = useState(() => programs[0]?.id ?? "");
  const selectedProgram = programs.find((program) => program.id === selectedProgramId) ?? programs[0];
  const assembled = useMemo(() => assemble(selectedProgram?.source ?? ""), [selectedProgram?.source]);
  const [simulation, setSimulation] = useState<SimulationState>(() => createSimulation([]));
  const [simSource, setSimSource] = useState("");
  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [speed, setSpeed] = useState(550);
  const [lintCount, setLintCount] = useState(0);
  const invalidated = simSource !== selectedProgram?.source && simulation.current.cycle > 0;

  useEffect(() => savePrograms(programs), [programs]);

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => {
      setSimulation((current) => {
        if (current.current.halted || current.current.cycle >= MAX_CYCLES) {
          setIsRunning(false);
          return current;
        }
        return stepSimulation(current);
      });
    }, speed);
    return () => window.clearInterval(timer);
  }, [isRunning, speed]);

  const snapshots = simulation.history;
  const timelineCells = snapshots.flatMap((snapshot) => snapshot.timeline);
  const selectedInstruction = selectedCell
    ? assembled.instructions.find((instruction) => instruction.id === selectedCell.instructionId)
    : null;
  const selectedSnapshot = selectedCell ? snapshots.find((snapshot) => snapshot.cycle === selectedCell.cycle) : undefined;
  const selectedEvents = selectedSnapshot?.events.filter((event) => event.instructionId === selectedCell?.instructionId) ?? [];
  const editorExtensions = useMemo(
    () => [...assemblyExtensions(setLintCount), EditorView.contentAttributes.of({ "aria-label": "Assembly source" })],
    [],
  );
  const programStatuses = useMemo(
    () =>
      new Map(
        programs.map((program) => {
          const result = assemble(program.source);
          const errors = result.ok ? 0 : result.errors.length;
          return [program.id, { errors }];
        }),
      ),
    [programs],
  );

  function updateProgram(changes: Partial<ProgramDocument>) {
    updateProgramById(selectedProgram.id, changes);
  }

  function updateProgramById(programId: string, changes: Partial<ProgramDocument>) {
    setPrograms((current) =>
      current.map((program) =>
        program.id === programId ? { ...program, ...changes, updatedAt: Date.now() } : program,
      ),
    );
  }

  function createNewProgram() {
    const next = createProgram(programs);
    setPrograms((current) => [...current, next]);
    setSelectedProgramId(next.id);
    return next;
  }

  function duplicateSelectedProgram() {
    const next = duplicateProgram(selectedProgram, programs);
    setPrograms((current) => [...current, next]);
    setSelectedProgramId(next.id);
  }

  function deleteProgram(programId: string) {
    if (programs.length <= 1) return;
    const deletedIndex = programs.findIndex((program) => program.id === programId);
    const nextPrograms = programs.filter((program) => program.id !== programId);
    setPrograms(nextPrograms);
    if (programId === selectedProgram.id) {
      setSelectedProgramId(nextPrograms[Math.min(Math.max(deletedIndex, 0), nextPrograms.length - 1)].id);
    }
  }

  function assembleAndReset() {
    const result = assemble(selectedProgram.source);
    if (!result.ok) return;
    setSimulation(createSimulation(result.instructions));
    setSimSource(selectedProgram.source);
    setSelectedCell(null);
    setIsRunning(false);
  }

  function step() {
    if (invalidated) return;
    if (simulation.program.length === 0 && assembled.ok) assembleAndReset();
    setSimulation((current) => stepSimulation(current.program.length === 0 ? createSimulation(assembled.instructions) : current));
    setSimSource(selectedProgram.source);
  }

  function runAll() {
    if (invalidated) return;
    const base = simulation.program.length === 0 ? createSimulation(assembled.instructions) : simulation;
    setSimulation(runSimulation(base, MAX_CYCLES));
    setSimSource(selectedProgram.source);
    setIsRunning(false);
  }

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
            onSelect={setSelectedProgramId}
            onCreate={createNewProgram}
            onDuplicate={duplicateSelectedProgram}
            onRename={(programId, name) => updateProgramById(programId, { name })}
            onDelete={deleteProgram}
          />
          <div className="status-pill">cycle {simulation.current.cycle}</div>
          <div className={clsx("status-pill", assembled.ok ? "ok" : "bad")}>
            {assembled.ok ? `${assembled.instructions.length} instructions` : `${assembled.errors.length} assemble errors`}
          </div>
          {invalidated && <div className="status-pill warn">simulation invalidated</div>}
          <ToolbarButton label="Reset" onClick={assembleAndReset} disabled={!assembled.ok}>
            <RotateCcw size={16} />
          </ToolbarButton>
          <ToolbarButton label="Back" onClick={() => setSimulation((state) => stepBackSimulation(state))}>
            <StepBack size={16} />
          </ToolbarButton>
          <ToolbarButton label="Step" onClick={step} disabled={!assembled.ok || invalidated || simulation.current.halted}>
            <StepForward size={16} />
          </ToolbarButton>
          <ToolbarButton label={isRunning ? "Pause" : "Run"} onClick={() => setIsRunning((value) => !value)} disabled={!assembled.ok || invalidated}>
            {isRunning ? <Pause size={16} /> : <Play size={16} />}
          </ToolbarButton>
          <button className="text-button" onClick={runAll} disabled={!assembled.ok || invalidated}>
            Run all
          </button>
          <label className="speed-control">
            <span>speed</span>
            <input
              type="range"
              min="150"
              max="1100"
              step="50"
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
            />
          </label>
        </header>

        <main className="workbench">
          <section className="center-pane">
            <section className="pipeline-panel">
              <StageBoard snapshot={simulation.current} />
              <Timeline
                instructions={assembled.instructions}
                snapshots={snapshots}
                cells={timelineCells}
                currentCycle={simulation.current.cycle}
                selectedCell={selectedCell}
                onSelect={setSelectedCell}
              />
              <EventStrip snapshot={simulation.current} />
            </section>
            <section className="editor-shell">
              <div className="pane-header">
                <span>Assembly</span>
                <div className="header-status">
                  {invalidated && <span className="mini-status warn">modified after run</span>}
                  <span className={clsx("mini-status", lintCount > 0 && "bad")}>{lintCount} errors</span>
                </div>
              </div>
              <CodeMirror
                value={selectedProgram.source}
                height="100%"
                basicSetup={{ foldGutter: false, highlightActiveLine: true }}
                extensions={editorExtensions}
                onChange={(value) => updateProgram({ source: value })}
              />
            </section>
          </section>

          <aside className="right-pane">
            <Inspector
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
                  <EventBadges events={cell?.events ?? []} />
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

function EventBadges({ events }: { events: PipelineEvent[] }) {
  return (
    <span className="event-badges">
      {events.map((event) => (
        <span className={clsx("event-badge", event.kind)} key={event.id}>
          {event.label}
        </span>
      ))}
    </span>
  );
}

function EventStrip({ snapshot }: { snapshot: CycleSnapshot }) {
  return (
    <section className="event-strip" aria-label="Current cycle events">
      {snapshot.events.length === 0 ? (
        <span className="muted">No events in this cycle.</span>
      ) : (
        snapshot.events.map((event) => (
          <span className={clsx("event-chip", event.kind)} key={event.id}>
            {event.label}: {event.message}
          </span>
        ))
      )}
    </section>
  );
}

function Inspector({
  selectedInstruction,
  selectedSnapshot,
  selectedEvents,
  current,
}: {
  selectedInstruction: ReturnType<typeof assemble>["instructions"][number] | null | undefined;
  selectedSnapshot: CycleSnapshot | undefined;
  selectedEvents: PipelineEvent[];
  current: CycleSnapshot;
}) {
  const changedRegisters = new Set(current.registerDiffs.map((diff) => diff.register));

  return (
    <section className="inspector">
      <div className="pane-header">Inspector</div>
      {selectedInstruction ? (
        <div className="inspector-section">
          <h2>{selectedInstruction.text}</h2>
          <p className="muted">
            line {selectedInstruction.source.line}, cycle {selectedSnapshot?.cycle ?? "-"}
          </p>
          <div className="event-list">
            {selectedEvents.length === 0 ? (
              <p className="muted">No event is attached to this instruction in the selected cycle.</p>
            ) : (
              selectedEvents.map((event) => (
                <div className={clsx("event-detail", event.kind)} key={event.id}>
                  <strong>{event.label}</strong>
                  <span>{event.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <p className="muted">Select a timeline cell to inspect hazards, forwarding, flushes, and diffs.</p>
      )}
      <div className="inspector-section">
        <h2>Register Diffs</h2>
        {current.registerDiffs.length === 0 ? (
          <p className="muted">No register writes in current cycle.</p>
        ) : (
          current.registerDiffs.map((diff) => (
            <div className="diff-row" key={diff.register}>
              x{diff.register}: {diff.before} {"->"} {diff.after}
            </div>
          ))
        )}
      </div>
      <div className="inspector-section">
        <h2>Registers</h2>
        <div className="register-grid">
          {current.registers.map((value, index) => (
            <div className={clsx("register-cell", changedRegisters.has(index) && "changed")} key={index}>
              <span className="register-name">x{index}</span>
              <strong className="register-value">{value}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="inspector-section">
        <h2>Memory</h2>
        {Object.keys(current.memory).length === 0 ? (
          <p className="muted">No memory writes yet.</p>
        ) : (
          Object.entries(current.memory).map(([address, value]) => (
            <div className="diff-row" key={address}>
              [{address}] = {value}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
