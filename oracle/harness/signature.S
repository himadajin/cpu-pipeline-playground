.section .rodata
oracle_begin_line:
  .asciz "oracle:begin\n"
oracle_end_line:
  .asciz "oracle:end\n"
oracle_equal:
  .asciz "="
oracle_newline:
  .asciz "\n"
oracle_hex_prefix:
  .asciz "0x"
oracle_hex_digits:
  .ascii "0123456789abcdef"
oracle_register_keys:
  .asciz "x0"
  .asciz "x1"
  .asciz "x2"
  .asciz "x3"
  .asciz "x4"
  .asciz "x5"
  .asciz "x6"
  .asciz "x7"
  .asciz "x8"
  .asciz "x9"
  .asciz "x10"
  .asciz "x11"
  .asciz "x12"
  .asciz "x13"
  .asciz "x14"
  .asciz "x15"
  .asciz "x16"
  .asciz "x17"
  .asciz "x18"
  .asciz "x19"
  .asciz "x20"
  .asciz "x21"
  .asciz "x22"
  .asciz "x23"
  .asciz "x24"
  .asciz "x25"
  .asciz "x26"
  .asciz "x27"
  .asciz "x28"
  .asciz "x29"
  .asciz "x30"
  .asciz "x31"
oracle_memory_keys:
  .asciz "mem[data+0]"
  .asciz "mem[data+4]"
  .asciz "mem[data+8]"
  .asciz "mem[data+12]"
  .asciz "mem[data+16]"
  .asciz "mem[data+20]"
  .asciz "mem[data+24]"
  .asciz "mem[data+28]"

.section .text
oracle_putc:
  li t0, 0x10000000
  sb a0, 0(t0)
  ret

oracle_puts:
  addi sp, sp, -16
  sw ra, 12(sp)
  mv t1, a0
1:
  lbu a0, 0(t1)
  beq a0, zero, 2f
  addi t1, t1, 1
  jal ra, oracle_putc
  j 1b
2:
  lw ra, 12(sp)
  addi sp, sp, 16
  ret

oracle_print_hex32:
  addi sp, sp, -16
  sw ra, 12(sp)
  mv t3, a0
  la a0, oracle_hex_prefix
  jal ra, oracle_puts
  li t4, 28
1:
  srl t5, t3, t4
  andi t5, t5, 15
  la s3, oracle_hex_digits
  add s3, s3, t5
  lbu a0, 0(s3)
  jal ra, oracle_putc
  addi t4, t4, -4
  blt t4, zero, 2f
  j 1b
2:
  lw ra, 12(sp)
  addi sp, sp, 16
  ret

oracle_print_key_value:
  addi sp, sp, -16
  sw ra, 12(sp)
  jal ra, oracle_puts
  la a0, oracle_equal
  jal ra, oracle_puts
  mv a0, a1
  jal ra, oracle_print_hex32
  la a0, oracle_newline
  jal ra, oracle_puts
  lw ra, 12(sp)
  addi sp, sp, 16
  ret

oracle_print_registers:
  addi sp, sp, -16
  sw ra, 12(sp)
  li s0, 0
  la s1, oracle_register_keys
  addi s2, x31, 1024
1:
  mv a0, s1
  lw a1, 0(s2)
  jal ra, oracle_print_key_value
2:
  lbu t0, 0(s1)
  addi s1, s1, 1
  bne t0, zero, 2b
  addi s2, s2, 4
  addi s0, s0, 1
  li t1, 32
  blt s0, t1, 1b
  lw ra, 12(sp)
  addi sp, sp, 16
  ret

oracle_print_data_words:
  addi sp, sp, -16
  sw ra, 12(sp)
  li s0, 0
  la s1, oracle_memory_keys
  mv s2, x31
1:
  mv a0, s1
  lw a1, 0(s2)
  jal ra, oracle_print_key_value
2:
  lbu t0, 0(s1)
  addi s1, s1, 1
  bne t0, zero, 2b
  addi s2, s2, 4
  addi s0, s0, 1
  li t1, 8
  blt s0, t1, 1b
  lw ra, 12(sp)
  addi sp, sp, 16
  ret
