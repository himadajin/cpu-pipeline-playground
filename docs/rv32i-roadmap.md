# RV32I rask Implementation Roadmap

## Purpose

CPU Pipeline Playground は、RV32I CPU `rask` の 5 段 in-order pipeline を観察するための密度の高いワークベンチである。この文書は、現行の assembler / simulator / UI / CLI / tests / oracle を `docs/rask-spec.md` に定義された仕様へ移行するための実装ロードマップを定義する。

CPU、ISA、pipeline、address space、MMIO、exit / error / pause、verification contract の source of truth は `docs/rask-spec.md` とする。用語の解釈に迷う場合は `docs/glossary.md` を参照する。この文書は仕様詳細や用語定義を重複して定義しない。実装判断で迷う場合は `docs/rask-spec.md` を優先し、この文書は実装順序、作業境界、完了条件、失敗時の戻り方だけを扱う。

ここでの RV32I 対応は、`rask` 仕様が定める RV32I CPU としての機能・タイミング・検証契約に実装を揃えることを指す。

## Planning Principles

- 各 Phase は単独で review、test、commit できる単位にする。複数 Phase をまとめないと壊れたままになる分割は避ける。
- Phase は細かい手順ではなく、判断境界と成果物を定義する。関数単位の作業列は実装時に決める。
- 仕様詳細は `docs/rask-spec.md` に置く。この文書では、どの仕様領域へ実装を合わせるかだけを示す。
- core は UI、browser storage、styling から独立させる。UI と CLI は core の状態または projection を消費し、CPU 挙動を重複実装しない。
- 後続 Phase で直す前提の既知破損を残して次へ進まない。必要な互換 projection や移行 shim はその Phase の完了条件に含める。
- 成功を前提にしない。失敗時に差分を分類し、戻る境界を明確にし、原因を潰してから次 Phase へ進む。
- QEMU は functional oracle、`docs/rask-spec.md` と手計算 occupancy は timing oracle とする。QEMU に cycle 精度を期待しない。

## Non-Goals

`docs/rask-spec.md` で `rask` 仕様の外と定義された機構は、このロードマップの実装範囲外である。

`fence`、`ebreak`、`ecall` は実装対象である。`docs/rask-spec.md` の命令セット定義に従い、`fence` は NOP-equivalent real instruction、`ebreak` は retire 時 pause、`ecall` は error condition として扱う。

このロードマップは実装計画であり、個別命令の意味論、pipeline timing の規則、retire log grammar、pipeline occupancy table grammar を再定義しない。

## Roadmap Structure

各 Phase は以下の観点で読む。

- Scope: その Phase が扱う境界。
- Outcomes: 完了時に repo に存在する成果物や成立する状態。
- Completion Conditions: 次 Phase へ進める条件。
- Failure Signals / Recovery: 失敗の兆候と、どの境界まで戻って切り分けるか。
- Required Verification: commit 前に通す最小チェック。
- Non-Goals: その Phase では意図的に扱わないこと。

## Phase 0: Source Of Truth And Documentation Alignment

### Scope

仕様参照と文書責務を揃える。実装の大きな変更はまだ行わない。

### Outcomes

- CPU 仕様の source of truth が `docs/rask-spec.md` であることが、README が存在する場合は README、AGENTS.md、design、oracle 関連文書から一貫して参照されている。
- `docs/design.md` は product / UX 方針に集中し、CPU 詳細の重複を持たない。
- `docs/design-qemu-reference-testing.md` は `rask` の verification contract に従属し、QEMU と timing oracle の役割を混同しない。
- `docs/rv32i-roadmap.md` は、実装順序と作業境界の文書として読める。

### Completion Conditions

- 後続実装者が、CPU 動作の疑問は `docs/rask-spec.md`、用語の疑問は `docs/glossary.md`、製品方針は `docs/design.md`、実装順序はこの文書を見ればよいと判断できる。
- CPU semantics、pipeline timing、MMIO address、retire log grammar、occupancy grammar の詳細がこの文書へ重複定義されていない。
- 文書間で明らかに矛盾する source-of-truth 記述がない。

### Failure Signals / Recovery

- Failure Signals: 同じ仕様詳細が複数文書に残る。QEMU を timing oracle と読める記述が残る。`rask-spec.md` と矛盾する実装優先の記述が残る。
- Recovery: 実装へ進まず、該当記述を source-of-truth 文書へ戻すか、参照だけに置き換える。
- Guardrail: 文書責務が曖昧なまま Phase 1 へ進まない。

### Required Verification

- `npm run check`
- 文書のみの変更なら、関連 docs のセルフレビューを必須とし、必要に応じて `npm run test` を追加する。

### Non-Goals

- assembler、simulator、UI の挙動変更。
- QEMU harness や oracle scripts の実装。

## Phase 1: Execution Image And Address Boundary

### Scope

assembler と simulator の境界を、`0x80000000` 起点の byte-addressed execution image へ移行する。現行 UI が必要とする表示情報は projection として維持する。

### Outcomes

- assembler が、assembly source から展開済み real instruction、命令 word、source mapping を含む execution image を返せる。
- pseudo-instruction は assembler layer で展開され、展開後の real instruction と元 source line の対応を追跡できる。
- simulator は PC = `0x80000000` から byte address で instruction fetch できる。
- fetch は instruction memory 上の命令 word または fetch error を扱える。
- UI / CLI は、必要な人間向け命令表示を execution image と source mapping から得る。

### Completion Conditions

- 既存の代表プログラムが、PC 起点変更後も UI / CLI から実行できる。
- program index を PC と見なす直接参照が core の主要 fetch 経路から外れている。
- `nop` などの pseudo-instruction が simulator の実行対象として流れない。
- source line、expandedFrom、命令 word、表示 text の対応が inspector や diagnostics で失われない。
- Phase 完了時点で UI が長期間壊れた状態にならない。必要な legacy UI shape は projection で提供される。

### Failure Signals / Recovery

- Failure Signals: PC が `0` 起点と `0x80000000` 起点で混在する。branch / jump target が index と byte address の間で揺れる。UI が source line を追えなくなる。pseudo-instruction が simulator へ漏れる。
- Recovery: 命令追加や memory map 実装へ進まず、execution image と source mapping の型境界まで戻す。address は byte address に統一し、UI 表示だけを projection へ隔離する。
- Guardrail: fetch 境界が命令 word と byte address を扱えないまま Phase 2 へ進まない。

### Required Verification

- `npm run check`
- assembler と simulator の関連 Vitest
- UI projection に触れた場合は関連 UI test

### Non-Goals

- 全 RV32I 命令の網羅。
- 明示 pipeline latch の全面導入。
- delayed error や retire log grammar の完成。

## Phase 2: Architectural State, RAM, And MMIO

### Scope

`docs/rask-spec.md` の architectural state、RAM、address space、MMIO device register に実装を揃える。

### Outcomes

- RAM は `0x80000000` から 4 MiB の address range として扱われる。
- RAM state は byte を真実の単位にした little-endian 表現になる。
- instruction fetch と data access が同じ address space 上の byte address を使う。
- `x0` は常に 0 のままで、書き込みは architectural effect を持たない。
- UART data register と exit device address が core の memory access 分類に入る。
- 範囲外 RAM / MMIO access が `rask` の error condition として分類できる。

### Completion Conditions

- load/store width、sign extension、alignment、little-endian byte diff が representative tests で検証されている。
- RAM 範囲外、MMIO load、未定義 device 領域などを同じ memory classification 経路で扱える。
- UART store と exit device store は device side effect / exitRequest として区別できる。ただし termination timing の最終仕様は後続 Phase で確定してよい。
- UI Memory tab は byte truth と word grouping の差を破綻なく表示できる。

### Failure Signals / Recovery

- Failure Signals: RAM address が低位 index と `0x80000000` address で混在する。word memory と byte memory が二重の真実になる。MMIO が load/store 実行経路の外側で特例化される。
- Recovery: 個別 device 挙動を増やす前に、address classifier と byte memory API まで戻す。device side effect は memory access 分類の結果として接続する。
- Guardrail: RAM と MMIO の分類が一元化されていないまま instruction coverage へ進まない。

### Required Verification

- `npm run check`
- memory / simulator 関連 Vitest
- UI Memory 表示に触れた場合は関連 UI test

### Non-Goals

- RV32I 命令の追加網羅。
- QEMU oracle の完成。
- error termination を WB retire に遅延させる最終実装。

## Phase 3: Instruction Decode Boundary

### Scope

既存命令サブセットを使って、命令 word、decode、metadata、control signal の境界を固める。全命令網羅はこの Phase では行わない。

### Outcomes

- opcode、operand format、reads/writes、immediate kind、category が central metadata table から導出される。
- assembler は対応済み real instruction を命令 word へ encode できる。
- simulator ID 相当の処理は命令 word から decoded instruction / control を作れる。
- 実行意味論は過度に抽象化せず、typed `switch` など現在のコードベースに合う形で維持できる。
- unknown instruction と `ecall` を error condition として扱う入口が decode boundary に存在する。

### Completion Conditions

- 既存対応命令について、assemble、encode、fetch、decode、execute の round trip が representative tests で検証されている。
- source-level diagnostics と decode-time error condition が混同されていない。
- simulator は assembler-only の typed instruction object に依存しない実行経路を持つ。
- UI / CLI は decoded instruction と source mapping から従来相当の命令表示を維持できる。

### Failure Signals / Recovery

- Failure Signals: encode/decode の不一致と execution semantics の失敗が切り分けられない。metadata と parser の operand rules が重複して食い違う。UI が命令 word だけでは表示情報を復元できない。
- Recovery: 新命令追加を止め、既存命令サブセットだけで round trip fixture を増やす。metadata から導出する情報と source mapping から得る情報を分け直す。
- Guardrail: encode/decode 境界が不安定なまま RV32I 命令網羅へ進まない。

### Required Verification

- `npm run check`
- assembler、instruction metadata、simulator の関連 Vitest
- CLI 表示に触れた場合は CLI smoke test

### Non-Goals

- RV32I base instruction set の全網羅。
- pipeline hazard timing の仕様準拠化。
- QEMU との大規模 differential testing。

## Phase 4: Verification Harness Baseline

### Scope

RV32I 命令網羅に入る前に、functional verification の境界を小さく動く状態へ持っていく。QEMU 参照テストは timing ではなく final observable state の比較を担当する。

### Outcomes

- simulator producer が fixture から `rask` final observable state signature を生成できる。
- QEMU producer、harness、fixture、manifest、comparator の境界が docs と code で一致している。
- 最小 fixture が QEMU 側と simulator 側で比較できる。ローカル環境で QEMU / Docker が使えない場合は、skip 条件と代替確認が明文化されている。
- comparator は producer 出力の text signature だけを比較し、QEMU、ELF、simulator 内部構造に依存しない。
- timing verification は QEMU ではなく、手計算した pipeline occupancy golden に分離されている。

### Completion Conditions

- 算術または load/store を含む最小 fixture が少なくとも 1 つ、producer / comparator の経路を通る。
- 差分が出た場合に、harness、signature normalization、simulator semantics のどれを疑うべきか分類できる出力になっている。
- oracle scripts は core に Docker や external toolchain の知識を漏らさない。
- `npm run oracle:test` が実行可能な環境では通る。実行不能な環境では、明示的に skip され、通常 test が代替確認を持つ。

### Failure Signals / Recovery

- Failure Signals: QEMU と simulator の差分が出ても分類できない。fixture に QEMU harness 固有の boilerplate が混ざる。comparator が producer 内部や ELF details を直接見る。oracle が pipeline cycle を比較しようとする。
- Recovery: 命令追加へ進まず、fixture、producer、signature、comparator の境界を戻す。最小 fixture まで縮めて、差分を functional state のどの key に出ているか見える形にする。
- Guardrail: 分類不能な oracle 差分を抱えたまま Phase 5 へ進まない。

### Required Verification

- `npm run check`
- oracle scripts の関連 test または smoke test
- 実行環境がある場合は `npm run oracle:test`
- 実行環境がない場合は skip 理由と、simulator producer / comparator の代替 test

### Non-Goals

- 全 fixture の網羅。
- QEMU を timing oracle として使うこと。
- UI の trace 表示最終化。

## Phase 5: RV32I Instruction Coverage

### Scope

`rask` が実行する RV32I 非特権命令を assembler、encoder、decoder、metadata、simulator semantics、tests、oracle fixture に揃える。

### Outcomes

- RV32I base integer instruction set の通常命令が central metadata に登録される。
- `fence`、`ebreak`、`ecall` が `docs/rask-spec.md` に従って decode / execute / terminal flow へ接続される。
- pseudo-instruction は assembler convenience として扱われ、simulator は validated real instruction を実行する。
- branch、jump、load/store、ALU、upper immediate、shift の immediate diagnostics が RV32I format と整合する。
- GNU assembler と共通テスト断片を書ける範囲が広がる。directive や harness 固有記述は oracle 側で包む。

### Completion Conditions

- 各命令カテゴリに representative semantic tests がある。
- 命令追加ごとに encode/decode round trip と execution result の少なくとも代表ケースが検証されている。
- `fence` は NOP-equivalent real instruction として retire できる。
- `ecall` は実行機能を持たず、error condition として扱われる。
- `ebreak` は後続 Phase の retire timing に接続できる形で識別される。
- oracle fixture は命令追加の functional regression を早期に拾える状態になっている。

### Failure Signals / Recovery

- Failure Signals: ある命令の失敗が parser、encoder、decoder、semantics、oracle のどこにあるか分からない。pseudo-instruction が simulator に混入する。GNU assembler と自前 assembler の共通断片が fixture ごとに崩れる。
- Recovery: 命令カテゴリ単位に縮め、round trip、semantic test、oracle fixture を順に切り分ける。分類不能な命令は一時的に未対応へ戻し、metadata 境界を先に直す。
- Guardrail: 未分類の命令差分や pseudo-instruction 漏れを残したまま pipeline timing 改修へ進まない。

### Required Verification

- `npm run check`
- `npm run test`
- 実行環境がある場合は `npm run oracle:test`
- 環境がない場合は oracle skip 理由と、該当命令の simulator-side verification

### Non-Goals

- RV32I 以外の拡張命令。
- pipeline timing の全面仕様準拠化。
- UI の最終 trace design。

## Phase 6: Explicit Pipeline Latches And Cycle Transition

### Scope

pipeline 内部表現を、IF/ID、ID/EX、EX/MEM、MEM/WB の明示ラッチと、信号計算、next state calculation、state update の 3 フェーズに移行する。

### Outcomes

- pipeline latch が `docs/rask-spec.md` の共通メタデータと下流で必要な field を運ぶ構造になる。
- `seqId`、`pc`、`errorKind`、bubble が dynamic instruction の共通メタデータとして扱われる。
- 1 cycle の state transition が現在 state のみから next state を計算し、最後に同時更新する構造になる。
- stage board、timeline、CLI trace は内部 latch / occupancy から projection される。
- 既存代表挙動は、意図的に変える Phase 7 までは可能な範囲で維持される。

### Completion Conditions

- in-place 更新順序に依存した pipeline logic が主要経路から外れている。
- bubble と実 NOP が区別されている。
- `seqId` は fetch 完了時に採番され、flush された instruction の ID を再利用しない準備ができている。
- UI / CLI は projection 経由で動作し、内部 latch structure へ直接依存しない。
- representative pipeline movement tests が明示 latch 構造を前提に通る。

### Failure Signals / Recovery

- Failure Signals: stage 評価順を変えると結果が変わる。bubble と NOP が混ざる。UI が latch internal field を直接期待する。`seqId` と source instruction id が混同される。
- Recovery: hazard 規則の変更へ進まず、3 フェーズ state transition の純度を先に直す。UI 依存は projection に戻す。
- Guardrail: 明示 latch と 3 フェーズ更新が安定しないまま Phase 7 へ進まない。

### Required Verification

- `npm run check`
- pipeline / simulator 関連 Vitest
- UI projection に触れた場合は関連 UI test
- 広範囲に影響した場合は `npm run build`

### Non-Goals

- forwarding 削除と全 RAW stall への切り替え。
- delayed error / exit / pause の最終 timing。
- UI timeline の最終 visual redesign。

## Phase 7: Rask Hazard And Redirect Semantics

### Scope

`docs/rask-spec.md` の data hazard、control hazard、redirect priority に pipeline timing を合わせる。

### Outcomes

- フォワーディングが削除され、全データハザードは stall のみで扱われる。
- ID 段の命令が依存する書き手が ID/EX、EX/MEM、MEM/WB に存在する間、PC と IF/ID を凍結し、ID/EX に bubble を注入する。
- 分岐、JAL、JALR は EX 段で redirect を決定し、taken redirect は IF/ID と ID/EX を flush する。
- redirect は stall に勝つ。
- pipeline occupancy table の代表ケースが、手計算 golden と比較できる。

### Completion Conditions

- ALU dependency、load dependency、store data dependency、branch dependency、JALR dependency の representative stall tests がある。
- taken branch、JAL、JALR の flush tests がある。
- redirect と stall が同一 cycle に競合するケースで redirect が勝つことが検証されている。
- forwarding event と forwarding UI 表示は、少なくとも core truth からは消えている。UI の最終整理は Phase 9 で行ってよいが、誤った挙動として表示しない。
- occupancy table はフラッシュされた dynamic instruction を含められる。

### Failure Signals / Recovery

- Failure Signals: dependency が instruction category ごとの special case で増え続ける。WB に書き手がいる cycle で ID が同じ register を読んでしまう。redirect と stall の優先順位がテストごとに揺れる。forwarding 前提の既存 test を残して仕様準拠を偽装する。
- Recovery: hazard predicate を `reads` / `regWrite` / `rd` の metadata 境界へ戻す。競合ケースを最小 program に縮めて occupancy を手計算し、仕様と比較する。
- Guardrail: forwarding が残ったまま、または redirect priority が未検証のまま Phase 8 へ進まない。

### Required Verification

- `npm run check`
- pipeline interaction の関連 Vitest
- `npm run test`
- timing golden を更新した場合はその差分レビュー

### Non-Goals

- error、exit、pause の retire timing 完成。
- QEMU による timing 検証。
- UI inspector の最終説明文整備。

## Phase 8: Retirement, Terminal Effects, And Delayed Errors

### Scope

error、exit、pause、retire log、pipeline occupancy table の役割を `docs/rask-spec.md` に合わせる。

### Outcomes

- IF / ID / MEM で検出した error condition は検出時に termination せず、`errorKind` としてラッチで運ばれる。
- エラー命令の副作用は抑止され、WB retire 時に error report と error termination が確定する。
- フラッシュされた命令の error は報告されない。
- exit device store は MEM で `exitRequest` を記録し、WB retire 時に exit を確定する。
- `ebreak` は WB retire 時 pause として扱われ、非対話実行では続行できる。
- retire log と pipeline occupancy table が別々の output として実装される。

### Completion Conditions

- retire log は architectural execution の記録であり、cycle number と `seqId` を含まない。
- pipeline occupancy table は microarchitectural behavior の記録であり、flush された dynamic instruction を含む。
- fetch error、undefined instruction、`ecall`、misaligned memory、unmapped memory、MMIO violation の representative tests がある。
- error side effect suppression が register、RAM、device side effect で検証されている。
- exit store 自身が retire log に残り、exit が retire 時に確定する。
- `ebreak` pause が interactive step / run と non-interactive run の両方で扱える。

### Failure Signals / Recovery

- Failure Signals: error が検出 stage で即 halt する。flush されるべき fetch error が報告される。exit store が retire log に残らない。retire log に cycle や `seqId` が混ざる。occupancy table から flush 命令が消える。
- Recovery: terminal effects を MEM / IF / ID から外し、WB retire の一点へ戻す。retire log と occupancy table の出力責務を分離し直す。
- Guardrail: delayed error と retire timing が未検証のまま UI 最終適応へ進まない。

### Required Verification

- `npm run check`
- retirement / error / terminal behavior の関連 Vitest
- `npm run test`
- CLI output に触れた場合は CLI smoke test

### Non-Goals

- UI の全表示最終化。
- 新しい RV32I 命令の追加。
- QEMU timing 比較。

## Phase 9: UI Adaptation To Rask Trace

### Scope

UI を `rask` の trace、retire log、pipeline occupancy、event marker に合わせる。core の CPU 挙動を UI へ重複実装しない。

### Outcomes

- timeline は横軸 cycle、縦軸 dynamic instruction の pipeline occupancy map として表示される。
- timeline cell は stage と固定サイズ event marker を表示し、row / cell size は event marker 数で変化しない。
- Inspector は選択 cycle、命令、event marker について、stall 理由、flush 理由、retire、RAM diff、error を説明する。
- forwarding 表示は削除される。
- Registers tab は `x0` から `x31` までを固定順で表示し、現在 cycle の差分だけを強調する。
- Memory tab は word grouping を基本にし、byte diff を示せる。
- 実行済み program を編集した場合は simulation invalidated として扱われ、暗黙に実行途中へ差し替えない。

### Completion Conditions

- UI は core trace / projection を消費し、CPU behavior を再計算しない。
- timeline selection と inspector details が `seqId`、cycle、event marker に対して安定している。
- stage board と timeline は、実装内部の pipeline occupancy をそのまま可視化している。
- desktop と landscape-tablet 相当幅で、toolbar、timeline、bottom drawer、right dock、inspector が重なったり潰れたりしない。
- forwarding 前提の copy、event、style、test が残っていない。
- simulation invalidated の user flow が UI test または e2e で検証されている。

### Failure Signals / Recovery

- Failure Signals: UI が stall / flush / retire を独自計算する。event marker 数で timeline row height が変わる。source line と `seqId` の選択がずれる。古い forwarding 表示が残る。編集済み program が実行途中へ暗黙適用される。
- Recovery: UI logic を projection 消費へ戻し、core trace に不足 field があれば core projection 側に追加する。表示の都合で CPU semantics を UI に足さない。
- Guardrail: UI が core truth と別の pipeline behavior を表示する状態で Phase 10 へ進まない。

### Required Verification

- `npm run check`
- UI / hook / component の関連 Vitest
- 主要 workbench flow は `npm run e2e`
- production bundle に影響した場合は `npm run build`

### Non-Goals

- CPU semantics の再変更。
- phone-width layout 最適化。
- 新しい product scope の追加。

## Phase 10: Final Contract Pass

### Scope

`docs/rask-spec.md` の contract と実装、tests、oracle、CLI、UI のズレを横断的に潰す。新機能を増やす Phase ではなく、契約の閉じ作業である。

### Outcomes

- assembler、simulator、CLI、UI、oracle fixtures、tests が `rask-spec.md` の source-of-truth と一致している。
- retire log と pipeline occupancy table の golden が仕様本文の grammar と一致している。
- QEMU functional oracle と hand-written timing oracle の役割分担が tests と docs に反映されている。
- README や developer-facing docs が、実装済みの verification commands と現実に一致している。

### Completion Conditions

- `npm run check`、`npm run test`、`npm run build` が通る。
- `npm run e2e` が通る。
- 実行環境がある場合は `npm run oracle:test` が通る。環境がない場合は skip 理由と、直近の実行可能環境での期待手順が docs にある。
- `docs/rask-spec.md` と実装の差分がある場合、仕様を直すか実装を直すかが明確に処理されている。
- 後続 issue に送る項目がある場合は、仕様外または明示的な future work として分離されている。

### Failure Signals / Recovery

- Failure Signals: final pass で仕様差分が複数 Phase にまたがって発覚する。oracle と simulator の不一致が分類不能になる。UI と CLI が別々の CPU behavior を示す。docs が未実装機能を完了済みのように説明する。
- Recovery: 差分を source-of-truth、functional semantics、timing、terminal behavior、UI projection、oracle harness のどれかに分類し、該当 Phase の境界へ戻って修正する。分類不能なまま一括修正しない。
- Guardrail: 契約差分を known issue として残す場合は、仕様外か future work であることを明記する。`rask` 準拠の未達を曖昧にしない。

### Required Verification

- `npm run check`
- `npm run test`
- `npm run build`
- `npm run e2e`
- 実行環境がある場合は `npm run oracle:test`

### Non-Goals

- 新しい ISA 拡張。
- 新しい UI product scope。
- 仕様にない環境機能や syscall interface。

## Testing Policy

命令追加時に全命令と全 pipeline interaction の組み合わせ爆発は避ける。ただし、各命令の意味論と `rask` 固有の timing / error 規則は代表ケースで必ず押さえる。

- assembler tests: operand format、operand count、register parsing、immediate range、label resolution、unknown instruction、pseudo-instruction expansion、source mapping
- encode/decode tests: instruction word、metadata、operand fields、round trip、unsupported bit pattern
- semantic tests: 各命令カテゴリの register result、RAM result、PC result、signed / unsigned behavior、`fence`、`ebreak`、`ecall`
- pipeline interaction tests: ALU dependency stall、load dependency stall、store data dependency stall、taken branch flush、`jal` / `jalr` flush、redirect priority、occupancy golden
- retirement tests: `x0` write suppression、retire order、error delayed reporting、flush error suppression、MMIO exit retirement、pause
- UI tests: 命令追加ごとには増やさず、timeline selection、Inspector 表示、Registers / Memory 表示、simulation invalidated など共有挙動を代表ケースで検証する
- oracle fixtures: `docs/rask-spec.md` の verification contract を保ち、QEMU と比較する functional verification、手計算 occupancy による timing verification を分離する

Phase ごとの commit 前 verification は、その Phase の Required Verification を最小条件とする。影響が広い場合は、狭い test が通っていても `npm run test`、`npm run build`、`npm run e2e`、`npm run oracle:test` へ広げる。

## Reference

- [rask CPU 仕様書](./rask-spec.md)
- [Glossary](./glossary.md)
- [QEMU Reference Testing](./design-qemu-reference-testing.md)
- [RISC-V Unprivileged ISA, RV32I Base Integer Instruction Set](https://docs.riscv.org/reference/isa/v20240411/unpriv/rv32.html)
