# QEMU Reference Testing

This directory contains the local oracle harness for comparing this app's assembler and simulator against RV32I behavior from a RISC-V embedded toolchain and QEMU.

QEMU is the oracle for instruction semantics, not for pipeline timing, forwarding events, stall shape, flush visualization, or UI behavior. Those app-specific behaviors stay covered by the normal core, UI, and e2e tests.

## Fixture Principles

Oracle fixtures are executable semantic examples. A fixture should make the architectural behavior under test clear in the smallest common assembly fragment that both the app assembler and GNU assembler can read.

Keep test intent in `oracle/fixtures/*.asm`. Keep execution mechanics outside fixtures: QEMU-only directives, startup code, shutdown behavior, signature output, and normalization belong in the harness and producers. This keeps fixture code close to the assembly users can reason about in the app.

Fixtures should not depend on TypeScript internal types or simulator pipeline data structures. They compare architectural runtime semantics only.

When test coverage changes, prefer fixtures that explain the behavior they protect over broad instruction catalogs. Redundant fixtures should be removed when they no longer protect distinct architectural behavior.

## Fixtures And Signatures

`oracle/fixtures/manifest.json` describes the current fixture set and the shared observation defaults. It should stay focused on what the harness needs to compare architectural state, not on simulator implementation details.

Producers write text signatures as `key=value` lines. The comparator only reads these signatures and does not depend on QEMU, ELF, Docker, or simulator internals.

The current harness initializes `x31` to `0x80010000`, the data region used by memory fixtures and signature capture. Fixture code should treat that value as an initial register supplied by the manifest, not as a QEMU directive.

## Commands

```bash
npm run oracle:sim
npm run oracle:qemu
npm run oracle:compare
npm run oracle:test
```

`npm run oracle:qemu` builds the repo-local Docker image on first use. The image contains:

- `@xpack-dev-tools/riscv-none-elf-gcc@15.2.0-1.1`
- `@xpack-dev-tools/qemu-riscv@9.2.4-1.1`

The host only needs Docker and the normal Node project dependencies.
