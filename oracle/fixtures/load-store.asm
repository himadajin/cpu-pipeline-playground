addi x1, x31, 0
addi x2, x0, 42
sw x2, 0(x1)
lw x3, 0(x1)
addi x4, x3, 1
sw x4, 4(x1)
