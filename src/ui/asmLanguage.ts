import { linter, type Diagnostic } from "@codemirror/lint";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { assemble, instructionSet } from "../core";

const opcodes = instructionSet().join("|");

export function assemblyExtensions(onAssembleErrors: (count: number) => void): Extension[] {
  return [
    EditorView.lineWrapping,
    EditorView.theme({
      "&": {
        height: "100%",
        backgroundColor: "#101418",
        color: "#dbe7ef",
      },
      ".cm-content": {
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: "13px",
        lineHeight: "1.55",
      },
      ".cm-gutters": {
        backgroundColor: "#0c1116",
        color: "#6b7a8a",
        borderRight: "1px solid #22303a",
      },
      ".cm-activeLine": { backgroundColor: "#18232c" },
      ".cm-activeLineGutter": { backgroundColor: "#18232c" },
      ".cm-scroller": { overflow: "auto" },
    }),
    linter((view) => {
      const result = assemble(view.state.doc.toString());
      onAssembleErrors(result.errors.length);
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
    EditorView.updateListener.of((update) => {
      if (!update.docChanged) return;
      const text = update.state.doc.toString();
      const lastLine = text.split(/\r?\n/).at(-1) ?? "";
      if (new RegExp(`^\\s*(?:${opcodes})\\b`, "i").test(lastLine)) {
        return;
      }
    }),
  ];
}
