import clsx from "clsx";
import { X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { CycleSnapshot, Instruction, PipelineEvent } from "../../core";
import type { RightTab } from "../hooks/useWorkbenchLayout";
import { EventList } from "./EventList";
import { TabButton } from "./TabButton";

export function RightDock({
  activeTab,
  open,
  onTabChange,
  onOpenChange,
  onResizeStart,
  selectedInstruction,
  selectedSnapshot,
  selectedEvents,
  current,
}: {
  activeTab: RightTab;
  open: boolean;
  onTabChange: (tab: RightTab) => void;
  onOpenChange: (open: boolean) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  selectedInstruction: Instruction | null | undefined;
  selectedSnapshot: CycleSnapshot | undefined;
  selectedEvents: PipelineEvent[];
  current: CycleSnapshot;
}) {
  if (!open) {
    return (
      <section className="right-rail" aria-label="Right dock rail">
        <button
          className={clsx("rail-tab vertical", activeTab === "inspector" && "active")}
          type="button"
          onClick={() => onTabChange("inspector")}
          aria-label="Open Inspector"
        >
          Inspector
        </button>
        <button
          className={clsx("rail-tab vertical", activeTab === "registers" && "active")}
          type="button"
          onClick={() => onTabChange("registers")}
          aria-label="Open Registers"
        >
          Registers
        </button>
        <button
          className={clsx("rail-tab vertical", activeTab === "memory" && "active")}
          type="button"
          onClick={() => onTabChange("memory")}
          aria-label="Open Memory"
        >
          Memory
        </button>
      </section>
    );
  }

  return (
    <section className="right-dock">
      <button className="resize-handle right-resizer" type="button" aria-label="Resize right dock" onPointerDown={onResizeStart} />
      <div className="tab-bar">
        <div className="tab-list" role="tablist" aria-label="Inspector dock">
          <TabButton id="inspector" active={activeTab === "inspector"} onSelect={onTabChange}>
            Inspector
          </TabButton>
          <TabButton id="registers" active={activeTab === "registers"} onSelect={onTabChange}>
            Registers
          </TabButton>
          <TabButton id="memory" active={activeTab === "memory"} onSelect={onTabChange}>
            Memory
          </TabButton>
        </div>
        <button className="panel-close-button" type="button" aria-label="Close right dock" onClick={() => onOpenChange(false)}>
          <X size={13} />
        </button>
      </div>
      <div className="dock-body">
        {activeTab === "inspector" && (
          <InspectorPanel
            selectedInstruction={selectedInstruction}
            selectedSnapshot={selectedSnapshot}
            selectedEvents={selectedEvents}
          />
        )}
        {activeTab === "registers" && <RegistersPanel current={current} />}
        {activeTab === "memory" && <MemoryPanel current={current} />}
      </div>
    </section>
  );
}

function InspectorPanel({
  selectedInstruction,
  selectedSnapshot,
  selectedEvents,
}: {
  selectedInstruction: Instruction | null | undefined;
  selectedSnapshot: CycleSnapshot | undefined;
  selectedEvents: PipelineEvent[];
}) {
  return (
    <section className="inspector-panel">
      {selectedInstruction ? (
        <div className="inspector-section">
          <h2>{selectedInstruction.text}</h2>
          <p className="muted">
            line {selectedInstruction.source.line}, cycle {selectedSnapshot?.cycle ?? "-"}
          </p>
          <EventList events={selectedEvents} emptyText="No event is attached to this instruction in the selected cycle." />
        </div>
      ) : (
        <p className="muted">Select a timeline cell to inspect hazards, forwarding, flushes, and diffs.</p>
      )}
    </section>
  );
}

function RegistersPanel({ current }: { current: CycleSnapshot }) {
  const changedRegisters = new Set(current.registerDiffs.map((diff) => diff.register));

  return (
    <section className="state-panel">
      {current.registerDiffs.length > 0 && (
        <div className="inspector-section">
          <h2>Register Diffs</h2>
          {current.registerDiffs.map((diff) => (
            <div className="diff-row" key={diff.register}>
              x{diff.register}: {diff.before} {"->"} {diff.after}
            </div>
          ))}
        </div>
      )}
      <div className="register-grid" aria-label="Registers">
        {current.registers.map((value, index) => (
          <div className={clsx("register-cell", changedRegisters.has(index) && "changed")} key={index}>
            <span className="register-name">x{index}</span>
            <strong className="register-value">{value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function MemoryPanel({ current }: { current: CycleSnapshot }) {
  const entries = Object.entries(current.memory);

  return (
    <section className="state-panel">
      {current.memoryDiffs.length > 0 && (
        <div className="inspector-section">
          <h2>Memory Diffs</h2>
          {current.memoryDiffs.map((diff) => (
            <div className="diff-row" key={diff.address}>
              [{diff.address}]: {diff.before} {"->"} {diff.after}
            </div>
          ))}
        </div>
      )}
      <div className="inspector-section">
        <h2>Memory</h2>
        {entries.length === 0 ? (
          <p className="muted">No memory writes yet.</p>
        ) : (
          entries.map(([address, value]) => (
            <div className="diff-row" key={address}>
              [{address}] = {value}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
