# CPU Pipeline Playground

## Purpose

CPU Pipeline Playground は、RV32I CPU `rask` の短い assembly source を書き、5 段 in-order pipeline の実行をステップごとに観察できるブラウザ playground である。

中心価値は、ユーザーが複数の小さな program を管理し、編集し、実行し、pipeline timeline・hazard・stall・flush・retire・register/RAM 更新の変化を即座に見られることにある。core と画面に見える state は `docs/rask-spec.md` に定義された `rask` 仕様に従う。

CPU、ISA、pipeline、address space、MMIO、exit / error / pause、verification contract の source of truth は `docs/rask-spec.md` とする。用語の解釈に迷う場合は `docs/glossary.md` を参照する。この文書では製品体験と UI 方針を中心に扱い、CPU 詳細や用語定義を重複して定義しない。

## Context

技術基盤は TypeScript + Vite + React とし、同じ TypeScript core を CLI、テスト、React UI から共有する。

アセンブリエディタには CodeMirror 6 を使う。RV32I アセンブリ用 language support、エラー診断、行番号、現在実行行ハイライト、選択命令と timeline の連動を実装できることを前提にする。

UI は Tailwind CSS、Radix UI Primitives、lucide-react を使って作る。Tailwind で密度あるツール UI の見た目を細かく制御し、Radix UI Primitives は dialog、select、tabs、tooltip などのアクセシブルな挙動を借りるために使う。既製の大きな見た目を持ち込むコンポーネントライブラリには寄せない。

テスト基盤は Vitest、React Testing Library、Playwright とする。core の命令意味論、assembler、pipeline state transition は Vitest で検証し、React 部品の基本的な表示や操作は React Testing Library で検証し、エディタ・timeline・実行操作を含むブラウザ上の主要フローは Playwright で確認する。

CPU model は `rask` 仕様に従う。UI は IF / ID / EX / MEM / WB、依存による stall、branch flush、retire、register 更新、RAM 更新、error を観察できるようにする。

初期 UI の対象はデスクトップまたは横長タブレット以上に限定する。スマートフォン幅で同じ情報密度を保つことは初期完成条件にしない。画面破綻を避けるため、プログラムサイズ、実行履歴、表示 cycle 数には初期上限を設けてよい。目安として、100 行程度のプログラムと 300 cycle 程度の履歴を快適に扱えることを優先する。

## Direction

実装は core を中心に置く。CPU model、assembler、simulator は UI 非依存の TypeScript module として設計し、CLI でも同じ assembly source を assemble し、step 実行し、state と retire log / pipeline trace を確認できるようにする。GUI は core の state transition と trace を視覚化する層であり、GUI の見た目から core の state structure を決めない。

画面は IDE 風の固定ワークベンチとして設計し、ペインの形を中身のメディアの形に合わせる。上部に薄い toolbar を置き、Program Library の選択と管理、Reset、Back、Step、Run の実行操作だけを表示する。cycle、命令数、simulation invalidated は pipeline panel の header に表示し、toolbar を state 表示で混雑させない。左ペインは全高の `Code` カラムとし、アセンブリエディタと、assemble error 数・編集による invalidated のチップを置く(コードの状態はコードの横に出す)。右領域は上に pipeline timeline を中心とした観察領域、その直下に `Registers / Memory / Events` の state strip を置く。state strip の 3 tab はいずれも cursor 位置の machine state を表示するものであり、この一文で構造を説明できることを保つ。選択セルの詳細は独立したペインではなく、セルの隣に開く popover で表示する。

Run は Step の自動連打として扱う。一定の周期で 1 cycle ずつ実行を進め、halt、pause、error termination、simulation invalidated、またはユーザーの Pause 操作で停止する。Run は core に新しい実行モードを要求せず、UI 層のスケジューリングとして実装する。

Program Library は中核機能として扱う。ただし常時ペインを占有させず、toolbar の compact な select 風 dropdown から複数のアセンブリプログラムを作成、複製、リネーム、削除、選択できるようにする。dropdown は作業面を大きく塞がない幅に抑え、row action は必要なときだけ目立つようにする。dropdown は Esc と外側クリックで閉じる(リネーム中の Esc はリネームの取り消しを優先する)。プログラムの削除は確認ダイアログではなく、削除直後に取り消せる undo トーストで保護する。サンプルプログラムは初期データとして入っている通常のプログラムの一つにする。初期保存先は browser localStorage 程度でよく、core は保存方式に依存しない。

Workbench layout は制約付き dock として扱う。`Code` カラムは幅を(既定 300px、240〜480px)、state strip は高さを(既定 240px、160〜400px)ドラッグで変更できる。`Code` カラムを閉じると timeline は左端まで広がり、左端に縦の `Code` rail を残す。state strip を閉じると timeline は下端まで広がり、下端に `Registers / Memory / Events` rail を残す。ペインの open/closed、active tab、width/height、レジスタ名表示は browser localStorage に保存し、リロード後に復元する。

pipeline の主表示は、横軸を cycle、縦軸を dynamic instruction にした timeline table にする。timeline は横スクロール可能にし、cycle cursor 周辺を見やすくする。timeline の命令ラベルは editor と重複しないよう行番号と opcode を中心に圧縮し、フル命令文はセル詳細 popover や tooltip で確認できるようにする。timeline は pipeline occupancy map として扱い、event marker は固定サイズの icon/marker のみにする。event marker の数や種類で row/cell height が変わってはいけない。

timeline の各セルは stage を色で塗り、stage 名の略号を重ねる。同じ dynamic instruction が同じ stage に 2 cycle 以上留まる場合、2 cycle 目以降のセルはハッチ表現にし、spec の occupancy table における同一文字の繰り返しと視覚的に対応させる。セルにはこのほか `stall`、`flush`、`retire`、`memory`、`branch`、`error` の event marker だけを表示する。event marker の文章や badge は timeline には出さず、選択セルの詳細はセル詳細 popover、cycle の event marker list は state strip の Events tab に表示する。

観察の時間軸は cycle cursor 1 本に統一する。cursor は timeline 上に常に見える縦線であり、Registers、Memory、Events、editor の実行ハイライトはすべて cursor 位置の cycle snapshot を表示する。Step は cursor が最新 cycle にあるときは simulation を 1 cycle 進めて cursor を追従させ、過去にあるときは cursor を 1 cycle 進めるだけの再生になる。Back は cursor を 1 cycle 戻すだけで、simulation history を破壊しない。cursor は timeline の cycle ruler のドラッグと左右キーでも動かせる。timeline のセル選択は cursor をそのセルの cycle へ移動させる。cursor が最新 cycle より過去にある間は、pipeline header に最新 cycle への復帰操作を含む表示を出し、「いまどの時点を見ているか」を隠さない。現在 cycle の stage 占有は cursor 列そのもので読めるため、独立した stage board は置かない。

セル詳細 popover は、timeline の命令セルや event marker をクリックしたときに、そのセルの隣に開き、その cycle・その命令の説明、hazard 理由、flush 理由、retire、RAM diff、error を表示する。popover は同時に 1 枚だけ開き、Esc・外側クリック・閉じるボタン・別セルの選択で閉じる。Esc で閉じたときはフォーカスを元のセルに返す。popover はカーソルのスクラブでは閉じず、選択セル(命令 × cycle)に留まる。

state strip の Registers tab は `x0` から `x31` まで順番固定の可変列グリッドで表示し、既定の高さで 32 本すべてがスクロールなしで見えることを優先する。cursor cycle で書き込まれた register だけを短い減衰ハイライトで強調する。強調はレイアウトを動かしてはならない。diff の要約は常設の 1 行に表示し、diff の有無で他の要素の位置が変わってはいけない。レジスタ名は `xN` と ABI 名(`zero`、`ra`、`sp`、`t0` など)を切り替えられ、設定は browser localStorage に保存する。Memory tab は RAM state と cursor cycle の RAM diff を表示する。Events tab は cursor cycle の event list を表示する。

ユーザーはエディタを自由に編集できる。実行中または実行済みのプログラムが編集された場合は、現在の simulation を invalidated として扱い、再assemble/reset が必要であることを UI で明示する。編集内容を暗黙に実行途中へ差し替えない。

UI 上の説明は短いラベル、tooltip、popover の event marker 説明に寄せる。error、hazard、stall、flush の理由は、ユーザーが該当セルや event marker を選んだときに理解できる粒度で表示する。

見た目は密度の高い開発ツールとして整え、計測器(logic analyzer)を範とするデザイン言語に従う。UI のクローム(枠、ボタン、タブ、罫線)はほぼ無彩色とし、画面上の色は必ず CPU の意味を指す。stage には固定の 5 色(IF 青、ID 緑、EX 琥珀、MEM 朱、WB 紫。色覚多様性に配慮したパレット)を割り当て、timeline、editor の実行ハイライト、register の書き込み表示まで全画面で一貫して使う。色は常に stage 略号や位置と冗長化し、色だけに意味を担わせない。error だけは専用の赤を使う。装飾のためのアクセント色は持たない。カラースキームはライトのみを提供する。

書体は IBM Plex Mono を主とし、ニーモニック、数値、UI ラベルまで monospace で組む。数値は tabular に揃え、値の変化で幅が揺れないようにする。説明的な文章のみ IBM Plex Sans を使う。全大文字のクローム表記は使わず、大文字は stage 略号と cycle 軸ラベルに限る。

toolbar は program management と実行操作、左は source editing、右上は pipeline observation、右下は cursor 位置の state inspection、セル単位の詳細は popover という役割分担を明確にし、装飾的なカードや大きなヒーロー表現は使わない。ペイン幅は安定した最小幅を持たせ、CodeMirror と timeline が同時に潰れないようにする。状態の変化を伝えるアニメーションは短い減衰(latch、pulse)に限り、`prefers-reduced-motion` では無効化する。timeline の自動スクロールは cursor が可視範囲から出るときだけ行う。

## Completion Conditions

- TypeScript + Vite + React のアプリとして起動でき、core、CLI、React UI が同じ TypeScript の assembler/simulator を共有している。
- CodeMirror 6 ベースのアセンブリエディタで、RV32I アセンブリを編集でき、構文エラーや assemble エラーがユーザーに分かる形で表示される。
- Program Library で複数プログラムを作成、複製、リネーム、選択でき、初期サンプルが通常プログラムの一つとして扱われる。
- core の simulator が `docs/rask-spec.md` に準拠している。
- CLI から短い assembly source を assemble し、step 実行し、各 cycle の state と retire log / pipeline trace を確認できる。
- React UI の中央領域で、横軸 cycle・縦軸 dynamic instruction の pipeline timeline を確認でき、stage、stall、flush、retire、memory、branch、error の event marker が視覚的に区別できる。
- 実行 toolbar の Reset / Back / Step / Run が UI 上で機能し、Run は halt / pause / error / invalidated で停止する。
- timeline 上の cycle cursor をドラッグ・左右キー・セル選択で動かせ、Registers / Memory / Events が cursor 位置の snapshot を表示する。cursor が最新 cycle より過去のとき、最新へ戻る操作が pipeline header にある。
- timeline の命令セルや event marker を選択すると、セル詳細 popover にその cycle・命令の説明、hazard 理由、flush 理由、retire、RAM diff、error が表示され、Esc・外側クリック・閉じるボタンで閉じられる。Registers / Memory / Events は state strip の tab で確認でき、Registers は xN / ABI 名の表示切替を持つ。
- 実行中または実行済みのプログラムを編集した場合、simulation が invalidated として扱われ、再assemble/reset が必要であることが UI で分かる。
- プログラム削除が undo トーストで取り消せ、program dropdown が Esc で閉じる。
- デスクトップまたは横長タブレット相当の画面で、toolbar の Program Library dropdown、Code カラム、timeline、state strip、popover が重なったり潰れたりせず、timeline は横スクロールや表示 window で破綻せずに閲覧できる。
- Code カラムと state strip の resize、close/open、rail からの復帰、localStorage layout 復元が UI 上で機能する。
- Vitest で命令意味論、assembler、pipeline state transition、hazard/stall/flush/retire/memory/error の代表ケースが検証されている。
- React Testing Library または Playwright で、プログラム選択、編集、assemble、step 実行、timeline 選択、セル詳細 popover 表示の主要フローが検証されている。
