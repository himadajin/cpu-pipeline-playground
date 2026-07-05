import { useEffect, useMemo, useRef, useState } from "react";
import { assemble, type ProgramDocument } from "../../core";
import { createInitialPrograms, createProgram, duplicateProgram, loadPrograms, savePrograms } from "../programStore";

export type ProgramStatus = { errors: number };

export type DeletedProgram = { program: ProgramDocument; index: number };

export function usePrograms() {
  const [programs, setPrograms] = useState<ProgramDocument[]>(() => loadPrograms());
  const [selectedProgramId, setSelectedProgramId] = useState(() => programs[0]?.id ?? "");
  // The most recent deletion, kept so an undo toast can restore it in place.
  const [recentlyDeleted, setRecentlyDeleted] = useState<DeletedProgram | null>(null);
  const selectedProgram = programs.find((program) => program.id === selectedProgramId) ?? programs[0];
  // Memoized per source text so one keystroke reassembles only the edited program.
  const statusCacheRef = useRef(new Map<string, ProgramStatus>());
  const statuses = useMemo(() => {
    const cache = statusCacheRef.current;
    const next = new Map<string, ProgramStatus>();
    const liveSources = new Set<string>();
    for (const program of programs) {
      liveSources.add(program.source);
      let status = cache.get(program.source);
      if (!status) {
        const result = assemble(program.source);
        status = { errors: result.ok ? 0 : result.errors.length };
        cache.set(program.source, status);
      }
      next.set(program.id, status);
    }
    for (const cachedSource of cache.keys()) {
      if (!liveSources.has(cachedSource)) cache.delete(cachedSource);
    }
    return next;
  }, [programs]);

  useEffect(() => savePrograms(programs), [programs]);

  function updateProgramById(programId: string, changes: Partial<ProgramDocument>) {
    setPrograms((current) =>
      current.map((program) =>
        program.id === programId ? { ...program, ...changes, updatedAt: Date.now() } : program,
      ),
    );
  }

  function updateSelectedProgram(changes: Partial<ProgramDocument>) {
    if (!selectedProgram) return;
    updateProgramById(selectedProgram.id, changes);
  }

  function createNewProgram() {
    const next = createProgram(programs);
    setPrograms((current) => [...current, next]);
    setSelectedProgramId(next.id);
    return next;
  }

  function duplicateSelectedProgram() {
    if (!selectedProgram) return null;
    const next = duplicateProgram(selectedProgram, programs);
    setPrograms((current) => [...current, next]);
    setSelectedProgramId(next.id);
    return next;
  }

  function selectProgram(programId: string) {
    if (!programs.some((program) => program.id === programId)) return;
    setSelectedProgramId(programId);
  }

  function deleteProgram(programId: string) {
    if (programs.length <= 1) return;
    const deletedIndex = programs.findIndex((program) => program.id === programId);
    if (deletedIndex < 0) return;
    const nextPrograms = programs.filter((program) => program.id !== programId);
    setPrograms(nextPrograms);
    setRecentlyDeleted({ program: programs[deletedIndex], index: deletedIndex });
    if (programId === selectedProgram?.id) {
      setSelectedProgramId(nextPrograms[Math.min(deletedIndex, nextPrograms.length - 1)].id);
    }
  }

  function undoDelete() {
    if (!recentlyDeleted) return;
    const { program, index } = recentlyDeleted;
    setPrograms((current) => {
      const next = [...current];
      next.splice(Math.min(index, next.length), 0, program);
      return next;
    });
    setSelectedProgramId(program.id);
    setRecentlyDeleted(null);
  }

  function dismissDeleted() {
    setRecentlyDeleted(null);
  }

  function restoreInitialPrograms() {
    const nextPrograms = createInitialPrograms();
    setPrograms(nextPrograms);
    setSelectedProgramId(nextPrograms[0]?.id ?? "");
    setRecentlyDeleted(null);
  }

  return {
    programs,
    selectedProgram,
    selectedProgramId,
    statuses,
    recentlyDeleted,
    actions: {
      createNewProgram,
      deleteProgram,
      dismissDeleted,
      duplicateSelectedProgram,
      renameProgram: (programId: string, name: string) => updateProgramById(programId, { name }),
      restoreInitialPrograms,
      selectProgram,
      undoDelete,
      updateProgramById,
      updateSelectedProgram,
    },
  };
}
