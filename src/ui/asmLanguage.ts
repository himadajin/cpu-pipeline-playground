import { linter, type Diagnostic } from "@codemirror/lint";
import { StateEffect, StateField, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { assemble, type StageName } from "../core";

export interface ExecutedLine {
  line: number;
  stage: StageName;
}

/** Replaces the set of source lines tinted by the stage executing them. */
export const setExecutedLines = StateEffect.define<ExecutedLine[]>();

const executedLinesField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    decorations = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setExecutedLines)) continue;
      const ranges: Range<Decoration>[] = [];
      for (const { line, stage } of effect.value) {
        if (line < 1 || line > transaction.state.doc.lines) continue;
        const from = transaction.state.doc.line(line).from;
        ranges.push(Decoration.line({ class: `cm-exec-line cm-exec-${stage.toLowerCase()}` }).range(from));
      }
      decorations = Decoration.set(ranges, true);
    }
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function assemblyExtensions(): Extension[] {
  return [
    EditorView.lineWrapping,
    EditorView.theme({
      "&": {
        height: "100%",
        backgroundColor: "var(--panel)",
        color: "var(--ink)",
      },
      ".cm-content": {
        fontFamily: "var(--mono)",
        fontSize: "13px",
        lineHeight: "1.55",
      },
      ".cm-gutters": {
        backgroundColor: "var(--paper)",
        color: "var(--soft)",
        borderRight: "1px solid var(--line)",
        fontFamily: "var(--mono)",
      },
      ".cm-activeLine": { backgroundColor: "var(--hover)" },
      ".cm-activeLineGutter": { backgroundColor: "var(--hover)", color: "var(--ink)" },
      ".cm-scroller": { overflow: "auto" },
      ".cm-exec-if": { backgroundColor: "var(--st-if-tint)" },
      ".cm-exec-id": { backgroundColor: "var(--st-id-tint)" },
      ".cm-exec-ex": { backgroundColor: "var(--st-ex-tint)" },
      ".cm-exec-mem": { backgroundColor: "var(--st-mem-tint)" },
      ".cm-exec-wb": { backgroundColor: "var(--st-wb-tint)" },
    }),
    executedLinesField,
    linter((view) => {
      const result = assemble(view.state.doc.toString());
      return result.errors.map<Diagnostic>((error) => {
        const line = view.state.doc.line(error.line);
        return {
          from: line.from,
          to: line.to,
          severity: "error",
          message: error.message,
        };
      });
    }),
  ];
}
