FROM node:22.12.0-bookworm-slim@sha256:35531c52ce27b6575d69755c73e65d4468dba93a25644eed56dc12879cae9213

RUN npm install -g xpm@0.20.8 && \
  xpm install --global \
  @xpack-dev-tools/riscv-none-elf-gcc@15.2.0-1.1 \
  @xpack-dev-tools/qemu-riscv@9.2.4-1.1

ENV PATH="/root/.local/xPacks/@xpack-dev-tools/riscv-none-elf-gcc/15.2.0-1.1/.content/bin:/root/.local/xPacks/@xpack-dev-tools/qemu-riscv/9.2.4-1.1/.content/bin:${PATH}"

ENTRYPOINT []
