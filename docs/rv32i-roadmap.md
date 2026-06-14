# RV32I rask Implementation Roadmap

## Purpose

CPU Pipeline Playground は、RV32I CPU `rask` の 5 段 in-order pipeline を観察するための密度の高いワークベンチである。この文書は、現行の assembler / simulator / UI / tests / oracle を `docs/rask-spec.md` に定義された仕様へ移行するためのロードマップを定義する。

CPU、ISA、pipeline、address space、MMIO、exit / error / pause、verification contract の source of truth は `docs/rask-spec.md` とする。用語の解釈に迷う場合は `docs/glossary.md` を参照する。この文書は仕様詳細や用語定義を重複して定義しない。実装判断で迷う場合は `docs/rask-spec.md` を優先し、この文書は実装順序と作業単位だけを扱う。

ここでの RV32I 対応は、`rask` 仕様が定める RV32I CPU としての機能・タイミング・検証契約に実装を揃えることを指す。

## Non-Goals

`docs/rask-spec.md` で `rask` 仕様の外と定義された機構は、このロードマップの実装範囲外である。

`fence`、`ebreak`、`ecall` は実装対象である。`docs/rask-spec.md` の 3 章に従い、`fence` は NOP-equivalent real instruction、`ebreak` は retire 時 pause、`ecall` は error condition として扱う。

## Principles

- `docs/rask-spec.md` と重複する命令意味論やパイプライン規則を書かない。
- core は UI、browser storage、styling から独立させる。UI と CLI は core の状態を消費し、CPU 挙動を重複実装しない。
- 現行実装の挙動が `rask` 仕様と異なる場合、仕様準拠へ修正する。
- assembler は RV32I assembly source を書くための入力層であり、CPU 仕様そのものではない。simulator は assembled program を `rask` 仕様に従って実行する。
- opcode、operand format、reads/writes、immediate kind、category は central metadata table に寄せる。ただし、実行意味論まで過度に抽象化せず、当面は typed `switch` でよい。
- pseudo-instruction は assembler convenience として扱う。pipeline timeline は展開後の real instruction を表示し、Inspector が元 source line や `expandedFrom` を説明できるようにする。

## Phase 0: Source Of Truth Alignment

仕様を先に固定し、既存資料を `rask` へ従属させる。

- `docs/rask-spec.md` を CPU 仕様の source of truth とする。
- `docs/design.md` から CPU 詳細の重複を削り、UI/UX 方針へ戻す。
- `docs/design-qemu-reference-testing.md` を `rask` の検証契約へ合わせる。
- AGENTS.md や README などから仕様文書を参照している場合は、後続で `docs/rask-spec.md` を参照するよう更新する。

## Phase 1: Architectural State And Memory Map

`docs/rask-spec.md` の 2 章へ実装を合わせる。

- リセット PC を `0x80000000` にする。
- address space 上の RAM を `0x80000000` から 4 MiB にする。
- 命令フェッチとデータアクセスのアドレスを byte address として扱う。
- RAM state を byte を真実の単位にした little-endian 表現にする。
- `x0` は常に 0 のままにする。
- UART データレジスタ `0x10000000` と exit device `0x00100000` を実装する。
- 範囲外 RAM/MMIO アクセスを `rask` のエラー条件へ接続する。

## Phase 2: Instruction Coverage And Assembler Boundary

`rask` が実行する RV32I 非特権命令を assembler / simulator / metadata に揃える。

- RV32I base integer instruction set の通常命令を central metadata に登録する。
- `fence`、`ebreak`、`ecall` を `rask` 仕様どおり扱う。
- `nop` などの pseudo-instruction は assembler layer で real instruction へ展開し、simulator には pseudo-instruction を渡さない。
- branch、jump、load/store、ALU、upper immediate、shift の immediate range diagnostics を RV32I 形式に合わせる。
- GNU assembler と共通テスト断片を書ける範囲を広げる。directive や harness 固有記述は oracle 側で包む。

## Phase 3: Pipeline Timing Semantics

`docs/rask-spec.md` の 4 章から 6 章へ実装を合わせる。

- 1 cycle の state transition を信号計算、next state calculation、state update の 3 フェーズに整理する。
- IF/ID、ID/EX、EX/MEM、MEM/WB のラッチ構造を明示的に表現する。
- `seqId`、`pc`、`errorKind`、bubble を dynamic instruction の共通メタデータとして扱う。`seqId` は 0-origin とする。
- フォワーディングを削除し、全データハザードをストールのみで扱う。
- ID 段の命令が依存する書き手が ID/EX・EX/MEM・MEM/WB に存在する間、PC と IF/ID を凍結し、ID/EX に bubble を注入する。
- 分岐、JAL、JALR は EX 段で解決し、taken redirect は IF/ID と ID/EX を flush する。
- redirect は stall に勝つ。
- stage board と timeline は、実装内部の pipeline occupancy をそのまま可視化する。

## Phase 4: Error, Exit, Pause, And Retirement

`docs/rask-spec.md` の 7 章から 10 章へ実装を合わせる。

- IF/ID/MEM で検出した error condition を検出時に error termination せず、`errorKind` としてラッチで運ぶ。
- エラー命令の副作用を抑止し、WB で retire した時点で error report と error termination を行う。
- フラッシュされた命令のエラーは報告しない。
- exit device へのストアは MEM で `exitRequest` を記録し、WB の retire 時に exit を確定する。
- `ebreak` は WB の retire 時に pause として扱う。非対話実行では続行できるようにする。
- retire log と pipeline occupancy table を別々の出力として実装する。
- retire log には cycle number と `seqId` を含めず、pipeline occupancy table にはフラッシュされた命令を含める。

## Phase 5: UI Adaptation

UI を `rask` の挙動に合わせる。

- timeline は横軸 cycle、縦軸 dynamic instruction の pipeline occupancy map とする。
- timeline cell は stage と固定サイズ event marker を表示し、row/cell size を event marker 数で変化させない。
- Inspector は選択 cycle・命令・event marker について、stall 理由、flush 理由、retire、RAM diff、error を説明する。
- フォワーディング表示を削除する。
- Registers tab は `x0` から `x31` までを固定順で表示し、現在 cycle の差分だけを強調する。
- Memory tab は word grouping を基本にし、byte diff を示せるようにする。
- 実行済みプログラムを編集した場合は simulation invalidated として扱い、暗黙に実行途中へ差し替えない。

## Testing Policy

命令追加時に全命令と全 pipeline interaction の組み合わせ爆発は避ける。ただし、各命令の意味論と `rask` 固有の timing / error 規則は代表ケースで必ず押さえる。

- assembler tests: operand format、operand count、register parsing、immediate range、label resolution、unknown instruction、pseudo-instruction expansion
- semantic tests: 各命令の register result、RAM result、PC result、signed/unsigned behavior、`fence`、`ebreak`、`ecall`
- pipeline interaction tests: ALU dependency stall、load dependency stall、taken branch flush、`jal`/`jalr` flush、load/store width、misaligned error report
- retirement tests: `x0` write suppression、retire order、error delayed reporting、MMIO exit retirement
- UI tests: 命令追加ごとには増やさず、timeline selection、Inspector 表示、Registers/Memory 表示など共有挙動を代表ケースで検証する
- oracle fixtures: `docs/rask-spec.md` の verification contract を保ち、QEMU と比較する functional verification、手計算 occupancy による timing verification を分離する

## Reference

- [rask CPU 仕様書](./rask-spec.md)
- [Glossary](./glossary.md)
- [RISC-V Unprivileged ISA, RV32I Base Integer Instruction Set](https://docs.riscv.org/reference/isa/v20240411/unpriv/rv32.html)
