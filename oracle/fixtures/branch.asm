addi x1, x0, 3
addi x2, x0, 0
loop:
addi x2, x2, 1
blt x2, x1, loop
jal x5, done
addi x6, x0, 99
done:
addi x7, x0, 6
