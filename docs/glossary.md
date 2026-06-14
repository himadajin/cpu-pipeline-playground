# Glossary

この文書は、`docs/` 以下で使う用語のうち、読み手の解釈が割れると仕様理解や実装判断が壊れるものだけを定義する。CPU 動作、timing、format grammar、MMIO address などの詳細仕様は `docs/rask-spec.md` に置き、この文書では重複して定義しない。

**address space**
- Definition: `rask` が instruction fetch、load、store の対象として解釈するアドレス全体の概念。RAM と MMIO device register を含む。
- Use when: RAM と MMIO device register をまとめて扱う範囲を指すとき。
- Do not use for: RAM だけを指す場合。

**architectural state**
- Definition: program から観測可能な CPU state。`rask` では PC、整数レジスタ、RAM を指す。
- Use when: instruction の意味論や ISS / QEMU との機能比較で観測する状態を指す場合。
- Do not use for: pipeline latch、stall、flush、event marker など pipeline 内部の状態。

**assembly source**
- Definition: user または test fixture が書く assembler への入力テキスト。
- Use when: assemble 前の program text 全体を指す場合。
- Do not use for: assemble 後の real instruction 列。

**bubble**
- Definition: valid dynamic instruction が存在しない pipeline slot。
- Use when: stall や flush の結果として pipeline latch / stage が空であることを指す場合。
- Do not use for: program 中の実 NOP。`addi x0, x0, 0` や `fence` とは区別する。

**comparator**
- Definition: 複数の producer が出した normalized output を比較し、一致・不一致を判定する tool。
- Use when: QEMU producer と simulator producer の observable state signature を比較する処理を指す場合。
- Do not use for: expected output を生成する参照元。その場合は `oracle` を使う。

**device register**
- Definition: address space 上に配置された、環境との入出力境界として振る舞う MMIO register。
- Use when: UART や exit device のような memory-mapped device の register を指す場合。
- Do not use for: 通常の RAM byte や CPU integer register。

**device side effect**
- Definition: device register への有効な access により、RAM / register state 以外へ発生する観測可能な作用。
- Use when: UART output や exitRequest のような MMIO access の外部作用を指す場合。
- Do not use for: RAM write や integer register write。

**dynamic instruction**
- Definition: 実行時に fetch され、`seqId` を割り当てられた real instruction instance。
- Use when: pipeline occupancy table、pipeline trace、flush された命令を含む実行時 instance を指す場合。
- Do not use for: assembly source 上の静的な命令記述。

**error**
- Definition: `rask` 仕様に違反する状態や命令を検出し、最終的に error report と error termination につながる状態。
- Use when: 未定義命令、ミスアラインアクセス、未マップアクセスなどの仕様違反を扱う場合。
- Do not use for: program が exit device で正常終了する場合や、`ebreak` による pause。

**event marker**
- Definition: UI 上で cycle や instruction に付与される、stall、flush、retire、memory、branch、error などの小さな marker。
- Use when: timeline cell、Inspector、Events tab が参照する UI-side marker を指す場合。
- Do not use for: core が出す structured trace の正式な出力項目全体。

**exit**
- Definition: program が exit device を通じて正常に simulation を終了すること。
- Use when: program が明示的に終了コードを出して実行を終える場合。
- Do not use for: error condition による終了や、`ebreak` による pause。

**fence**
- Definition: `rask` では side effect を持たず、pipeline 上では NOP-equivalent real instruction として retire する RV32I instruction。
- Use when: RV32I の `fence` instruction を `rask` で扱う場合。
- Do not use for: pipeline bubble や simulator 停止。

**fixture**
- Definition: reference test の入力となる小さな assembly source と、その test 固有の設定。
- Use when: QEMU producer と simulator producer の両方が読む test case を指す場合。
- Do not use for: QEMU harness や生成された ELF / signature output。

**flush**
- Definition: 間違ったパスで fetch / decode された dynamic instruction を pipeline から取り除くこと。
- Use when: redirect によって IF/ID や ID/EX の命令を bubble にする場合。
- Do not use for: data hazard により pipeline を待たせること。その場合は `stall` を使う。

**golden**
- Definition: テストで比較するために repo に固定保存された expected output。
- Use when: retire log や pipeline occupancy table の期待出力ファイルを指す場合。
- Do not use for: 期待値の根拠や参照実装。その場合は `oracle` を使う。

**harness**
- Definition: fixture を QEMU 上で実行できる bare-metal program に包む周辺コード。
- Use when: 起動、linker script、終了処理、signature 書き出しなど、fixture の外側にある QEMU 実行用コードを指す場合。
- Do not use for: test の本体である assembly source 断片。

**manifest**
- Definition: fixture ごとの差分設定を記述する metadata file。
- Use when: 比較対象、初期状態、test 固有の観測設定などを小さく指定する場合。
- Do not use for: instruction semantics や pipeline timing の仕様。

**observable state signature**
- Definition: QEMU と simulator の機能比較のために、観測対象の final state を正規化した text output。
- Use when: reference testing で register、RAM、console output、exit code などの比較対象を表す出力を指す場合。
- Do not use for: pipeline timing、retire log、pipeline occupancy table。

**oracle**
- Definition: expected behavior や expected output を決める参照元。QEMU、`docs/rask-spec.md`、手計算した pipeline occupancy など、比較の根拠になるもの。
- Use when: 期待値を生成または正当化する authority を指す場合。
- Do not use for: repo に固定保存された期待出力ファイル。その場合は `golden` を使う。

**pause**
- Definition: `ebreak` の retire により simulator の実行を一時停止すること。
- Use when: 対話的な実行制御として停止し、後続実行が可能な状態を指す場合。
- Do not use for: 正常終了の `exit` や異常終了の `error`。

**PC / pc**
- Definition: `PC` は architectural register としての program counter、`pc` は data field、log grammar、object key としての program counter を指す表記。
- Use when: 本文中の CPU state を指す場合は `PC`、structured data の field name を指す場合は `pc` を使う。
- Do not use for: 大文字小文字を任意に揺らす表記。

**pipeline occupancy table**
- Definition: 各 dynamic instruction が各 cycle にどの pipeline stage にいたかを表す verification output。
- Use when: timing verification や、手計算した expected pipeline timing と比較する表形式 output を指す場合。
- Do not use for: UI 上の表示そのもの。その場合は `timeline` または `pipeline timeline` を使う。

**pipeline state**
- Definition: pipeline latch、bubble、stall、flush、redirect、stage occupancy など、cycle ごとの pipeline 内部状態。
- Use when: timing、可視化、pipeline occupancy table、pipeline trace に関わる状態を指す場合。
- Do not use for: program から見える PC、register、RAM の最終状態。

**pipeline trace**
- Definition: cycle ごとの pipeline state や event marker を structured data として記録した時系列データ。
- Use when: UI や CLI が pipeline の時間変化を表示・検査するための structured output を指す場合。
- Do not use for: 人間が読む text output。その場合は `log` または具体的な `retire log` を使う。

**producer**
- Definition: fixture を実行または解釈し、normalized output を生成する tool。
- Use when: QEMU 側または simulator 側で observable state signature を出す処理を指す場合。
- Do not use for: producer 出力同士を比較する処理。その場合は `comparator` を使う。

**pseudo-instruction**
- Definition: assembler が受け付け、1 個以上の real instruction に展開する convenience notation。
- Use when: assembler 入力側の表記と展開規則を扱う場合。
- Do not use for: simulator が実行する命令。

**real instruction**
- Definition: RV32I の実命令として simulator が実行する instruction。
- Use when: assemble 後の pipeline、simulation、retire log に現れる命令を指す場合。
- Do not use for: assembler convenience としての pseudo-instruction。

**redirect**
- Definition: EX で決まった taken branch、JAL、JALR により、次に fetch する PC を変更する pipeline control。
- Use when: PC 更新と、それに伴う IF/ID・ID/EX の flush を引き起こす制御を指す場合。
- Do not use for: branch / jump 命令そのもの。

**retire**
- Definition: 命令が WB で architectural execution 上の完了点に到達すること。register write、retire log への記録、exit / error / pause の確定は retire 処理で扱う。
- Use when: program order で命令が完了し、architectural execution に現れることを指す場合。
- Do not use for: cycle 末尾に next state を current state へ反映すること。その場合は `state update` を使う。

**retire log**
- Definition: architectural execution を program order で記録する text output。instruction retire record と terminal record からなる。
- Use when: WB で retire した命令と最終状態の記録を指す場合。
- Do not use for: cycle ごとの pipeline state や、フラッシュされた dynamic instruction の記録。

**seqId**
- Definition: fetch が完了した dynamic instruction に割り当てる 0-origin の識別子。flush された instruction の ID は再利用しない。
- Use when: pipeline occupancy table、pipeline trace、UI selection で dynamic instruction instance を識別する場合。
- Do not use for: assembly source 上の命令番号や source line number。

**source line**
- Definition: assembly source 内の 1 行。
- Use when: diagnostics、editor highlight、pseudo-instruction の展開元を説明する場合。
- Do not use for: assemble 後の 1 命令。pseudo-instruction は複数の real instruction に展開されることがある。

**stall**
- Definition: data hazard などにより、PC と IF/ID を凍結し、pipeline の進行を一時的に待たせること。
- Use when: instruction を破棄せず、依存解決まで同じ状態を保持する場合。
- Do not use for: 間違ったパスの命令を取り除くこと。その場合は `flush` を使う。

**state update**
- Definition: 1 cycle の state transition の最後に、計算済みの next state を current state として反映すること。
- Use when: simulator 内部の cycle 境界で state が更新される処理を指す場合。
- Do not use for: WB で命令が architectural execution 上完了すること。その場合は `retire` を使う。
