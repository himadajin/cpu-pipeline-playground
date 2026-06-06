import type { ProgramDocument } from "./types";

export const SAMPLE_PROGRAMS: ProgramDocument[] = [
  {
    id: "sample-forwarding",
    name: "Forwarding chain",
    updatedAt: 0,
    source: `# Forwarding keeps these ALU dependencies moving.
addi x1, x0, 4
addi x2, x0, 7
add x3, x1, x2
sub x4, x3, x1
and x5, x4, x2
or x6, x5, x1
`,
  },
  {
    id: "sample-load-use",
    name: "Load-use stall",
    updatedAt: 0,
    source: `# The add after lw stalls for one cycle.
addi x1, x0, 16
addi x2, x0, 42
sw x2, 0(x1)
lw x3, 0(x1)
add x4, x3, x2
`,
  },
  {
    id: "sample-branch",
    name: "Branch flush",
    updatedAt: 0,
    source: `addi x1, x0, 3
addi x2, x0, 0
loop:
addi x2, x2, 1
blt x2, x1, loop
jal x0, done
addi x9, x0, 99
done:
xor x5, x2, x1
`,
  },
];
