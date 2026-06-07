.section .text
.global oracle_finish
oracle_finish:
  sw x0, 1024(x31)
  sw x1, 1028(x31)
  sw x2, 1032(x31)
  sw x3, 1036(x31)
  sw x4, 1040(x31)
  sw x5, 1044(x31)
  sw x6, 1048(x31)
  sw x7, 1052(x31)
  sw x8, 1056(x31)
  sw x9, 1060(x31)
  sw x10, 1064(x31)
  sw x11, 1068(x31)
  sw x12, 1072(x31)
  sw x13, 1076(x31)
  sw x14, 1080(x31)
  sw x15, 1084(x31)
  sw x16, 1088(x31)
  sw x17, 1092(x31)
  sw x18, 1096(x31)
  sw x19, 1100(x31)
  sw x20, 1104(x31)
  sw x21, 1108(x31)
  sw x22, 1112(x31)
  sw x23, 1116(x31)
  sw x24, 1120(x31)
  sw x25, 1124(x31)
  sw x26, 1128(x31)
  sw x27, 1132(x31)
  sw x28, 1136(x31)
  sw x29, 1140(x31)
  sw x30, 1144(x31)
  sw x31, 1148(x31)

  la sp, __stack_top
  la a0, oracle_begin_line
  jal ra, oracle_puts
  jal ra, oracle_print_registers
  jal ra, oracle_print_data_words
  la a0, oracle_end_line
  jal ra, oracle_puts

  li t0, 0x100000
  li t1, 0x5555
  sw t1, 0(t0)

oracle_halt:
  j oracle_halt
