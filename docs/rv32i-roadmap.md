# RV32I Compatibility Roadmap

## Purpose

CPU Pipeline Playground は、5段 in-order pipeline を観察するための密度の高いワークベンチである。この文書は、命令セットを将来的に RV32I の意味論へ近づけるためのロードマップを定義する。

ここでの互換性は、実バイナリ、ABI、OS、privileged architecture まで含む完全互換ではない。目標は、playground の assembler/simulator が RV32I の通常命令の意味論と自然なアセンブリ表記に段階的に揃うことにある。

`docs/design.md` は製品体験と UI 方針の source of truth とする。この文書は ISA 拡張、命令意味論、テスト方針の source of truth とし、同じ詳細を複数箇所へ重複して書かない。

## Non-Goals

以下は当面の範囲外とする。

- 実バイナリ encoding/decoding、ELF、linker、relocation の完全対応
- RISC-V ABI、関数フレーム規約、OS 挙動
- privileged architecture、例外、割り込み
- `ecall`、`ebreak`、`fence` の実行意味論
- out-of-order execution、register renaming、ROB、reservation station、cache、可変 latency 命令
- `mul`、`div` など RV32M 以降の拡張命令

ただし、将来 `ecall`、`ebreak`、`fence`、例外系の命令を追加できない型設計にはしない。今はそれらの機能を準備しないが、`Instruction` や simulator state を「通常 ALU/load/store/control 命令しか存在できない」形へ固定しない。

## Design Principles

- 実装済み命令は、できるだけ RV32I の意味論へ揃える。過去の独自挙動が RV32I と無意味に異なる場合、後方互換ではなく修正対象として扱う。
- core は UI、browser storage、styling から独立させる。UI と CLI は core の状態を消費し、CPU挙動を重複実装しない。
- 命令追加は、簡単な同型命令だけを先に増やすのではなく、設計リスクの異なる代表命令を先に入れる。
- 代表命令で意味論の型を確認した後、同型命令を小さい束で追加し、命令カバレッジとテスト資産を増やす。
- opcode、operand format、reads/writes、immediate kind、category は central metadata table に寄せる。ただし、実行意味論まで過度に抽象化せず、当面は typed `switch` でよい。
- 疑似命令は assembler convenience として扱う。pipeline timeline は展開後の実命令を表示し、Inspector が元ソース行や `expandedFrom` を説明できるようにする。

## Semantic Foundation

Phase 0 以降、以下を RV32I 寄りの基礎意味論として扱う。

### PC

- 外部意味論の PC は byte address とする。命令アドレスは `0, 4, 8, ...`。
- 実装内部では配列 index を使ってよいが、fetch は `pc / 4` によって命令列へ対応させる。
- instruction fetch PC は 4-byte aligned 必須とする。
- branch と `jal` の label は assembler が絶対 byte address の `target` に解決する。
- branch と `jal` の assembler diagnostics は、RV32I の PC-relative offset 範囲と alignment を検査する。
- control flow 命令の解決は EX stage に統一し、taken branch/jump は IF と ID を flush する。

### Registers And Integer Values

- レジスタ値は 32-bit のビット列として扱う。
- `add`、`addi`、`sub`、`lui`、`auipc` などの演算結果は 32-bit で wrap する。
- signed 比較や signed load は `int32` として解釈する。
- unsigned 比較や zero-extended load は `uint32` として解釈する。
- `x0` は常に 0 のままにする。

### Memory

- memory は byte-addressed とする。
- multi-byte load/store は little-endian とする。
- `lw`/`sw` は 4 byte、`lh`/`lhu`/`sh` は 2 byte、`lb`/`lbu`/`sb` は 1 byte を扱う。
- core の memory state は byte を真実の単位にする。
- UI の Memory tab は 4-byte word grouping を基本表示にし、byte diff を強調できるようにする。

### Alignment And Errors

例外機構は当面作らない。misaligned access や misaligned jump は deterministic な simulator error として halt する。

- `jalr` target は `(rs1 + imm) & ~1` で bit 0 を clear する。
- `jalr` target が 4-byte aligned でなければ simulator error として halt する。
- `lw`/`sw` は 4-byte aligned 必須。
- `lh`/`lhu`/`sh` は 2-byte aligned 必須。
- `lb`/`lbu`/`sb` は任意の byte address を許可する。

### Immediates

assembler は RV32I の命令形式に合わせて immediate range を検査し、範囲外を暗黙に truncate/wrap しない。

- I-type immediate: signed 12-bit, `-2048..2047`
- S-type store offset: signed 12-bit
- B-type branch offset: signed 13-bit 相当、aligned
- U-type immediate field: 20-bit field, `0..0xfffff`
- J-type offset: signed 21-bit 相当、aligned
- RV32I shift amount: `0..31`

`lui rd, imm20` と `auipc rd, imm20` は immediate field を受け取る。例えば `lui x5, 0x12345` は `x5 = 0x12345000`、`auipc x5, 1` は `x5 = pc + 0x1000` とする。

## Phases

### Phase 0: RV32I Semantic Foundation

新しい実命令を増やす前に、既存命令の土台を RV32I 寄りに揃える。

- PC を byte address にする。
- label target を byte address として扱う。
- `jal` の link value を `pc + 4` にする。
- memory を byte-addressed little-endian にする。
- `lw`/`sw` を 4-byte load/store にする。
- レジスタ値と ALU 結果を 32-bit wrap にする。
- signed/unsigned 解釈用 helper を core に追加する。
- immediate range diagnostics を命令形式ごとに導入する。
- `nop` は実 opcode ではなく、assembler が `addi x0, x0, 0` へ正規化する疑似命令として扱う。
- 既存の assembler/simulator tests を新しい意味論へ更新する。

### Phase 0.5: Instruction Metadata

命令追加の漏れを減らすため、opcode 定義を centralize する。

- opcode 一覧
- operand format
- rd/rs1/rs2 の reads/writes
- immediate kind
- load/store/control/ALU などの category
- UI と diagnostics が使える短い metadata

binary encoding table はこの段階では作らない。

### Phase 1a: Representative Instructions

設計リスクの異なる代表命令を先に追加する。

- `jalr`: register-based control flow、link value、LSB clear、alignment check
- `lui`: upper immediate
- `auipc`: PC-relative upper immediate
- `sltu`: unsigned comparison
- `lb`: byte load、sign extension
- `sb`: byte store、partial memory write

### Phase 1b: Family Expansion

代表命令で土台を確認した後、同型命令を小さい束で追加する。

- compare: `slt`, `sltu`, `slti`, `sltiu`
- branch: `beq`, `bne`, `blt`, `bge`, `bltu`, `bgeu`
- load/store width: `lb`, `lh`, `lw`, `lbu`, `lhu`, `sb`, `sh`, `sw`
- immediate ALU: `addi`, `andi`, `ori`, `xori`
- register ALU: `add`, `sub`, `and`, `or`, `xor`
- shift: `sll`, `srl`, `sra`, `slli`, `srli`, `srai`
- control flow: `jal`, `jalr`
- upper immediate: `lui`, `auipc`

この段階で、RV32I の通常ユーザー命令の大部分を扱える状態を目指す。`fence`、`ecall`、`ebreak` は Phase 1b の範囲外に残す。

### Phase 2: Pseudo Instructions

疑似命令は実命令の意味論が安定してから扱う。

- `j`
- `jr`
- `ret`
- `mv`
- `li`
- `call`

展開後の各実命令は timeline に個別行として表示する。元ソース行、元疑似命令、展開後命令列の対応は Inspector で説明できるようにする。

### Later: System And Ordering Instructions

`ecall`、`ebreak`、`fence` は後続フェーズで検討する。その時点で trap、halt reason、ordering event、diagnostics の設計を行う。現在の段階で予約 opcode や未実装 runtime state を作らない。

## UI Display Policy

- レジスタ値と word 値は 32-bit hex を主表示にする。
- 必要に応じて signed decimal と unsigned decimal を補助表示する。
- Memory tab は word grouping を基本にし、各 word の byte 値を確認できるようにする。
- Memory diff は、命令幅に応じて変更 byte 範囲を示す。
- Inspector は、選択命令の signed/unsigned 解釈、memory width、before/after を説明できるようにする。

## Testing Policy

命令追加時に「全命令 x 全 pipeline event」の組み合わせ爆発は避ける。ただし、各命令の意味論は core tests で必ず押さえる。

- assembler tests: operand format、operand count、register parsing、immediate range、label resolution、unknown instruction
- semantic tests: 各命令の register result、memory result、PC result、signed/unsigned behavior
- pipeline interaction tests: load-use stall、forwarding、taken branch flush、`jal`/`jalr` flush、memory width、misaligned halt
- UI tests: 命令追加ごとには増やさず、timeline selection、Inspector 表示、Registers/Memory 表示など共有挙動を代表ケースで検証する
- oracle fixtures: `oracle/README.md` の原則を保ち、命令意味論の代表セットを固定する

## Reference

- [RISC-V Unprivileged ISA, RV32I Base Integer Instruction Set](https://docs.riscv.org/reference/isa/v20240411/unpriv/rv32.html)
