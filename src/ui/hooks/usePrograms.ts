import { useEffect, useMemo, useState } from "react";
import { assemble, type ProgramDocument } from "../../core";
import { createProgram, duplicateProgram, loadPrograms, savePrograms } from "../programStore";

export type ProgramStatus = { errors: number };

export function usePrograms() {
  const [programs, setPrograms] = useState<ProgramDocument[]>(() => loadPrograms());
  const [selectedProgramId, setSelectedProgramId] = useState(() => programs[0]?.id ?? "");
  const selectedProgram = programs.find((program) => program.id === selectedProgramId) ?? programs[0];
  const statuses = useMemo(
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
    if (programId === selectedProgram?.id) {
      setSelectedProgramId(nextPrograms[Math.min(deletedIndex, nextPrograms.length - 1)].id);
    }
  }

  return {
    programs,
    selectedProgram,
    selectedProgramId,
    statuses,
    actions: {
      createNewProgram,
      deleteProgram,
      duplicateSelectedProgram,
      renameProgram: (programId: string, name: string) => updateProgramById(programId, { name }),
      selectProgram,
      updateProgramById,
      updateSelectedProgram,
    },
  };
}
