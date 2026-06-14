# AGENTS.md

## Project Overview

CPU Pipeline Playground is a TypeScript + Vite + React workbench for writing short RV32I programs for the `rask` CPU and observing a 5-stage in-order pipeline.

## Source Of Truth

- CPU semantics, ISA behavior, pipeline timing, memory, MMIO, errors, exit / error / pause behavior, and verification contracts are defined in `docs/rask-spec.md`.
- Product scope and UX direction are defined in `docs/design.md`.
- Implementation sequencing for moving the current code toward `docs/rask-spec.md` is defined in `docs/rv32i-roadmap.md`.
- Terms whose interpretation can affect specifications or implementation are defined in `docs/glossary.md`.
- If code and documentation disagree, treat `docs/rask-spec.md` as authoritative for CPU behavior and update the code toward the spec. Do not preserve old behavior merely because it is currently implemented.

## Engineering Principles

Prefer a few well-formed rules with real explanatory power over many local instructions or special cases. A good rule should be coherent with the rest of the project, explain more than one case, and make future decisions easier.

When adding behavior, first try to derive it from the existing rules and source-of-truth documents. If the behavior does not fit, consider changes in this order:

1. Remove an unnecessary rule or special case.
2. Refine or generalize an existing rule so it explains the new behavior.
3. Add a new rule only when the behavior cannot be expressed cleanly by the existing rules.

Keep rules close to their source of truth. CPU semantics belong in `docs/rask-spec.md`; product and UX direction belong in `docs/design.md`; implementation sequencing belongs in `docs/rv32i-roadmap.md`; terminology belongs in `docs/glossary.md`. Do not duplicate detailed specs or term definitions in `AGENTS.md`.

## Working Boundaries

- Keep CPU logic in `src/core/` independent from React, browser storage, and UI styling.
- UI and CLI should consume core behavior rather than duplicate CPU behavior.
- Keep pseudo-instruction handling in the assembler layer. The simulator should execute validated real instructions.
- Keep UI copy compact. Put deeper explanations in inspectors, event details, or tooltips.
- Keep the workbench layout stable for desktop and landscape-tablet widths. Do not optimize for phone-width layouts unless the product scope changes.

## Commands

- When installing dependencies, run `npm install`.
- When starting the local app for manual browser checks, run `npm run dev`.
- When checking TypeScript correctness, run `npm run check`.
- When verifying core or React behavior, run `npm run test`.
- When validating the production bundle, run `npm run build`.
- When verifying browser-level workbench flows, run `npm run e2e`.
- When checking dependency advisories, run `npm audit`.
- When formatting the repository, run `npm run format`.
- When checking formatting without writing changes, run `npm run format:check`.

## Testing

Run the narrowest check that matches the change. Broaden verification when the change affects shared CPU behavior, UI workflows, build configuration, or oracle fixtures.

For CPU semantics, pipeline timing, assembler behavior, or oracle fixtures, follow the test layering in `docs/rv32i-roadmap.md`.

## Safety

- Preserve user edits in the worktree. If unrelated files are dirty, leave them alone.
- Avoid destructive git commands unless the user explicitly asks for them.
- Do not commit generated folders such as `node_modules/`, `dist/`, `coverage/`, `playwright-report/`, `test-results/`, `oracle/generated/`, or `oracle/signatures/`.
