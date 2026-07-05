import { X } from "lucide-react";
import { lazy, Suspense, type PointerEvent as ReactPointerEvent } from "react";
import type { ExecutedLine } from "../asmLanguage";
import { pluralize } from "../format";

const AssemblyEditor = lazy(() => import("./AssemblyEditor").then((module) => ({ default: module.AssemblyEditor })));

export function CodePane({
  open,
  onOpenChange,
  onResizeStart,
  invalidated,
  lintCount,
  source,
  executedLines,
  onSourceChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  invalidated: boolean;
  lintCount: number;
  source: string;
  executedLines: ExecutedLine[];
  onSourceChange: (value: string) => void;
}) {
  if (!open) {
    return (
      <section className="code-rail" aria-label="Code rail">
        <button className="rail-tab vertical" type="button" onClick={() => onOpenChange(true)} aria-label="Open Code">
          Code
        </button>
      </section>
    );
  }

  return (
    <section className="code-pane">
      <button
        className="resize-handle code-resizer"
        type="button"
        aria-label="Resize code pane"
        onPointerDown={onResizeStart}
      />
      <div className="pane-cap">
        <span className="pane-title">Code</span>
        <div className="header-status">
          {invalidated && <span className="mini-status warn">modified after run</span>}
          {lintCount > 0 && <span className="mini-status bad">{pluralize(lintCount, "error")}</span>}
          <button
            className="panel-close-button"
            type="button"
            aria-label="Close code pane"
            onClick={() => onOpenChange(false)}
          >
            <X size={13} />
          </button>
        </div>
      </div>
      <div className="code-body">
        <Suspense
          fallback={
            <div className="editor-loading" role="status">
              Loading editor...
            </div>
          }
        >
          <AssemblyEditor source={source} executedLines={executedLines} onSourceChange={onSourceChange} />
        </Suspense>
      </div>
    </section>
  );
}
