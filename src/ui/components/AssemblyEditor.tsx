import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef } from "react";
import { assemblyExtensions, setExecutedLines, type ExecutedLine } from "../asmLanguage";

export function AssemblyEditor({
  source,
  executedLines,
  onSourceChange,
}: {
  source: string;
  /** Lines occupied by in-flight instructions at the cursor cycle, tinted per stage. */
  executedLines: ExecutedLine[];
  onSourceChange: (value: string) => void;
}) {
  const viewRef = useRef<EditorView | null>(null);
  const editorExtensions = useMemo(
    () => [...assemblyExtensions(), EditorView.contentAttributes.of({ "aria-label": "Assembly source" })],
    [],
  );

  useEffect(() => {
    viewRef.current?.dispatch({ effects: setExecutedLines.of(executedLines) });
  }, [executedLines]);

  return (
    <CodeMirror
      value={source}
      height="100%"
      basicSetup={{ foldGutter: false, highlightActiveLine: true }}
      extensions={editorExtensions}
      onChange={onSourceChange}
      onCreateEditor={(view) => {
        viewRef.current = view;
        view.dispatch({ effects: setExecutedLines.of(executedLines) });
      }}
    />
  );
}
