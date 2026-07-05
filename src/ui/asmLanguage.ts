import { linter, type Diagnostic } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { assemble } from "../core";

export function assemblyExtensions(): Extension[] {
  return [
    EditorView.lineWrapping,
    EditorView.theme({
      "&": {
        height: "100%",
        backgroundColor: "var(--panel)",
        color: "var(--text)",
      },
      ".cm-content": {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: "13px",
        lineHeight: "1.55",
      },
      ".cm-gutters": {
        backgroundColor: "var(--surface)",
        color: "var(--text-soft)",
        borderRight: "1px solid var(--border)",
      },
      ".cm-activeLine": { backgroundColor: "var(--accent-bg)" },
      ".cm-activeLineGutter": { backgroundColor: "var(--accent-bg)", color: "var(--accent-text)" },
      ".cm-scroller": { overflow: "auto" },
    }),
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
