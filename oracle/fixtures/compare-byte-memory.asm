addi x1, x31, 1
addi x2, x0, -1
sb x2, 0(x1)
lb x3, 0(x1)
addi x4, x0, 1
sltu x5, x3, x4
sltu x6, x4, x3
sb x4, 1(x1)
lb x7, 1(x1)
