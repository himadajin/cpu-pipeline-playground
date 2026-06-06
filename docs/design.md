# CPU Pipeline Playground

## Purpose

RISC-V風の小さな命令セットを使って、短いアセンブリプログラムを書き、5段 in-order pipeline の実行をステップごとに観察できるブラウザ playground を作る。

中心価値は、説明文を読む教材ではなく、ユーザーが複数の小さなプログラムを管理し、少し編集し、実行し、pipeline timeline・hazard・forwarding・flush・レジスタ/メモリ更新の変化を即座に見られることにある。実在CPUや完全なRISC-V互換の再現ではなく、単純に定義されたCPU仕様に対して、core と画面に見える状態が正しいことを重視する。

## Context

このリポジトリは現時点で `docs/desire.md` のみがある未実装状態であり、実装基盤は新規に作る。技術基盤は TypeScript + Vite + React とし、同じ TypeScript core を CLI、テスト、React UI から共有する。

アセンブリエディタには CodeMirror 6 を使う。独自のRISC-V風アセンブリ用 language support、エラー診断、行番号、現在実行行ハイライト、選択命令と timeline の連動を実装できることを前提にする。

UI は Tailwind CSS、Radix UI Primitives、lucide-react を使って作る。Tailwind で密度あるツールUIの見た目を細かく制御し、Radix UI Primitives は dialog、select、tabs、tooltip などのアクセシブルな挙動を借りるために使う。既製の大きな見た目を持ち込むコンポーネントライブラリには寄せない。

テスト基盤は Vitest、React Testing Library、Playwright とする。core の命令意味論、assembler、pipeline 状態遷移は Vitest で検証し、React部品の基本的な表示や操作は React Testing Library で検証し、エディタ・timeline・実行操作を含むブラウザ上の主要フローは Playwright で確認する。

初期CPUモデルは5段の in-order pipeline とする。stage は IF / ID / EX / MEM / WB を基本にし、依存による stall、forwarding、branch flush、レジスタやメモリ更新タイミングを観察できるようにする。out-of-order 実行、rename、ROB、reservation station、OS、例外、割り込み、キャッシュ、実在ABI、完全なRISC-V互換は初期範囲に含めない。

初期命令セットは、観察しやすさと小さなプログラムを書ける実用性の両方を満たすRISC-V風サブセットにする。少なくとも `add`、`sub`、`addi`、`lw`、`sw`、`beq`、`bne`、`blt`、`jal`、`nop`、`and`、`or`、`xor`、`sll`、`srl` を扱う。`mul`、`div`、完全なRISC-V疑似命令、可変latency命令は初期完成条件に含めない。

初期UIの対象はデスクトップまたは横長タブレット以上に限定する。スマートフォン幅で同じ情報密度を保つことは初期完成条件にしない。画面破綻を避けるため、プログラムサイズ、実行履歴、表示cycle数には初期上限を設けてよい。目安として、100行程度のプログラムと300cycle程度の履歴を快適に扱えることを優先する。

## Direction

実装は core を中心に置く。CPU、assembler、simulator はUI非依存の TypeScript module として設計し、CLI でも同じプログラムを assemble し、step実行し、状態とログを確認できるようにする。GUI は core の状態遷移と実行ログを視覚化する層であり、GUIの見た目から core の状態構造を決めない。

画面は教材ページではなく、IDE風の固定ワークベンチとして設計する。上部に薄い toolbar を置き、実行状態、cycle、Run、Step、Back、Reset、autoplay速度を表示する。左ペインは Program Library の縦リストに集中させ、中央ペインは上側に pipeline timeline を中心とした観察領域、下側に CodeMirror editor を置く。右ペインは inspector とし、下部ログは常時大きく表示せず、event strip または折りたたみ可能な panel として扱う。

Program Library は中核機能として扱う。複数のアセンブリプログラムを作成、複製、リネーム、選択できるようにし、サンプルプログラムは専用機能ではなく初期データとして入っている通常のプログラムの一つにする。初期保存先は browser localStorage 程度でよく、core は保存方式に依存しない。

pipeline の主表示は、横軸を cycle、縦軸を命令にした timeline table にする。現在cycleの IF / ID / EX / MEM / WB だけを見せる stage board は補助表示として扱う。timeline は横スクロール可能にし、現在cycle周辺を見やすくする。timeline の命令ラベルは editor と重複しないよう行番号と opcode を中心に圧縮し、フル命令文は inspector や tooltip で確認できるようにする。無制限にすべてを一画面へ詰め込まず、表示window、スクロール、折りたたみで密度を制御する。

timeline の各セルには stage 名だけでなく、`stall`、`flush`、`forward`、`commit` などのイベントを色と短いラベルで重ねて表示する。イベントの意味は別ログだけに逃がさず、どの命令のどのcycleで何が起きたかを timeline 上で追えるようにする。

右側の inspector は、常に全情報を並べる一覧ではなく、timeline の命令セルやイベントをクリックしたときに、そのcycle・その命令の説明、hazard理由、forwarding元、レジスタ/メモリ差分を表示する領域にする。レジスタ一覧やメモリ一覧は必要だが、因果関係を深掘りする inspector 体験を優先する。

ユーザーはエディタを自由に編集できる。実行中または実行済みのプログラムが編集された場合は、現在の simulation を invalidated として扱い、再assemble/reset が必要であることをUIで明示する。編集内容を暗黙に実行途中へ差し替えない。

UI上の説明は短いラベル、tooltip、inspector のイベント説明に寄せる。長いチュートリアルや教材本文を前面に置かず、触って観察する体験を主役にする。ただし、エラー、hazard、forwarding、flush の理由は、ユーザーが該当セルやイベントを選んだときに理解できる粒度で表示する。

見た目は密度の高い開発ツールとして整える。左は program navigation、中央上は pipeline observation、中央下は source editing、右は state/detail inspection という役割分担を明確にし、装飾的なカードや大きなヒーロー表現は使わない。ペイン幅は安定した最小幅とリサイズまたは折りたたみを持たせ、CodeMirror と timeline が同時に潰れないようにする。

## Completion Conditions

- TypeScript + Vite + React のアプリとして起動でき、core、CLI、React UI が同じ TypeScript の assembler/simulator を共有している。
- CodeMirror 6 ベースのアセンブリエディタで、RISC-V風アセンブリを編集でき、構文エラーやassembleエラーがユーザーに分かる形で表示される。
- Program Library で複数プログラムを作成、複製、リネーム、選択でき、初期サンプルが通常プログラムの一つとして扱われる。
- 初期命令セット `add`、`sub`、`addi`、`lw`、`sw`、`beq`、`bne`、`blt`、`jal`、`nop`、`and`、`or`、`xor`、`sll`、`srl` を assemble して実行できる。
- 5段 in-order pipeline の step実行で、IF / ID / EX / MEM / WB、stall、forwarding、branch flush、commit、レジスタ更新、メモリ更新が core の状態として表現される。
- CLI から短いアセンブリプログラムを assemble し、step実行し、各cycleの状態とイベントログを確認できる。
- React UI の中央領域で、横軸cycle・縦軸命令の pipeline timeline を確認でき、stage、stall、flush、forward、commit のイベントが視覚的に区別できる。
- 現在cycleの stage board、実行toolbar、Run / Step / Back / Reset、autoplay速度調整がUI上で機能する。
- timeline の命令セルやイベントを選択すると、inspector にそのcycle・命令の説明、hazard理由、forwarding元、レジスタ/メモリ差分が表示される。
- 実行中または実行済みのプログラムを編集した場合、simulation が invalidated として扱われ、再assemble/reset が必要であることがUIで分かる。
- デスクトップまたは横長タブレット相当の画面で、Program Library、editor、timeline、inspector、log が重なったり潰れたりせず、timeline は横スクロールや表示windowで破綻せずに閲覧できる。
- Vitest で命令意味論、assembler、pipeline 状態遷移、hazard/stall/flush/forwarding の代表ケースが検証されている。
- React Testing Library または Playwright で、プログラム選択、編集、assemble、step実行、timeline選択、inspector表示の主要フローが検証されている。
