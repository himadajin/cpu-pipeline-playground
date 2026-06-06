import clsx from "clsx";
import { ChevronDown, Copy, FilePlus, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ProgramDocument } from "../../core";
import type { ProgramStatus } from "../hooks/usePrograms";
import { ToolbarButton } from "./ToolbarButton";

export function ProgramSwitcher({
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
