# 修正計画書: サイクル帰属の統一と仕様適合 (2026-07-03)

この文書は、2026-07-03時点の全ソース調査で見つかった設計上の問題点・不具合・リファクタリング項目を、優先度と依存関係に基づいて6 つの Phase に分けた修正計画である。
各 Phase は独立した PRとして完結させ、Phase 末尾の検証をすべて通してから次へ進む。

調査時点で `npm run check` と `npm run test`(109件)はすべて成功している。
つまり以下の問題の多くは「テストが実装の誤りを固定化している」状態であり、ゴールデンの更新を伴う。
ゴールデン更新の根拠は必ず本計画書の手計算表または`docs/rask-spec.md` に求めること。

## 全体像と依存関係

```text
Phase 0  仕様の確定(docs のみ、コード変更なし)
   │
Phase 1  サイクル帰属の統一(core の中核修正 + ゴールデン更新)
   │
   ├─ Phase 2  個別の仕様適合修正(jalr / exit device / MMIO 分類)
   │
   ├─ Phase 3  core の構造リファクタ(挙動変更なし)
   │
   └─ Phase 4  UI の修正
              │
Phase 5  小規模改善(いつでも着手可、他 Phase と競合しない)
```

- Phase 0 が全ての前提である。
  CLAUDE.mdの規則「文書が誤っている場合は、文書を先に直す」に従う。
- Phase 2・3・4 は Phase 1 完了後なら相互に独立して進められる。
- Phase 5 は他と競合しないため任意のタイミングでよい。

---

## 背景: 最重要問題「サイクル帰属の 1 サイクルずれ」

他の多くの症状の根本原因なので、最初に仕組みを説明する。

`stepSimulation`(`src/core/simulator.ts`)は、サイクル N のスナップショットに次の2 つを混在させている。

1. **占有表・タイムラインのセル**:
   そのステップで計算した「次ラッチ」(`nextLatches`)の内容をサイクル Nのセルとして記録する。
2. **イベント・状態変化**:
   そのステップで「入力ラッチ」(前サイクル末の値)に対して行った作用(retire、メモリアクセス、分岐解決)をサイクルN のイベントとして記録する。

命令がラッチに入るのは作用の 1 ステップ前なので、**セルは常にイベントより 1サイクル早い**。
実測で確認済みの帰結は次の通り。

- **retire マーカーが UI に一切出ない**:
  retire イベントは W セルの 1 サイクル後に発火し、その時点で命令はどのステージにもいないため、`buildTimeline` がどのセルにも紐付けない(全 retire イベントが孤児)。
- **branch マーカーが MEM セルに付く**:
  分岐解決イベントは X セルの 1 サイクル後(= M セルのサイクル)に発火する。
- **memory マーカーが W セルに付く**:
  同上の 1 サイクルずれ。
- **Registers / Memory の diff が W セルの 1 サイクル後に出る**:
  `registerDiffs` / `memoryDiffs` は作用側のサイクルに記録される。
- **終了時に占有表の W が 2 連続する**:
  例: `S4 80000010 .......FFFFDDDDXMWW`。
  terminalステップが同じ命令の W セルをもう一度作る(`simulator.ts` の`terminalLatches`)。
  仕様 10.2「リタイアした命令は必ず Wで終わる」および不変条件 I1 に違反。
- **taken 分岐のペナルティが 3 バブル**:
  redirect が X セルの 1 サイクル後に適用されるため、リダイレクト先のフェッチが仕様§4 の 3 フェーズ意味論より 1 サイクル遅い。
  仕様 §6.2 は「2バブル」と定めている。

さらに深刻なのは、`docs/rask-spec.md` §10.3の実例自体がこの実装のずれを取り込んで**仕様内で自己矛盾している**ことである。

- §6.2 は「2 バブル」と定める。
- §10.3 の表は S2 の `X` がサイクル 11、S5 の `F` がサイクル 13 にあり、これは 3バブルを意味する。
- §10.3 の本文は「S2 の X、つまりサイクル 12 で分岐が解決し」と書いており、表(Xはサイクル 11)と食い違う。

`tests/core/simulator.test.ts`のゴールデン(`matches the representative hazard occupancy golden`)はこの矛盾した表と一致するよう書かれている。

---

## Phase 0: 仕様の確定(docs のみ)

**目的**: コードを 1 行も変えずに、`docs/rask-spec.md`の自己矛盾と未定義箇所を解消し、Phase 1 以降の正解を文書として確定する。

### 0-1. §10.3 実例の修正(必須)

§4 の 3 フェーズ意味論と §6.2 の「2バブル」を正とし、実例の表と本文を以下の手計算結果に置き換える。

正しい導出: フェーズ 1 はサイクル N の開始時点のラッチ値(= サイクル N-1末に書かれた値)から `redirect` / `stall` を計算する。
S2(beq)の decode出力はサイクル 10 末に ID/EX へ書かれるので、redirect はサイクル 11中に成立し、サイクル 11 末に PC 更新と IF/ID・ID/EX のフラッシュが起きる。
S3 はD のままサイクル 11 で消え、サイクル 11 中にフェッチされた S4 は受理されず Fのみを残し、S5 はサイクル 12 にターゲットからフェッチされる。

```text
cycle       1234567890123456
S0 80000000 FDXMW
S1 80000004 .FDDDDXMW
S2 80000008 ..FFFFDDDDXMW
S3 8000000c ......FFFFD
S4 80000010 ..........F
S5 80000010 ...........FDXMW
```

- S2 の `X` はサイクル 11。
  分岐はサイクル 11 中に解決する。
- EX が空になるのはサイクル 12・13 の 2 サイクル = 2 バブル(S5 の `X` はサイクル14)。
  §6.2 と整合する。
- retire log は現行のまま変更なし。
- データハザード(S1・S2 の `D` 4 連続 = 3 ストール + 1成功)は現行と同一。
  変わるのはフラッシュとリフェッチのタイミングだけである。

本文の「サイクル 12 で分岐が解決」「S5 はサイクル 13に」の記述も上記に合わせて修正する。

### 0-2. pipeline drain 停止の正式化(必須・決定事項 D1)

現状、仕様 §2.2/§4 は「RAM は一様な 4 MiB」「PC は毎サイクル +4」と読めるが、§10.1 は「pipeline drain で停止した場合、terminal recordは現れない」と述べ、§10.3の表にはプログラム終端より先のフェッチ行が存在しない。
実装(`fetchInstruction`)はプログラム像の外で命令を供給せずPC を凍結し、パイプラインが空になったら halt する。

**推奨決定**: drain 停止を正式仕様として §4・§7 に明文化する。

- 「instruction image の終端を越えた(またはプログラム語が存在しない RAM番地への)フェッチは命令を供給せず、IF stage slot は空のままとなる。
  このとき PCは更新されない(§4 の PC+4 規則の唯一の例外)。
  全ラッチと IF stage slotが空になった時点で simulator は terminal recordなしに停止する」という趣旨を追記する。
- 代替案(ゼロ埋め RAM を fetch → `undef-instr`エラー)は、終了ストアを持たない全サンプルプログラムが ERROR 終了になりplayground として悪化するため不採用とする。
  理由を §11 に記録する。

### 0-3. exit device の未定義値・アクセス幅の定義(必須・決定事項 D2)

現状の仕様は `0x5555` と `(code << 16) | 0x3333` の 2パターンしか定めておらず、それ以外の値・幅の挙動が未定義。
実装は任意の値・任意幅(sb/sh/sw)のストアをexit として扱い、`sb` の 1 バイトストア(例: 値 0x55)でも「failure, code 0」で終了してしまう。

**推奨決定**: 次のように §2.2 を明確化する。

- exit device への**word ストア(`sw`)のみ**を定義済みアクセスとする。
  値が`0x00005555` なら正常終了(EXIT 0)、下位 16 bit が `0x3333` なら失敗終了(EXIT code、code は上位 16 bit)。
- それ以外の値の word ストア、および `sb`/`sh` による exit device へのストアは`mmio-violation` エラーとする(UART が byte ストアのみ定義であることと対称)。
- QEMU sifive_test は定義外の値を無視して続行するが、§8.1により定義外アクセスはプログラム側の制約違反なので oracle比較の対象外である旨を注記する。

### 0-4. `mmio-violation` の対象領域の定義(必須・決定事項 D3)

仕様 §7 は「定義外のデバイス領域へのアクセス」を `mmio-violation`とするが、「デバイス領域」の範囲が定義されていない。
実装は UART(`0x10000000`)とexit device(`0x00100000`)のピンポイント番地以外をすべて `mem-unmapped`にしている(例: QEMU virt では UART ステータスレジスタが実在する `0x10000004` も`mem-unmapped`)。

**推奨決定**: §2.2 にデバイス領域を定義する。

- UART デバイス領域: `0x10000000`–`0x10000fff`
- exit デバイス領域: `0x00100000`–`0x00100fff`
- 各領域内で、定義済みデバイスレジスタへの定義済みアクセス以外はすべて`mmio-violation`。
  領域外かつ RAM 外は `mem-unmapped`。

### 0-5. jalr のミスアラインターゲットの検出位置の確認(必須)

仕様 §4 は jalr のターゲットを `(rs1Val + imm) & ~1`とし、ミスアラインフェッチ(`PC[1:0] != 0`)は §7 で「IFで検出」と定めている。
つまり **jalrは常にリダイレクトし、ミスアライン検出はリダイレクト先の IFで行い、エラーはフェッチされた側の dynamic instruction に付く**(ERROR レコードは`pc = ターゲット`、`instr = --------`)。
これが既に仕様の帰結であることを確認し、§7に一文補足する(現実装は EX で jalr 自身にエラーを付けており仕様違反。
修正はPhase 2)。

### 0-6. 検証

- `docs/rask-spec.md` 内で §4・§6.2・§10.3(表・本文)・§7・§2.2が相互に矛盾しないことをレビューで確認する。
- 0-1 の表は本計画書の導出をレビュアーが手で追跡できること。

---

## Phase 1: サイクル帰属の統一(core 中核修正)

**目的**: スナップショット N の占有セル・イベント・状態変化をすべて「サイクル Nに各ステージが処理した命令」に統一する。
これで背景の表に挙げた 6症状すべてと、`buildTimeline` のフラッシュセル捏造ハックが同時に解消する。

**対象**:`src/core/simulator.ts`、`src/core/types.ts`、`tests/core/simulator.test.ts`

### 1-1. ステップ構造の修正

現行の構造的な誤りは、`fetch` ラッチが ifIdの手前の**余分なパイプラインレジスタ**として振る舞い、それを補償するために`nextLatches` をサイクル Nのセルとしてラベル付けしている点にある。
次の構造に改める。

状態は 4 ラッチ(`ifId`, `idEx`, `exMem`, `memWb`)と、stall 凍結の可視化用の IF stage slot、PC、レジスタファイル、メモリ、デバイス状態とする。
ステップ N は仕様§4 の 3 フェーズをそのまま実装する。

```text
フェーズ 1(信号計算): 入力ラッチのみから計算する
  redirect ← idEx(bubble / errorKind != none なら不成立)
  stall    ← ifId の sources を idEx・exMem・memWb の書き手と比較(redirect 成立時は無視)

フェーズ 2(next state 計算): 各ステージは入力ラッチを処理する
  WB  ← memWb を retire(レジスタ書き込み、retire log、terminal 判定)
  MEM ← exMem を処理(アドレス検査、RAM/デバイスアクセス)
  EX  ← idEx を処理(ALU、分岐判定の材料)
  ID  ← ifId をデコード
  IF  ← IF slot が空なら PC からフェッチして slot に書き、seqId を採番する。
        slot が保持中(前サイクルの stall による)ならそのまま

フェーズ 3(state update):
  redirect 成立: PC ← ターゲット、ifId ← bubble、idEx ← bubble、IF slot ← 破棄
  stall のみ成立: PC・ifId・IF slot を凍結、idEx ← bubble
  どちらも不成立: ifId ← IF slot(消費して slot を空に)、idEx ← ID 出力、
                 exMem ← EX 出力、memWb ← MEM 出力、PC ← PC + 4
                 (フェッチできなかった場合は drain 規則により PC 凍結。Phase 0-2 参照)
```

IF slot の規則(仕様 §5 の IF の忠実な実装):

- slot が空のときだけフェッチし、そのとき seqId を採番する。
  stall保持中は再フェッチも再採番もしない。
- redirect のサイクルにもフェッチは起きる(F セルと seqId を残す)が、フェーズ 3で破棄される。
  §10.3 の S4 がこれに当たる。

### 1-2. タイムライン・イベントの帰属

サイクル N のタイムラインセルは次から作る:`memWb → W`、`exMem → M`、`idEx → X`、`ifId → D`、`IF slot → F`(すべて**入力側**、つまりそのサイクルに処理された命令)。
イベント(stall / branch / flush / retire / memory / error)は同じステップ内の作用なので、seqIdによるセルへの紐付けが自動的に一致する。

- `buildTimeline` のフラッシュセル捏造(`stage: "ID"`ハードコードのブロック)は削除する。
  フラッシュされる命令は入力ラッチに実在するので通常経路でセルが立つ。
- terminal ステップ(exit / error のretire)では、その時点の入力ラッチ全部をサイクル N のセルにする。
  retireする命令は W を 1 個だけ持ち、破棄される若い命令は X / Mなどの途中文字で行が終わる(**決定事項 D4**: 破棄命令のセルを terminalサイクルに含めることを推奨。
  それらは実際にそのサイクルにステージを占有していた)。
  Wの 2 連続は構造的に起きなくなる。
- `CycleSnapshot.stages`(StageBoard と CLI が表示)は上記の「サイクル Nに処理された命令」ビューにする。
  `latches`はサイクル末のラッチ値として残す。
  両者はもはや互いの射影ではないことに注意(それが正しい)。

### 1-3. 期待される挙動変化(テスト更新の根拠)

- §10.3 ゴールデン: S3 `......FFFFD`、S4 `..........F`、S5 `...........FDXMW`に変わる(Phase 0-1 の表)。
  S0–S2 と retire log は不変。
- stall イベントは 1 サイクル早くなる(例: 依存する命令が Dに入った最初のサイクルから)。
  件数は不変。
- branch / flush イベントは分岐の X セルと同じサイクルに発火する。
- retire イベントは W セルと同じサイクルに発火し、必ず W セルに紐付く。
- memory イベント・`memoryDiffs` は M セルと同じサイクル、`registerDiffs` は Wセルと同じサイクルに記録される。
- taken 分岐のペナルティが 2 バブルになる(総サイクル数が分岐 1 回につき 1減る)。

### 1-4. 検証

- `tests/core/simulator.test.ts` のゴールデンと イベントサイクル依存の期待値をPhase 0-1 の表に合わせて更新し、`npm run test` を通す。
- 新規テストを追加する: (a) retire イベントが Wセルに紐付く(孤児イベントが存在しない)こと、(b) branch イベントが Xセルに紐付くこと、(c) exit プログラムの占有表で W が 1 個だけであること。
- 検証プローブ: 全イベントについて `(cycle, seqId)`に対応するタイムラインセルが存在することを機械的に確認するテストを入れると回帰に強い。
- `npm run check`、`npm run e2e`(タイムライン表示のフローが変わるため)。
- oracle 署名は timing を含まないため影響しない(`npm run oracle:test` は任意)。

---

## Phase 2: 個別の仕様適合修正

**目的**: Phase 0 で確定した仕様に実装を合わせる。
Phase 1の後に行う(ゴールデン更新を二度やらないため)。

**対象**: `src/core/simulator.ts`、`tests/core/simulator.test.ts`

### 2-1. jalr のミスアラインターゲット(Phase 0-5)

現実装(`runExecute` の `jalr` ケース)は `(target & ~1) % 4 != 0` のとき jalr自身に `fetch-misaligned`エラーを付け、リダイレクトしない。
ターゲットが未マップの場合はリダイレクトしてIF で検出しており、非一貫でもある。

修正: jalr は常に `taken: true, nextPc: (rs1Val + imm) & ~1`を返す。
ミスアライン検出は IF(`fetchInstruction` に既にある `pc % 4 != 0`分岐)に任せる。
ERROR レコードは `pc = ターゲット`、`instr = --------` になる。

テスト`clears bit zero for jalr targets and halts on misaligned instruction addresses`の期待値を更新する(errorKind は同じ `fetch-misaligned` だが、記録される pc / instr が変わる。
また jalr 自身は正常に retire して link値を書くようになる点に注意 —仕様上、エラーはフェッチされた側の命令のものである)。

### 2-2. exit device の値・幅検査(Phase 0-3)

- `classifyDataAccess`: exit device への store は width 4 のみ `ok`とし、`sb`/`sh` は `mmio-violation` にする。
- `decodeExitRequest`: `value === 0x00005555` →正常終了、`(value & 0xffff) === 0x3333` → code = 上位 16 bitの失敗終了、それ以外 → exit ではなく `mmio-violation` エラー。
- `ExitRequest.success` は terminal record まで運んで `TerminalRecord`に載せるか、使わないなら型ごと削除する。
  **現状どこからも消費されていない dead field を残さない。
  **

### 2-3. MMIO 領域の分類(Phase 0-4)

`classifyDataAccess` に UART 領域・exit 領域(Phase 0-4の範囲)の判定を追加し、領域内の未定義アクセスを `mmio-violation`、領域外かつ RAM外を `mem-unmapped`にする。
境界値テスト(`0x10000004`、`0x10000fff`、`0x10001000`、`0x000fffff`など)を追加する。

### 2-4. 検証

`npm run check` / `npm run test`。
エラー種別が変わるケースはテストの errorKind期待値を Phase 0 の決定に合わせて更新する。
可能なら `npm run oracle:test` でexit 系 fixture の署名一致を確認する。

---

## Phase 3: core の構造リファクタ(挙動変更なし)

**目的**: 実装を仕様 §2.3のラッチモデルに寄せ、重複を畳む。
**このフェーズで観測可能な挙動(retire log・占有表・イベント・署名)は一切変えない。
**既存テストがそのまま回帰検知になる。

**対象**:`src/core/simulator.ts`、`src/core/types.ts`、`src/core/instructionMetadata.ts`

### 3-1. レジスタ読みを ID に移す

現状は EXがレジスタファイルを直読みし(`runExecute(…, registers)`)、しかも同一ステップ内で`retireWriteback` が先に `registers` を破壊的更新した後に読む。
現行の stall述語の下では観測等価だが(調査時に確認済み)、仕様 §5「IDはレジスタファイルを読み、ID/EX へ rs1Val・rs2Valを書く」と食い違い、フォワーディング等の将来変更で静かに壊れる。

修正: ID ステップで `rs1Val` / `rs2Val` を読み、slot(ID/EX ラッチ)に載せる。
EXはラッチ値だけを使う純関数にし、`registers` 引数を外す。
`retireWriteback`の呼び出し順への暗黙依存が消える。

### 3-2. `memOp` メタデータで `runMemory` を畳む

`runMemory` は lb/lbu/lh/lhu/lw/sb/sh/sw の 8 命令分、classify → アライン検査 →イベント → effect のほぼ同型コードを約 200 行繰り返している。
仕様 §2.3 の`memOp`(方向 {load, store} × 幅 {byte, half, word} × 符号拡張)を`INSTRUCTION_METADATA` に追加し、1 本の処理に畳む。
`runExecute` の R/I 型 switchも `aluOp` メタデータ化で同様に畳める(こちらは任意)。

### 3-3. エラー slot の偽命令をやめる

`fetchInstruction` / `invalidInstruction` はフェッチエラー・デコード不能時に`addi x0, x0, 0` の捏造 `Instruction`(`text: "misaligned fetch at …"` 等)を slotに詰めており、それがハザード判定・retire log・UI 表示へ流れ込む。
`StageSlot`を「正常(instruction あり)/ エラー(errorKind と生ワードのみ)」の判別 unionにするか `instruction` を optional にし、消費側(`sourceRegisters` / `destinationRegister` / retire log / Timeline 行ラベル)を明示的に分岐させる。

### 3-4. O(n²) の解消(任意)

- `occupancyTable`を毎ステップ全履歴(`state.history.flatMap(...)`)から再構築して全スナップショットに保存している。
  行状態を差分更新するビルダーに変え、文字列テーブルは要求時に生成する。
- スナップショットごとの `memory` 全クローンも、300 cycle上限内では実害が小さいため任意とする。
  上限を上げる場合の前提作業。

### 3-5. 検証

`npm run check` / `npm run test` が**無変更で**通ること(3-3 で slotの形が変わる分のテスト修正のみ許容)。
`npm run cli -- <sample>` の出力が Phase 1完了時点と同一であることを目視確認する。

---

## Phase 4: UI の修正

**目的**: 可視化の正しさ(Phase 1 の成果を UI で確認)と、design.mdとの乖離の解消。

**対象**: `src/ui/**`

### 4-1. Phase 1 の成果の確認(必須)

- タイムラインに retire マーカーが W セルに、branch マーカーが Xセルに表示されることを確認し、`tests/ui/App.test.tsx` または e2eに検証を追加する。
- Registers / Memory の diff 強調が W / Mセルのサイクルと一致することを確認する。

### 4-2. アドレス・数値表示の統一(必須)

- Memory タブと Memory Diffs(`RightDock.tsx` の `[{diff.address}]` と`[{address}]`)が 10 進表示になっている。
  `toHex32` で統一する。
- core のイベントメッセージ(`byte address ${address}` など。
  `simulator.ts`各所)も hex 表示に直す。
  retire logのフォーマット(§10.1)は仕様固定なので触らない。

### 4-3. タイムラインの 1-origin 表示(必須)

`Timeline.tsx` はサイクル 0の常に空のカラムを描画している(`Array.from({ length: maxCycle + 1 })` で 0始まり)。
仕様 §4「外部表示の cycle number は 1-origin」に合わせ、カラムを 1から始める。

### 4-4. 選択サイクルと状態表示の整合(決定事項 D5)

Registers / Memory タブはセル選択に関係なく常に `simulation.current`を表示している。
**推奨**: セル選択中は `selectedSnapshot` の registers / memory / diffs を表示し、未選択時は current を表示する(Events タブの`activeEventSnapshot` と同じ規則)。
design.md の Inspector 連動の趣旨に合う。

### 4-5. pause の可視化(必須)

core は `paused`(ebreak retire)を持つが UI は未使用。
pipeline panel のheader(`cycle N` の隣)に paused バッジを出す。

### 4-6. invalidated 中の Back の扱い(決定事項 D6)

Back ボタンは invalidated中も有効で、編集後のソースを表示したまま旧シミュレーションの履歴を操作できる。
**推奨**:Step と同様に invalidated中は無効化する(design.md「編集内容を暗黙に実行途中へ差し替えない」の趣旨)。

### 4-7. その他(それぞれ小さい独立修正)

- `asmLanguage.ts` の `updateListener`(何もしない dead code)と、それだけのために存在する `opcodes` 変数を削除する。
- 未使用依存 `@codemirror/lang-javascript`・`@radix-ui/react-select` を`package.json` から外す。
- `usePrograms.statuses` が編集 1キーストロークごとに全プログラムを再アセンブルしている。
  プログラムごとにsource をキーにメモ化するか、選択中プログラム以外は遅延評価にする。
- `useSimulationSession` のプログラム切替が「レンダー時 useMemo + useEffect のsetState」の二重機構で、切替時に `createSimulationForSource`(assemble 込み)が2 回走る。
  reducer 化するか、`programId` を key にしたコンポーネント分割で 1経路にする。
- `programStore.loadPrograms` が localStorage の JSONを形状検証せずキャストしている。
  `id` / `name` / `source`の存在と型を検証し、壊れたエントリは破棄して初期サンプルにフォールバックする。

### 4-8. 検証

`npm run check` / `npm run test` / `npm run e2e`。
`npm run dev`で以下を目視確認する: retire / branch マーカーの位置、Wセルのサイクルでのレジスタ強調、hex 表示、cycle 1 始まりのヘッダ、ebreak でのpaused バッジ、invalidated 中の Back 無効。

---

## Phase 5: 小規模改善(独立・任意タイミング)

- **CLI**(`src/cli.ts`):
  cycles 引数が数値でないと `NaN` 比較で 0サイクル実行になる。
  パース失敗時は usage を出して exit 1。
  `pc=2147483652` の10 進表示も hex にする。
- **アセンブラのエラー column**(`assembler.ts` の `fail`):
  ラベル除去後の `body`基準のため元テキストとずれる。
  元の行テキスト基準で計算する(現状 linterは行全体をハイライトしているため実害は小さい)。
- **未使用 export の削除**:
  `writesRegister`(`instructionMetadata.ts`)、`ExecutionImageInstruction.expandedFrom`(セットされるが未消費)。
  使う予定がないなら消す。
- **(任意・スコープ判断)pseudo-instruction の拡充**:
  現状 `nop` のみ。
  `j` / `li` / `mv` / `ret` あたりは design.md の「pseudoはアセンブラ層」の範囲で追加できる。
  着手する場合は `docs/rask-spec.md`ではなく assembler 層に閉じること。
- **(任意)シンタックスハイライト**:
  design.md は「RV32I 用 language support」を掲げるが現状は theme + linter のみ。
  CodeMirror の `StreamLanguage`で opcode / レジスタ / 即値 / ラベル / コメントの最小ハイライトを足す。

検証: 各項目に対応する既存テストの維持 + CLI は手動確認。

---

## 決定事項一覧(実装前に合意すること)

| ID  | 内容                                    | 推奨                                                                                                    |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| D1  | プログラム像の外のフェッチの扱い        | drain 停止を仕様として正式化(PC 凍結、terminal record なし)                                             |
| D2  | exit device の未定義値・幅              | word ストアのみ定義。`0x5555` = 成功、下位 16 bit `0x3333` = 失敗。他は `mmio-violation`                |
| D3  | デバイス領域の範囲                      | UART `0x10000000`–`0x10000fff`、exit `0x00100000`–`0x00100fff`。領域内未定義アクセスは `mmio-violation` |
| D4  | terminal サイクルでの破棄命令のセル表示 | 表示する(実際にステージを占有していたため)                                                              |
| D5  | Registers / Memory タブと選択サイクル   | 選択中は選択スナップショットを表示                                                                      |
| D6  | invalidated 中の Back                   | 無効化する                                                                                              |

## 各 Phase 共通の検証コマンド

| コマンド                        | 用途                                                                    |
| ------------------------------- | ----------------------------------------------------------------------- |
| `npm run check`                 | 型検査(全 Phase)                                                        |
| `npm run test`                  | core / React のユニットテスト(全 Phase)                                 |
| `npm run e2e`                   | ブラウザフロー(Phase 1・4)                                              |
| `npm run cli -- <asm> [cycles]` | 占有表・retire log の目視確認(Phase 1・2・3)                            |
| `npm run oracle:test`           | QEMU 参照比較。timing は対象外なので Phase 2 の機能変更時のみ意味がある |

## 進め方の注意

- 各 Phase を 1 PR とし、Phase をまたぐ変更を混ぜない。
  特に Phase 1(挙動変更 + ゴールデン更新)と Phase 3(挙動不変のリファクタ)を混ぜると、ゴールデン差分の原因がレビューで追えなくなる。
- ゴールデンを更新するときは、期待値の根拠(本計画書 Phase 0-1の表、または仕様の該当節)を PR説明に明記する。
  「実装の出力に合わせた」だけの更新は禁止。
- 仕様と実装が食い違ったら常に `docs/rask-spec.md`を正とし、仕様側が誤っている場合は先に仕様を直す(CLAUDE.md)。
