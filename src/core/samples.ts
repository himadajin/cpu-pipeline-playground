import type { ProgramDocument } from "./types";

export const SAMPLE_PROGRAMS: ProgramDocument[] = [
  {
    id: "sample-sum-four",
    name: "Sum four numbers",
    updatedAt: 0,
    source: `# Sum 1 + 2 + 3 + 4 into x5.
addi x1, x0, 1
addi x2, x0, 2
addi x3, x0, 3
addi x4, x0, 4
add x5, x1, x2
add x5, x5, x3
add x5, x5, x4
`,
  },
  {
    id: "sample-store-reload",
    name: "Store and reload",
    updatedAt: 0,
    source: `# Store a temporary value, load it back, then add 8.
addi x1, x0, 16
addi x2, x0, 34
sw x2, 0(x1)
lw x3, 0(x1)
addi x4, x3, 8
`,
  },
  {
    id: "sample-choose-larger",
    name: "Choose larger value",
    updatedAt: 0,
    source: `# Put the larger of x1 and x2 into x5.
addi x1, x0, 9
addi x2, x0, 14
blt x1, x2, use_second
add x5, x0, x1
jal x0, done
use_second:
add x5, x0, x2
done:
nop
`,
  },
  {
    id: "sample-counted-loop-sum",
    name: "Counted loop sum",
    updatedAt: 0,
    source: `# Sum 1 through 5 into x5.
addi x1, x0, 5
addi x2, x0, 1
addi x5, x0, 0
loop:
add x5, x5, x2
addi x2, x2, 1
bge x1, x2, loop
`,
  },
  {
    id: "sample-two-word-memory-sum",
    name: "Two-word memory sum",
    updatedAt: 0,
    source: `# Add two memory words and store the result.
addi x1, x0, 32
addi x2, x0, 7
addi x3, x0, 11
sw x2, 0(x1)
sw x3, 4(x1)
lw x4, 0(x1)
lw x5, 4(x1)
add x6, x4, x5
sw x6, 8(x1)
`,
  },
];
