# AGENTS.md

## Project Overview

CPU Pipeline Playground is a TypeScript + Vite + React app for writing small RISC-V-like assembly programs and observing a 5-stage in-order pipeline.

The product direction is documented in `docs/design.md`. Treat that file as the source of truth for product scope and UX intent. ISA expansion and RV32I compatibility direction are documented in `docs/rv32i-roadmap.md`. The app is intentionally a dense IDE-style workbench, not a marketing page or tutorial-first site.

## Architecture

- `src/core/` contains UI-independent CPU logic:
  - `assembler.ts`: parses the RISC-V-like assembly subset.
  - `simulator.ts`: models IF / ID / EX / MEM / WB, hazards, stalls, forwarding, branch flushes, commits, register diffs, and memory diffs.
  - `samples.ts`: seed programs for the Program Library. Samples are normal programs, not a special feature path.
  - `types.ts`: shared data contracts used by core, CLI, tests, and UI.
- `src/cli.ts` uses the same core assembler/simulator as the UI.
- `src/ui/` contains the React workbench:
  - `App.tsx`: Program Library, toolbar, stage board, timeline, event strip, inspector.
  - `asmLanguage.ts`: CodeMirror configuration and assembler diagnostics.
  - `programStore.ts`: localStorage-backed program persistence.
  - `styles.css`: dense tool UI styling.
- `tests/core/` covers assembler and simulator behavior with Vitest.
- `tests/ui/` covers React interaction with React Testing Library.
- `tests/e2e/` covers browser-level workbench behavior with Playwright.

Keep `src/core/` independent from React, browser storage, and UI styling. UI and CLI should consume core state rather than duplicate CPU behavior.

## Setup Commands

- Install dependencies: `npm install`
- Start local dev server: `npm run dev`
- Run the CLI smoke sample: `npm run cli -- examples/forwarding.asm 8`

## Verification Commands

Run the narrowest useful check while iterating, then run the full set before handing off broad changes.

- Type check: `npm run check`
- Unit and React tests: `npm run test`
- Production build: `npm run build`
- Browser e2e: `npm run e2e`
- Dependency audit: `npm audit`

`npm run e2e` starts a Vite dev server from `playwright.config.ts`. If port `5173` is already occupied by an old dev server, stop that process or update the test server port intentionally.

## Code Style

- Use TypeScript strict mode.
- Keep edits scoped to the existing module boundaries.
- Prefer shared core functions and typed data structures over ad hoc UI-side logic.
- Use CodeMirror 6 for editor behavior.
- Use Tailwind/CSS, Radix UI Primitives, and lucide-react for UI controls and icons.
- Keep UI copy compact. Put deeper explanations in the inspector or tooltips rather than long page text.
- Keep the workbench layout stable at desktop and landscape-tablet sizes. Do not optimize for phone-width layouts unless the product scope changes.

## Simulator Rules

- Follow `docs/rv32i-roadmap.md` when changing instruction semantics or adding opcodes. Do not add instructions opportunistically outside the agreed phase.
- Treat RV32I semantic alignment as the direction for implemented base integer instructions. Old behavior that conflicts with RV32I should be treated as a bug unless the roadmap explicitly says otherwise.
- Keep `nop` and future pseudo instructions in the assembler layer. The simulator should execute expanded real instructions, with source mapping preserved for UI explanation.
- Do not add out-of-order execution, register renaming, ROB, caches, exceptions, interrupts, OS behavior, ABI compatibility, privileged behavior, `ecall`, `ebreak`, or `fence` without an explicit scope change.
- Do not overbuild future trap/system/ordering support, but avoid type designs that make those instruction classes impossible to add later.
- When changing pipeline behavior, update or add Vitest cases for representative commit, memory, forwarding, stall, and flush scenarios.
- Register `x0` must remain zero.
- Program edits after a run should invalidate the current simulation instead of silently mutating an in-flight execution.

## UI Rules

- The primary visualization is the horizontal cycle by vertical instruction timeline.
- The IF / ID / EX / MEM / WB stage board is a helper view, not the main representation.
- Timeline cells should expose stage and event information such as `stall`, `flush`, `forward`, and `commit`.
- Inspector selection should explain the selected instruction/cycle/event and show relevant register or memory diffs.
- Program Library is a general feature. Initial samples are seed data inside the same library, not a sample-only special case.
- Avoid decorative cards, hero sections, and large explanatory panels. This should feel like a compact development tool.

## Testing Guidance

- Add core tests for any assembler or simulator behavior change.
- For instruction changes, follow the test layering in `docs/rv32i-roadmap.md`: assembler diagnostics, semantic tests, representative pipeline interaction tests, and selective UI/e2e coverage.
- When changing instruction semantics or oracle fixtures, preserve the fixture principles in `oracle/README.md`.
- Add React Testing Library tests for UI state changes that do not require a real browser.
- Add or update Playwright tests for flows involving CodeMirror, timeline selection, layout integrity, or browser storage behavior.
- If CodeMirror causes jsdom geometry issues, patch browser geometry in `tests/setup.ts` rather than weakening product code.

## Safety Notes

- Do not commit generated folders such as `node_modules/`, `dist/`, `coverage/`, `playwright-report/`, or `test-results/`.
- Avoid destructive git commands unless the user explicitly asks for them.
- Preserve user edits in the worktree. If unrelated files are dirty, leave them alone.
