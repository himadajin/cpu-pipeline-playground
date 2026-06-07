# QEMU Reference Testing

This directory contains the local oracle harness for comparing this app's assembler and simulator against RV32I behavior from a RISC-V embedded toolchain and QEMU.

The fixture `.asm` files in `oracle/fixtures/` are intentionally small common assembly fragments. They must stay readable by both the app assembler and GNU assembler. QEMU-only directives, startup code, shutdown behavior, and signature output live in `oracle/harness/` and generated files.

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

## Signature

Producers write text signatures as `key=value` lines. The comparator only reads these signatures and does not depend on QEMU, ELF, Docker, or simulator internals.

The current harness initializes `x31` to `0x80010000`, the data region used by memory fixtures and signature capture. Fixture code should treat that value as an initial register supplied by the manifest, not as a QEMU directive.
