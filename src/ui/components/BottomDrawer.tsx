import CodeMirror from "@uiw/react-codemirror";
import type { Extension } from "@codemirror/state";
import clsx from "clsx";
import { X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { CycleSnapshot, SelectedCell } from "../../core";
import type { BottomTab } from "../hooks/useWorkbenchLayout";
import { EventList } from "./EventList";
import { TabButton } from "./TabButton";

export function BottomDrawer({
  activeTab,
  open,
  onTabChange,
  onOpenChange,
  onResizeStart,
  snapshot,
  selectedCell,
  invalidated,
  lintCount,
  source,
  editorExtensions,
  onSourceChange,
}: {
  activeTab: BottomTab;
  open: boolean;
  onTabChange: (tab: BottomTab) => void;
  onOpenChange: (open: boolean) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  snapshot: CycleSnapshot;
  selectedCell: SelectedCell | null;
  invalidated: boolean;
  lintCount: number;
  source: string;
  editorExtensions: Extension[];
  onSourceChange: (value: string) => void;
}) {
  if (!open) {
    return (
      <section className="bottom-rail" aria-label="Bottom drawer rail">
        <button
          className={clsx("rail-tab", activeTab === "assembly" && "active")}
          type="button"
          onClick={() => onTabChange("assembly")}
          aria-label="Open Assembly"
        >
          Assembly
        </button>
        <button
          className={clsx("rail-tab", activeTab === "events" && "active")}
          type="button"
          onClick={() => onTabChange("events")}
          aria-label="Open Events"
        >
          Events
        </button>
      </section>
    );
  }

  return (
    <section className="bottom-drawer">
      <button
        className="resize-handle bottom-resizer"
        type="button"
        aria-label="Resize bottom drawer"
        onPointerDown={onResizeStart}
      />
      <div className="tab-bar">
        <div className="tab-list" role="tablist" aria-label="Bottom drawer">
          <TabButton id="assembly" active={activeTab === "assembly"} onSelect={onTabChange}>
            Assembly
          </TabButton>
          <TabButton id="events" active={activeTab === "events"} onSelect={onTabChange}>
            Events
          </TabButton>
        </div>
        <div className="header-status">
          {activeTab === "assembly" && invalidated && <span className="mini-status warn">modified after run</span>}
          {activeTab === "assembly" && (
            <span className={clsx("mini-status", lintCount > 0 && "bad")}>{lintCount} errors</span>
          )}
          {activeTab === "events" && (
            <span className="mini-status">
              {selectedCell ? `selected cycle ${snapshot.cycle}` : `cycle ${snapshot.cycle}`}
            </span>
          )}
          <button
            className="panel-close-button"
            type="button"
            aria-label="Close bottom drawer"
            onClick={() => onOpenChange(false)}
          >
            <X size={13} />
          </button>
        </div>
      </div>
      <div className="drawer-body">
        {activeTab === "assembly" ? (
          <CodeMirror
            value={source}
            height="100%"
            basicSetup={{ foldGutter: false, highlightActiveLine: true }}
            extensions={editorExtensions}
            onChange={onSourceChange}
          />
        ) : (
          <EventList events={snapshot.events} emptyText="No events in this cycle." />
        )}
      </div>
    </section>
  );
}
