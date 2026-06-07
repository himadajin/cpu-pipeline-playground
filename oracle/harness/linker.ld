OUTPUT_ARCH(riscv)
ENTRY(_start)

MEMORY
{
  ram (rwx) : ORIGIN = 0x80000000, LENGTH = 128M
}

SECTIONS
{
  . = ORIGIN(ram);

  .text : ALIGN(4)
  {
    *(.text.start)
    *(.text*)
  } > ram

  .rodata : ALIGN(4)
  {
    *(.rodata*)
  } > ram

  .data : ALIGN(4)
  {
    *(.data*)
  } > ram

  .bss : ALIGN(4)
  {
    *(.bss*)
    *(COMMON)
  } > ram

  . = 0x80010000;
  __oracle_data_start = .;
  .oracle_data (NOLOAD) : ALIGN(4)
  {
    . = . + 0x1000;
  } > ram

  . = ALIGN(16);
  . = . + 0x4000;
  __stack_top = .;
}
