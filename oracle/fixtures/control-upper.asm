lui x1, 0x12345
auipc x2, 0
auipc x3, 0
addi x3, x3, 16
jalr x4, 1(x3)
addi x5, x0, 99
target:
lui x6, 0x80000
