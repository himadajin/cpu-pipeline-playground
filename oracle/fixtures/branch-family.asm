addi x1, x0, -1
addi x2, x0, 1
bge x1, x2, signed_ge_taken
addi x3, x0, 1
signed_ge_taken:
bge x2, x1, signed_ge_skip
addi x4, x0, 1
signed_ge_skip:
bltu x1, x2, unsigned_lt_skip
addi x5, x0, 1
unsigned_lt_skip:
bltu x2, x1, unsigned_lt_taken
addi x6, x0, 1
unsigned_lt_taken:
bgeu x2, x1, unsigned_ge_skip
addi x7, x0, 1
unsigned_ge_skip:
bgeu x1, x2, unsigned_ge_taken
addi x8, x0, 1
unsigned_ge_taken:
addi x9, x0, 9
