import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";
import { assemblyExtensions } from "../asmLanguage";

export function AssemblyEditor({
  source,
  onSourceChange,
}: {
  source: string;
  onSourceChange: (value: string) => void;
}) {
  const editorExtensions = useMemo(
    () => [...assemblyExtensions(), EditorView.contentAttributes.of({ "aria-label": "Assembly source" })],
    [],
  );

  return (
    <CodeMirror
      value={source}
      height="100%"
      basicSetup={{ foldGutter: false, highlightActiveLine: true }}
      extensions={editorExtensions}
      onChange={onSourceChange}
    />
  );
}
