import { SAMPLE_PROGRAMS, type ProgramDocument } from "../core";

const STORAGE_KEY = "cpu-pipeline-playground.programs.v1";

export function loadPrograms(): ProgramDocument[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedPrograms();
    const parsed = JSON.parse(raw) as ProgramDocument[];
    return parsed.length > 0 ? parsed : seedPrograms();
  } catch {
    return seedPrograms();
  }
}

export function savePrograms(programs: ProgramDocument[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(programs));
}

export function createProgram(existing: ProgramDocument[]): ProgramDocument {
  return {
    id: crypto.randomUUID(),
    name: nextName(existing, "Untitled"),
    source: "addi x1, x0, 1\naddi x2, x1, 2\nadd x3, x1, x2\n",
    updatedAt: Date.now(),
  };
}

export function duplicateProgram(program: ProgramDocument, existing: ProgramDocument[]): ProgramDocument {
  return {
    ...program,
    id: crypto.randomUUID(),
    name: nextName(existing, `${program.name} copy`),
    updatedAt: Date.now(),
  };
}

function seedPrograms(): ProgramDocument[] {
  return SAMPLE_PROGRAMS.map((program) => ({ ...program, id: `${program.id}-${crypto.randomUUID()}` }));
}

function nextName(programs: ProgramDocument[], base: string): string {
  const names = new Set(programs.map((program) => program.name));
  if (!names.has(base)) return base;
  for (let index = 2; ; index += 1) {
    const candidate = `${base} ${index}`;
    if (!names.has(candidate)) return candidate;
  }
}
