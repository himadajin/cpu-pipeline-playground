.section .text.start
.global _start
_start:
  la sp, __stack_top
  la x31, __oracle_data_start
  j oracle_test
