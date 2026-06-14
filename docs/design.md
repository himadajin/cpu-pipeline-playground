# CPU Pipeline Playground

## Purpose

CPU Pipeline Playground は、RV32I CPU `rask` の短い assembly source を書き、5 段 in-order pipeline の実行をステップごとに観察できるブラウザ playground である。

中心価値は、ユーザーが複数の小さな program を管理し、編集し、実行し、pipeline timeline・hazard・stall・flush・retire・register/RAM 更新の変化を即座に見られることにある。core と画面に見える state は `docs/rask-spec.md` に定義された `rask` 仕様に従う。

CPU、ISA、pipeline、address space、MMIO、exit / error / pause、verification contract の source of truth は `docs/rask-spec.md` とする。用語の解釈に迷う場合は `docs/glossary.md` を参照する。`docs/rv32i-roadmap.md` は、現行実装を `rask` 仕様へ移行するためのロードマップである。この文書では製品体験と UI 方針を中心に扱い、CPU 詳細や用語定義を重複して定義しない。

## Context

技術基盤は TypeScript + Vite + React とし、同じ TypeScript core を CLI、テスト、React UI から共有する。

アセンブリエディタには CodeMirror 6 を使う。RV32I アセンブリ用 language support、エラー診断、行番号、現在実行行ハイライト、選択命令と timeline の連動を実装できることを前提にする。

UI は Tailwind CSS、Radix UI Primitives、lucide-react を使って作る。Tailwind で密度あるツール UI の見た目を細かく制御し、Radix UI Primitives は dialog、select、tabs、tooltip などのアクセシブルな挙動を借りるために使う。既製の大きな見た目を持ち込むコンポーネントライブラリには寄せない。

テスト基盤は Vitest、React Testing Library、Playwright とする。core の命令意味論、assembler、pipeline state transition は Vitest で検証し、React 部品の基本的な表示や操作は React Testing Library で検証し、エディタ・timeline・実行操作を含むブラウザ上の主要フローは Playwright で確認する。

CPU model は `rask` 仕様に従う。UI は IF / ID / EX / MEM / WB、依存による stall、branch flush、retire、register 更新、RAM 更新、error を観察できるようにする。

初期 UI の対象はデスクトップまたは横長タブレット以上に限定する。スマートフォン幅で同じ情報密度を保つことは初期完成条件にしない。画面破綻を避けるため、プログラムサイズ、実行履歴、表示 cycle 数には初期上限を設けてよい。目安として、100 行程度のプログラムと 300 cycle 程度の履歴を快適に扱えることを優先する。

## Direction

実装は core を中心に置く。CPU model、assembler、simulator は UI 非依存の TypeScript module として設計し、CLI でも同じ assembly source を assemble し、step 実行し、state と retire log / pipeline trace を確認できるようにする。GUI は core の state transition と trace を視覚化する層であり、GUI の見た目から core の state structure を決めない。

画面は IDE 風の固定ワークベンチとして設計する。上部に薄い toolbar を置き、Program Library の選択と管理、Reset、Back、Step の実行操作だけを表示する。cycle、命令数、assemble error、simulation invalidated は pipeline panel の header に表示し、toolbar を state 表示で混雑させない。中央ペインは上側に pipeline timeline を中心とした観察領域、下側に `Assembly / Events` drawer tabs を置く。右ペインは `Inspector / Registers / Memory` dock tabs とし、event marker 詳細、レジスタ一覧、RAM 一覧を分離する。右 dock と下 drawer は resize と close/open ができ、閉じた状態でも細い rail を残して再表示できる。

Program Library は中核機能として扱う。ただし常時ペインを占有させず、toolbar の compact な select 風 dropdown から複数のアセンブリプログラムを作成、複製、リネーム、削除、選択できるようにする。dropdown は作業面を大きく塞がない幅に抑え、row action は必要なときだけ目立つようにする。サンプルプログラムは初期データとして入っている通常のプログラムの一つにする。初期保存先は browser localStorage 程度でよく、core は保存方式に依存しない。

Workbench layout は制約付き dock として扱う。右 dock は幅を、下 drawer は高さをドラッグで変更できる。右 dock を閉じると timeline は右端まで広がり、右端に `Inspector / Registers / Memory` rail を残す。下 drawer を閉じると timeline は下端まで広がり、下端に `Assembly / Events` rail を残す。dock の open/closed、active tab、width/height は browser localStorage に保存し、リロード後に復元する。

pipeline の主表示は、横軸を cycle、縦軸を dynamic instruction にした timeline table にする。現在 cycle の IF / ID / EX / MEM / WB だけを見せる stage board は補助表示として扱う。timeline は横スクロール可能にし、現在 cycle 周辺を見やすくする。timeline の命令ラベルは editor と重複しないよう行番号と opcode を中心に圧縮し、フル命令文は inspector や tooltip で確認できるようにする。timeline は pipeline occupancy map として扱い、event marker は固定サイズの icon/marker のみにする。event marker の数や種類で row/cell height が変わってはいけない。

timeline の各セルには stage 名と、`stall`、`flush`、`retire`、`memory`、`branch`、`error` などの event marker だけを表示する。event marker の文章や badge は timeline には出さず、選択セルの詳細は Inspector、cycle 全体の event marker list は Events tab に表示する。

右側の Inspector は、timeline の命令セルや event marker をクリックしたときに、その cycle・その命令の説明、hazard 理由、flush 理由、retire、RAM diff、error を表示する領域にする。Registers tab は `x0` から `x31` まで順番固定で表示し、現在 cycle で changed な register だけを控えめに強調する。Memory tab は RAM state と current cycle の RAM diff を表示する。

ユーザーはエディタを自由に編集できる。実行中または実行済みのプログラムが編集された場合は、現在の simulation を invalidated として扱い、再assemble/reset が必要であることを UI で明示する。編集内容を暗黙に実行途中へ差し替えない。

UI 上の説明は短いラベル、tooltip、inspector の event marker 説明に寄せる。error、hazard、stall、flush の理由は、ユーザーが該当セルや event marker を選んだときに理解できる粒度で表示する。

見た目は密度の高い開発ツールとして整える。toolbar は program management と実行操作、中央上は pipeline observation、中央下は source editing、右は state/detail inspection という役割分担を明確にし、装飾的なカードや大きなヒーロー表現は使わない。ペイン幅は安定した最小幅を持たせ、CodeMirror と timeline が同時に潰れないようにする。

## Completion Conditions

- TypeScript + Vite + React のアプリとして起動でき、core、CLI、React UI が同じ TypeScript の assembler/simulator を共有している。
- CodeMirror 6 ベースのアセンブリエディタで、RV32I アセンブリを編集でき、構文エラーや assemble エラーがユーザーに分かる形で表示される。
- Program Library で複数プログラムを作成、複製、リネーム、選択でき、初期サンプルが通常プログラムの一つとして扱われる。
- core の simulator が `docs/rask-spec.md` に準拠している。
- CLI から短い assembly source を assemble し、step 実行し、各 cycle の state と retire log / pipeline trace を確認できる。
- React UI の中央領域で、横軸 cycle・縦軸 dynamic instruction の pipeline timeline を確認でき、stage、stall、flush、retire、memory、branch、error の event marker が視覚的に区別できる。
- 現在 cycle の stage board、実行 toolbar、Reset / Back / Step が UI 上で機能する。
- timeline の命令セルや event marker を選択すると、Inspector にその cycle・命令の説明、hazard 理由、flush 理由、retire、RAM diff、error が表示される。Registers と Memory は右 dock の別 tab で確認できる。
- 実行中または実行済みのプログラムを編集した場合、simulation が invalidated として扱われ、再assemble/reset が必要であることが UI で分かる。
- デスクトップまたは横長タブレット相当の画面で、toolbar の Program Library dropdown、bottom drawer、right dock、timeline、inspector、log が重なったり潰れたりせず、timeline は横スクロールや表示 window で破綻せずに閲覧できる。
- right dock と bottom drawer の resize、close/open、rail からの復帰、localStorage layout 復元が UI 上で機能する。
- Vitest で命令意味論、assembler、pipeline state transition、hazard/stall/flush/retire/memory/error の代表ケースが検証されている。
- React Testing Library または Playwright で、プログラム選択、編集、assemble、step 実行、timeline 選択、inspector 表示の主要フローが検証されている。
