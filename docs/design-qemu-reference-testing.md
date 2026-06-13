# QEMU Reference Testing

## Purpose

CPU Pipeline Playground の assembler / simulator の機能的な RV32I 挙動を、RISC-V toolchain と QEMU を参照実装にした differential testing で検証できるようにする。

この設計の目的は、手書きの機能期待値を増やすことではなく、同じテスト用 RV32I アセンブリ断片を `rask` simulator と QEMU の両方で実行し、正規化された architectural state signature を比較できるローカル参照テスト基盤を作ることである。QEMU は pipeline 表示、stall、flush、cycle 数の oracle ではない。タイミング検証の oracle は `docs/rask-spec.md` と手計算した pipeline occupancy である。

CPU 仕様、MMIO、停止条件、リタイアログ、パイプライン占有表の source of truth は `docs/rask-spec.md` とする。この文書は QEMU を使った機能検証基盤の設計だけを扱い、CPU 仕様詳細を重複して定義しない。

## Context

このリポジトリは TypeScript + Vite + React のアプリであり、`src/core/` に UI 非依存の assembler / simulator がある。既存の CLI と UI は同じ core を使っている。通常の検証は `npm run check`、`npm run test`、`npm run build`、`npm run e2e` で行う。QEMU 参照テストは重い外部実行環境を含むため、最初から通常の Vitest や GitHub CI の必須ゲートに混ぜることは目的にしない。

参照 ISA は RV32I に固定する。`rask` は独自 ISA ではなく RV32I CPU であるため、QEMU 側と simulator 側は同じ RV32I テスト断片を入力にする。ただし `rask` の実行環境は `docs/rask-spec.md` に定義された RAM、MMIO、終了デバイス、エラー条件を持つため、QEMU harness はその環境に対応する形でプログラムを包む。

ツールチェーンと QEMU は host 環境に直接要求せず、repo 内の専用 Docker image に閉じ込める。Docker image 内では xPack の versioned binary distribution を使い、RISC-V embedded GCC と QEMU RISC-V を明示的に固定する。初期固定バージョンは `@xpack-dev-tools/riscv-none-elf-gcc@15.2.0-1.1` と `@xpack-dev-tools/qemu-riscv@9.2.4-1.1` とする。QEMU 実行は `qemu-system-riscv32`、`-machine virt`、`-cpu rv32`、`-bios none` を基本にする。Docker base image は実装時に digest pinning する。

テスト対象の `.asm` は、GNU assembler と自前 assembler の両方が読める最小構文の共通テスト断片にする。`.section`、`.global _start`、linker script、起動、終了、signature 領域、signature 書き出しなどの QEMU 都合は、テスト断片に混ぜず harness 側の別ファイルで包む。テストハーネスに依存した `.asm` を書かせないことは、この設計の重要な境界である。

比較対象は、`rask` simulator が責務として持つ architectural state を原則にする。整数レジスタ、観測対象メモリ、コンソール出力バイト列、終了コード、制御フロー由来の logical PC 情報や `jal` link value が中心になる。QEMU の生 PC は harness の起動・終了コードまで進むため、全テストでそのまま比較しない。分岐やジャンプの検証では、到達ラベル、logical PC、link value など、テスト本体相対で意味のある値を signature に含められるようにする。

## Direction

ローカル参照テスト基盤は、QEMU 側 producer、simulator 側 producer、signature comparator を分けて設計する。producer は同じテスト fixture から正規化済み text signature を出し、comparator はその signature を比較するだけにする。signature は `key=value` または JSON Lines のような Unix pipeline に載せやすいテキスト形式にする。将来、C の bare-metal テストが `putchar` などで結果を出す場合も、同じ text signature に正規化できるようにする。

QEMU 側は bare-metal program を生成して実行する。harness は `docs/rask-spec.md` の RAM 開始アドレス、初期 PC、MMIO アドレス、終了デバイスの慣習に合わせて、共通初期化、テスト断片の結合、終了処理、観測対象の signature memory への保存を担当する。テスト断片自体には、結果保存や終了のためのボイラープレートを書かせない。signature memory から text signature へ変換する処理は QEMU producer の責務とし、比較ロジックには QEMU や ELF の詳細を漏らさない。

simulator 側 producer は既存 `src/core/` の assembler / simulator を使う。QEMU 側と同じ `.asm` 断片と manifest/default 設定を読み、同じ観測仕様に基づいて simulator の最終 state から text signature を生成する。core に外部 toolchain や Docker の知識を入れない。

テスト fixture は、ロジックだけを書く `.asm` と、必要差分だけを書く小さな manifest で構成する。共通デフォルトを厚めにし、各テストで比較レジスタを細かく列挙し続ける設計は避ける。書き換えていないレジスタを観測しないことで見落とすのではなく、初期状態と比較対象のデフォルトを工夫して、テストごとの追加情報を小さく保つ。

QEMU 参照テストは `docs/rask-spec.md` の検証契約のうち、コンソール出力バイト列、最終アーキテクチャ状態、終了コードの機能検証を担当する。リタイアログは第 1 段階では `rask` 自身の回帰テストに使い、pipeline occupancy は本仕様と手計算を oracle とする。これらを QEMU と比較しようとしない。

推奨ディレクトリ構造は次の通りにする。

```text
oracle/
  README.md
  Dockerfile
  docker-run.sh
  harness/
    linker.ld
    start.S
    finish.S
    signature.S
  fixtures/
    add.asm
    branch.asm
    load-store.asm
    manifest.json
  generated/
    .gitkeep
  signatures/
    .gitkeep
scripts/
  oracle/
    build-fixture.ts
    run-qemu.ts
    run-simulator.ts
    compare-signatures.ts
    types.ts
```

`oracle/` は外部参照テストの入力、Docker、bare-metal harness、生成物の置き場として独立させる。`scripts/oracle/` は Node / TypeScript 側の操作層として、既存 core と Docker 内ツールをつなぐ。`oracle/generated/` と `oracle/signatures/` は生成物用であり、原則として成果物本体を git 管理しない。

## Completion Conditions

- `docs/design-qemu-reference-testing.md` を読んだ後続実装者が、QEMU 参照テストの目的、非目的、初期 ISA、Docker 境界、toolchain/QEMU バージョン、fixture 形式、signature 比較方針を追加の文脈なしに理解できる。
- CPU 仕様、MMIO、停止条件、リタイアログ、pipeline occupancy の詳細は `docs/rask-spec.md` を参照すればよく、この文書に重複定義されていない。
- Repo 内に、RISC-V embedded GCC と QEMU RISC-V を固定バージョンで使う専用 Docker 環境がある。host に RISC-V toolchain や QEMU の直接インストールを要求しない。
- 初期参照環境は RV32I / ILP32 を対象にし、QEMU は `qemu-system-riscv32` と bare-metal 実行を使う。
- QEMU harness が `rask` の RAM 開始アドレス、初期 PC、UART、終了デバイスに合わせてテスト断片を包める。
- テスト fixture の `.asm` は、GNU assembler と自前 assembler の両方が読める最小構文の共通断片として書ける。QEMU 用 directive、起動、終了、signature 書き出しのボイラープレートは fixture に混ざらない。
- Harness は linker script、起動、終了、signature 領域、signature 書き出しをテスト断片の外側で提供する。
- QEMU 側 producer と simulator 側 producer が、同じ fixture から同じ形式の text signature を生成できる。
- Comparator は producer の出力した text signature だけを比較し、QEMU、ELF、Docker、simulator 内部構造の詳細に依存しない。
- 初期 fixture として、算術/論理、load/store、branch/jump、MMIO 終了を代表する読みやすい `.asm` テストがある。
- 比較対象は simulator の責務としての architectural state を原則にし、必要な例外や追加観測だけを manifest で小さく指定できる。
- 生 PC を全テストでそのまま比較しない代わりに、制御フロー系テストで logical PC、到達ラベル、`jal` link value などを signature に含められる。
- QEMU 参照テストは専用コマンドでローカル実行でき、通常の `npm run test` や GitHub CI の必須ゲートに混ざらなくてもよい。
- QEMU は機能検証 oracle、`docs/rask-spec.md` と手計算 occupancy は timing oracle、という役割分担が実装と README に反映されている。
