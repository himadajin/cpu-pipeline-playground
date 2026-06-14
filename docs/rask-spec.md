# rask CPU 仕様書

この文書は、CPU Pipeline Playground が実装する RV32I CPU `rask` の挙動を一意に定める規範仕様である。

`rask` は、RV32I を実行する単一ハート・インオーダー・シングルイシューの 5 段 pipeline CPU である。この文書は、RV32I 命令の機能的意味論を再定義せず、`rask` における pipeline、address space、MMIO、exit / error / pause、verification contract を定義する。実装・可視化・テストはこの文書から導出され、この文書と実装が食い違う場合は文書側を正とする。文書が誤っている場合は、文書を先に直す。

用語の解釈に迷う場合は `docs/glossary.md` を参照する。ただし CPU 動作、timing、format grammar、MMIO address などの詳細仕様はこの文書を正とする。

## 1. 概要

`rask` は、RV32I を実行する単一ハート・インオーダー・シングルイシューの 5 段 pipeline IF / ID / EX / MEM / WB を持ち、cycle 単位で state transition が決定的に定まる。同一の program と初期 state に対して、全 cycle の全 state は一意に定まる。

`rask` は以下の機構を持たない。これらは `rask` 仕様の外である。

- 複数ハート、スーパースカラ実行、アウトオブオーダー実行、レジスタリネーミング、ROB、reservation station
- 特権アーキテクチャ、CSR、トラップ、割り込み、RISC-V 例外処理
- RV32I 以外の拡張命令。RV32M、RV32A、RV32F、RV32D、RV32C、`Zifencei` を含む
- キャッシュ階層、可変レイテンシメモリ、ストアバッファ、メモリアクセスの並べ替え
- 動的分岐予測器、BTB、RAS。制御フローは常に predict-not-taken で扱う
- OS、ABI runtime、syscall interface。環境との境界は 8 章の MMIO のみである

## 2. Machine State

機械を構成する state element と、その初期値を定める。

### 2.1 Architectural State

`rask` の architectural state は、PC、`x0` から `x31` の整数レジスタ、RAM からなる。`x0` は常に `0` であり、書き込みは無視される。

リセット時の初期値は PC = `0x80000000`、全レジスタ = `0` とする。実機ではレジスタの初期値は不定だが、`rask` は golden 比較による検証を成立させるため register state を決定的に定める。`sp` を含むレジスタの設定は program 側の責務である。

### 2.2 Address Space

`rask` は単一の address space を持ち、`0x80000000` から 4 MiB、つまり `0x80000000` から `0x803fffff` を RAM とする。

RAM は命令ポートとデータポートの 2 ポートを持ち、IF 段のフェッチと MEM 段のロード/ストアは同一サイクルに衝突なく実行できる。いずれのポートも常に 1 サイクルで応答する。この性質により、構造ハザードとメモリ起因のストールは `rask` に存在しない。

RAM が単一であることから自己書き換えコードの問題が生じる。`fence.i` は `Zifencei` 拡張の命令であり、`rask` が実行する命令セットには含めない。ストアした領域からのフェッチは禁止する。program 側の制約は 8 章に定める。

範囲外アドレスへのアクセスは 7 章のエラー条件である。

環境との境界は MMIO device register として定義する。

- UART データレジスタ: `0x10000000`。1 バイトのストア 1 回につき、コンソール出力バイト列へ即時に 1 バイト追記される。バッファリングは存在しない。
- 終了デバイス: `0x00100000`。`0x5555` のストアで正常終了、`(code << 16) | 0x3333` のストアで失敗終了する。

アドレス値は QEMU virt マシンの慣習と互換だが、本仕様は QEMU に依存しない。デバイスレジスタへのロード、および定義外のデバイス領域アクセスは 7 章のエラー条件である。

### 2.3 Pipeline State

IF/ID、ID/EX、EX/MEM、MEM/WB の 4 ラッチを定義する。フィールドは以下の 3 規則から導出される。

- R1 因果: あるステージで生産された情報は、それを消費するステージまでの間のすべてのラッチに載って運ばれる。
- R2 共通メタデータ: `bubble`、`seqId`、`pc`、`errorKind` は IF で生産され、retire 処理、可視化、retire log、error report が消費するため、R1 により全ラッチに載る。
- R3 制御の痩せ細り: 制御信号は ID で一度だけ生産され、各ラッチは下流がまだ消費する信号のみを保持する。下流に行くほど制御は減る。

全ラッチが持つ共通メタデータは以下とする。

- `bubble`: `true` のとき他の全フィールドは無効である。bubble は valid dynamic instruction が存在しない状態であり、ハザード検出の対象外である。各ステージは何の作用も計算しない。プログラム中の実 NOP、つまり `addi x0, x0, 0` とは区別される
- `seqId`: フェッチ時に採番される 0-origin の dynamic instruction ID。フラッシュされた命令の ID は再利用しない
- `pc`: 当該命令のフェッチアドレス。本文中の architectural register は `PC`、field name は `pc` と書く
- `errorKind`: 7 章のエラー種別。`none` 以外のとき当該命令は作用を持たない

ラッチ固有フィールドは以下とする。

- IF/ID: `instr`。命令ビット列。`errorKind != none` のとき無効
- ID/EX: `rs1Val`、`rs2Val`、`imm`、`rd`、`ctrl` 全信号
- EX/MEM: `aluResult`、`storeData = rs2Val` の通過値、`rd`、`ctrl` のうち `memOp`、`regWrite`、`wbSel`、`isEbreak`
- MEM/WB: `wbValue`、`rd`、`regWrite`、`isEbreak`、`memAccess`、`exitRequest`

`ctrl` は ID が生産する制御信号の束であり、以下からなる。

- `aluOp`
  - 値域: `add`、`sub`、`and`、`or`、`xor`、`sll`、`srl`、`sra`、`slt`、`sltu`
  - 消費者: EX
- `aluSrc1`
  - 値域: `reg`、`pc`、`zero`
  - 消費者: EX
- `aluSrc2`
  - 値域: `reg`、`imm`
  - 消費者: EX
- `redirectKind`
  - 値域: `none`、`beq`、`bne`、`blt`、`bge`、`bltu`、`bgeu`、`jal`、`jalr`
  - 消費者: ハザードユニット
- `memOp`
  - 値域: 方向 `{none, load, store}` × 幅 `{byte, half, word}` × 符号拡張の有無
  - 消費者: MEM
- `regWrite`
  - 値域: bool
  - 消費者: WB、ハザードユニット
- `wbSel`
  - 値域: `alu`、`mem`、`pc4`
  - 消費者: MEM
- `isEbreak`
  - 値域: bool
  - 消費者: WB

MEM/WB に `wbSel` は存在しない。MEM が `wbSel` を解決して `wbValue` 一本に畳むため、WB は値の出自を知らない。`lui` は `aluSrc1 = zero`、`auipc` と JAL/JALR のターゲットを除くリンク値は `aluSrc1 = pc` により、特例なく `aluOp = add` に還元される。

`memAccess` は retire log の memory effect 欄のための記録であり、方向 `load | store`、幅 `b | h | w`、アドレス、データからなる。`memOp = none` の命令では空である。

## 3. 命令セット

`rask` は RV32I 非特権命令を実行する。各命令の機能的意味論は RISC-V 非特権仕様書に従い、この文書では差分・特記事項のみを定める。

- `fence`: `rask` では NOP-equivalent real instruction である。`fence` が順序付ける対象であるメモリアクセスの並べ替えが、単一ハート・インオーダー・1 サイクル理想メモリの機械には存在しないため、通常の retire record 以外の追加 state change を持たない。
- `ebreak`: retire 時に simulator を pause する命令である。pipeline の動作には一切影響せず、stall も flush も発生しない。pause は state transition に影響せず、非対話実行では単に続行する。retire log にも特別な行は現れない。
- `ecall`: 実行機能を持たない。遭遇した場合は 7 章のエラー条件である。
- RV32I として解釈できないビット列は 7 章のエラー条件である。

## 4. Cycle State Transition

1 cycle の state transition は、以下の 3 フェーズで行う。外部表示、docs、verification output の cycle number は 1-origin とする。simulator 内部表現が 0-origin の cycle counter を持つ場合も、外部へ出すときは 1-origin に変換する。

フェーズ 1、信号計算。ハザードユニットが、現在のラッチ値のみから次の 2 信号を計算する。

- `redirect`: ID/EX ラッチの純関数である。`redirectKind` が `jal` または `jalr` なら常に成立し、分岐種別なら `rs1Val` と `rs2Val` の比較で成立を判定する。ターゲットは分岐・`jal` が `pc + imm`、`jalr` が `(rs1Val + imm) & ~1` である。ID/EX が bubble または `errorKind != none` のときは成立しない。
- `stall`: 6.1 のデータハザード述語である。ID 段の命令、つまり IF/ID を ID/EX・EX/MEM・MEM/WB の各ラッチと比較して定まる。bubble のラッチは比較対象から除外する。

フェーズ 2、next state calculation。全ステージが、現在のラッチ値、フェーズ 1 の信号、自前の資源である PC、レジスタファイル、RAM、device state から次状態を計算する。現在値のみを参照し、他ステージの次状態を参照しないため、ステージの評価順序は結果に影響しない。

フェーズ 3、state update。全 state、つまり PC、4 ラッチ、レジスタファイル、RAM、device state を同時に更新する。

信号の適用は 6.3 の優先順位に従う。

- `redirect` 成立時: PC をターゲットに更新し、IF/ID と ID/EX をバブルにする。`stall` は無視される。
- `stall` のみ成立時: PC と IF/ID を凍結し、ID/EX にバブルを注入する。
- いずれも不成立時: 各ラッチを上流ステージの計算結果で更新し、PC を `PC + 4` に更新する。

## 5. パイプラインステージの責務

各ステージは入力ラッチと自前の資源から出力を計算する純関数であり、フェーズ 2 で並行に評価される。

全ステージ共通の規則として、入力が bubble のとき出力も bubble である。入力の `errorKind != none` のとき、ステージは作用を計算せず、共通メタデータのみを下流へ通す。ID はこのとき `regWrite = false`、`redirectKind = none`、`memOp = none` としてデコードを抑止する。

IF は PC で命令ポートを読み、IF/ID へ `instr`、`pc`、`seqId` を書く。フェッチは IF/ID に受理された時点で完了し、`seqId` はこのとき単調増加で採番される。`stall` による凍結中はフェッチが完了せず、採番も行われない。`redirect` により IF/ID がバブル化されたサイクルのフェッチも完了しない。PC が未マップまたはミスアライン、つまり `PC[1:0] != 0` のときは読みを行わず、`errorKind` を設定する。

ID は `instr` をデコードし、レジスタファイルを読み、ID/EX へ `rs1Val`、`rs2Val`、`imm`、`rd`、`ctrl` を書く。未定義命令および `ecall` は `errorKind` を設定する。レジスタファイルの読みは現在の値、つまりこの cycle の state update で WB の書き込みが適用される前の値である。同一 cycle の書き読みが存在しないことは 6.1 の stall 条件が前提としており、WB に書き手がいる間は読み手が ID に到達しない。

EX は `aluSrc1` / `aluSrc2` で選択したオペランドに `aluOp` を適用し、EX/MEM へ `aluResult`、`storeData = rs2Val`、`rd`、`ctrl` の残りを渡す。分岐の解決は EX ステージ本体の責務ではない。フェーズ 1 でハザードユニットが ID/EX から計算する。EX 本体はすべての命令に対して単なる ALU である。

MEM は `memOp` に従いデータポートまたは device register へアクセスする。アドレス検査、つまり未マップ、ミスアライン、MMIO 違反は書き込みより前に行い、エラー時は side effect を抑止して `errorKind` を設定する。UART へのストアは device side effect としてコンソール出力バイト列へ追記し、終了デバイスへのストアは `exitRequest` を記録する。simulation termination としての exit 確定は WB の retire 時に行う。`wbSel` に従い `wbValue` を畳む。`alu` は `aluResult`、`mem` はロード値、`pc4` は `pc + 4` である。MEM/WB へ `wbValue`、`rd`、`regWrite`、`isEbreak`、`memAccess`、`exitRequest` を書く。

WB は retire を行う。`regWrite` かつ `rd != x0` のとき、レジスタファイルの `rd` へ `wbValue` を書く。続いて retire log へ記録し、`errorKind != none` なら error report を行って error termination する。`exitRequest` を持つ命令なら exit を確定する。このとき、それより若い飛行中の命令は retire せず破棄される。`isEbreak` なら simulator を pause する。

## 6. ハザード

`rask` のハザード規則は、データハザードと制御ハザードの 2 つである。

### 6.1 データハザード

ID 段の命令が `rs1` または `rs2` を使用し、ID/EX・EX/MEM・MEM/WB のいずれかのラッチに `regWrite` かつ `rd != x0` かつ `rd` が当該 `rs` に一致する命令が存在する間、ストールする。ストール時は PC と IF/ID を凍結し、ID/EX にバブルを注入する。

フォワーディングは存在しない。

### 6.2 制御ハザード

分岐は常に predict-not-taken でフェッチを継続する。EX 段で分岐成立、または JAL / JALR が判明した場合、PC をターゲットへリダイレクトし、IF/ID と ID/EX をフラッシュする。これにより 2 バブルが発生する。

### 6.3 優先順位

`redirect` は `stall` に勝つ。ID 段の命令がストール中であっても、EX 段の分岐が成立した場合はその命令ごとフラッシュされる。

## 7. エラー条件

以下をエラー条件とする。括弧内は検出ステージである。

- 未マップアドレスからのフェッチ、ミスアラインアドレスからのフェッチ、つまり `PC[1:0] != 0` のフェッチ。IF で検出する。
- 未定義命令、`ecall`。ID で検出する。
- 未マップ・ミスアラインアドレスへのロード/ストア、デバイスレジスタへのロード、定義外のデバイス領域へのアクセス。MEM で検出する。

error condition を検出しても、その場で error report や error termination を行ってはならない。`rask` は predict-not-taken により間違ったパスの命令を日常的にフェッチするため、検出時の error termination はフラッシュされる運命の命令、たとえばプログラム末尾の向こう側のフェッチをエラーと誤認し、正しい program を異常終了させる。

error condition を検出した命令は、エラー種別をラッチに載せて運び、以降のステージで一切の作用、つまりレジスタ書き込み、RAM 書き込み、device side effect を発火しない。MEM 段でのアドレス検査は書き込みの前に行い、エラー時は side effect を抑止する。その命令が retire した時点で、simulator は PC、命令、エラー種別を error report として出し、error termination する。フラッシュされた命令のエラーは報告されない。

この規則は、作用はリタイア時にのみ観測されるという 9 章の不変条件にエラー報告を統一したものである。

## 8. 環境との境界

`rask` と環境の境界は 2.2 の MMIO device register のみである。`ecall` によるホスト呼び出しは存在しない。

### 8.1 プログラム側の制約

`rask` 上で実行するテストプログラムは以下を守らなければならない。違反した場合の挙動は、エラー条件に該当するものを除き保証されない。

- MMIO 領域に対しては、定義済みデバイスレジスタへのストア以外のアクセスを行わない。QEMU の UART には読み出し可能なステータスレジスタが実在し、oracle と `rask` の挙動が割れるためである。
- ストアした領域からフェッチしない。

## 9. 不変条件

仕様全体を貫く性質を、主張、根拠、帰結の形で示す。

I1 retire order。WB には同時に高々 1 命令しか存在せず、命令は program order で retire する。architectural state への書き込みと retire log への記録は retire 時にのみ行われる。根拠は、`rask` がシングルイシュー・インオーダーであり、命令が他の命令を追い越す機構が存在しないことである。帰結として、retire log は architectural execution の完全な逐次記録であり、ISS の実行列と直接比較できる。

I2 no-squash-past-EX。EX 段を通過した命令は破棄されない。根拠は、命令を破棄する唯一の機構が `redirect` によるフラッシュであり、その対象は IF/ID と ID/EX のみであることによる。帰結として、MEM 段での RAM write と device side effect は、retire 時書き込みと観測上等価である。

I3 error report at retire。エラーは、エラーを起こした命令の retire 時にのみ報告される。根拠は、`errorKind` がラッチで運ばれ、error report が WB の retire 処理でのみ行われることである。帰結として、報告されるエラーは必ず architectural execution 上実在した命令のものであり、間違ったパスの命令によるエラーの誤報告は原理的に発生しない。

## 10. 検証契約

検証は 3 つの golden で行う。

1. コンソール出力のバイト列: QEMU と比較する。
2. retire log および final observable state: final observable state は QEMU と比較する。retire log は `rask` 自身の回帰テスト、つまり golden ファイルとの一致に用いる。
3. pipeline occupancy table: 各 dynamic instruction が各 cycle にどの stage にいたかを、本仕様書から手計算した期待値と比較する。QEMU は cycle 精度を持たないため、timing oracle は本仕様書と手計算のみである。

retire log と pipeline occupancy table は役割を分離する。retire log は architectural execution の記録であり、cycle number と `seqId` を含まない。含めると ISS と比較できなくなる。pipeline occupancy table は microarchitectural behavior の記録であり、間違ったパスでフェッチされた dynamic instruction も含む。

### 10.1 Retire Log Format

retire log は instruction retire record と terminal record からなるテキストである。instruction retire record は 1 行が 1 retire に対応する。terminal record は `EXIT` または `ERROR` から始まる最終行であり、instruction retire record ではない。行の文法を以下に定める。`SP` は空白 1 個である。

```text
行       := pc SP instr { SP 効果 }
pc       := 8桁hex
instr    := 8桁hex。フェッチエラーで命令が取得できない場合は "--------"
効果     := mem効果 | reg効果。mem効果が先
mem効果  := ("load" | "store") SP 幅 SP "[" 8桁hex "]" "=" データ
幅       := "b" | "h" | "w"
データ   := 幅に応じた 2 | 4 | 8 桁hex
reg効果  := "x" 2桁10進 "=" 8桁hex
```

`regWrite` かつ `rd != x0` のときのみ reg 効果が現れる。`x0` への書き込みは作用を持たないため記録しない。ロードは mem 効果、つまり RAM から読んだ生の値と、reg 効果、つまり符号拡張後にレジスタへ書いた値の両方を持つ。

ログの最終行は必ず以下のいずれかの terminal record である。

```text
EXIT 終了コード(10進)
ERROR エラー種別 pc instr
```

エラー種別の識別子は 7 章の各条件に対応し、`fetch-unmapped`、`fetch-misaligned`、`undef-instr`、`ecall`、`mem-unmapped`、`mem-misaligned`、`mmio-violation` とする。

### 10.2 Pipeline Occupancy Table Format

1 行が 1 dynamic instruction、つまり採番された `seqId` に対応するテキストである。フラッシュされた命令も行を持つ。各行は `seqId`、`pc`、timeline 文字列からなる。

timeline 文字列の第 N 文字は、1-origin の cycle N における当該命令の所在を表す。

- `.`: パイプラインに存在しない。フェッチ前。
- `F`: そのサイクルにフェッチが完了した。IF/ID に受理された。
- `D`、`X`、`M`、`W`: そのサイクルに ID / EX / MEM / WB で処理された。

ストールは同一文字の繰り返しとして現れる。ID で 3 サイクル待つ命令は `D` が 4 回並ぶ。行は命令がパイプラインを去った時点で終わる。リタイアした命令は必ず `W` で終わり、フラッシュされた命令は `W` 以外で終わる。この区別に追加の記号は不要である。バブルは命令の不在なので、表には現れない。

### 10.3 実例

以下のプログラムに対する 2 つの golden を示す。この例はデータハザードによる 3 ストール、制御ハザードによる taken 分岐の 2 バブル、フラッシュの 3 現象を最小構成で含む。

```text
80000000: addi x5, x0, 3      # 00300293
80000004: add  x6, x5, x5     # 00528333  x5 に依存
80000008: beq  x6, x6, +8     # 00630463  x6 に依存、成立して 80000010 へ
8000000c: addi x7, x0, 1      # 00100393  間違ったパス。フラッシュされる
80000010: addi x8, x0, 2      # 00200413
```

占有表は以下である。

```text
cycle        1234567890123456
S0 80000000  FDXMW
S1 80000004  .FDDDDXMW
S2 80000008  .....FDDDDXMW
S3 8000000c  .........FD
S4 80000010  ...........FDXMW
```

S1 と S2 の `D` の繰り返しがデータハザードである。依存元が ID/EX・EX/MEM・MEM/WB にいる 3 サイクルを待ち、4 サイクル目に成功する。S2 の `X`、つまりサイクル 11 で分岐が解決し、S3 が `D` の直後に消える。サイクル 11 のフェッチは `redirect` により受理されないため行を持たず、S4 はサイクル 12 にターゲットからフェッチされる。

retire log は以下である。S3 は retire しないため現れない。program に終了ストアがないため terminal record は省略している。

```text
80000000 00300293 x05=00000003
80000004 00528333 x06=00000006
80000008 00630463
80000010 00200413 x08=00000002
```

## 11. 設計判断の記録

採用しなかった案と採用理由を残す。

データハザードは、ストールのみを採用し、フォワーディングを不採用とした。理由は、ハザード規則が 6.1 の述語 1 つに閉じることである。

レジスタファイルは、同一サイクルの書き読み、つまり write-first-half / read-second-half を不採用とした。理由は、レジスタファイルが時間的セマンティクスを持たない同期状態になり、ハザード述語が下流 3 段の一様なチェックになることである。

環境境界は、MMIO を採用し、`ecall` によるホスト呼び出しを不採用とした。理由は、メモリマップ上のデバイスとして環境境界を定義でき、パイプライン仕様に `ecall` 固有のリタイア時作用を持ち込まずに済むことである。

分岐解決は、EX 解決を採用し、ID 早期解決を不採用とした。理由は、ID 解決が比較器とフォワーディング相当の経路を ID に要求し、仕様が複雑化することである。本設計では `redirect` が ID/EX ラッチの純関数になり、EX 解決は 3 フェーズ構造と自然に整合する。

state transition semantics は、信号計算・next state calculation・state update の 3 フェーズを採用し、WB から IF へ逆順に in-place 更新する方式を不採用とした。理由は、逆順更新では `stall` / `flush` が絡むと評価順への暗黙の依存が生まれ壊れやすいことである。3 フェーズは、ステージが現在値の純関数であるという仕様の記述形式とコードを 1 対 1 に対応させる。

error report は、retire 時報告を採用し、検出時の error termination を不採用とした。理由は、predict-not-taken の `rask` が間違ったパスを日常的にフェッチするため、検出時の error termination は正しい program を異常終了させることである。retire 時の error report は不変条件 I3 として作用の統一に組み込まれる。

メモリ構成は、単一アドレス空間・単一メモリ・2 ポートを採用し、物理的に分離されたハーバード構成を不採用とした。理由は、構造ハザードの排除は 2 ポートで達成でき、単一アドレス空間は QEMU と一致することである。物理分離はロード規約と oracle との変換層を増やす。

レジスタ初期値は、全 0 の決め打ちを採用し、不定を不採用とした。理由は、不定値が「同一入力なら同一出力」という golden 比較の前提を壊すことである。

exit timing は、終了デバイスへのストアの exit 確定を retire 時とし、MEM での即時 exit を不採用とした。理由は、MEM で即 exit すると終了ストア自身が retire log に載らず、retire log は実行の完全な記録であるという I1 の帰結に穴が開くことである。

retire log には、cycle number と `seqId` を含めない。理由は、retire log が機能検証の golden であり、microarchitectural information を混ぜてはならないことである。timing は pipeline occupancy table が担い、`seqId` は pipeline occupancy table と可視化が担う。

pipeline occupancy table には、フラッシュされた命令も行に含める。理由は、`rask` が完全に決定的であり、間違ったパスのフェッチも仕様が定める挙動の一部であることによる。含めることで、pipeline occupancy table が制御ハザードの可視化と検証を兼ねる。
