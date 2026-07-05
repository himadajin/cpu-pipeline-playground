import clsx from "clsx";
import { X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { toHex32, toInt32 } from "../../core";
import type { CycleSnapshot, Instruction, PipelineEvent } from "../../core";
import type { RegisterNameStyle, RightTab } from "../hooks/useWorkbenchLayout";
import { registerName } from "../registerNames";
import { EventList } from "./EventList";
import { TabButton } from "./TabButton";

export function RightDock({
  activeTab,
  open,
  onTabChange,
  onOpenChange,
  onResizeStart,
  registerNames,
  onRegisterNamesChange,
  selectedInstruction,
  selectedSnapshot,
  selectedTimelineCell,
  selectedEvents,
  stateSnapshot,
}: {
  activeTab: RightTab;
  open: boolean;
  onTabChange: (tab: RightTab) => void;
  onOpenChange: (open: boolean) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  registerNames: RegisterNameStyle;
  onRegisterNamesChange: (style: RegisterNameStyle) => void;
  selectedInstruction: Instruction | null | undefined;
  selectedSnapshot: CycleSnapshot | undefined;
  selectedTimelineCell: CycleSnapshot["timeline"][number] | null;
  selectedEvents: PipelineEvent[];
  /** Snapshot shown by the Registers / Memory tabs: always the cursor cycle. */
  stateSnapshot: CycleSnapshot;
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
      <button
        className="resize-handle right-resizer"
        type="button"
        aria-label="Resize right dock"
        onPointerDown={onResizeStart}
      />
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
        <div className="header-status">
          {activeTab === "registers" && (
            <div className="name-toggle" role="group" aria-label="Register name style">
              <button
                className={clsx("name-toggle-option", registerNames === "numeric" && "active")}
                type="button"
                aria-pressed={registerNames === "numeric"}
                onClick={() => onRegisterNamesChange("numeric")}
              >
                x5
              </button>
              <button
                className={clsx("name-toggle-option", registerNames === "abi" && "active")}
                type="button"
                aria-pressed={registerNames === "abi"}
                onClick={() => onRegisterNamesChange("abi")}
              >
                t0
              </button>
            </div>
          )}
          <button
            className="panel-close-button"
            type="button"
            aria-label="Close right dock"
            onClick={() => onOpenChange(false)}
          >
            <X size={13} />
          </button>
        </div>
      </div>
      <div className="dock-body">
        {activeTab === "inspector" && (
          <InspectorPanel
            selectedInstruction={selectedInstruction}
            selectedSnapshot={selectedSnapshot}
            selectedTimelineCell={selectedTimelineCell}
            selectedEvents={selectedEvents}
          />
        )}
        {activeTab === "registers" && <RegistersPanel snapshot={stateSnapshot} nameStyle={registerNames} />}
        {activeTab === "memory" && <MemoryPanel snapshot={stateSnapshot} />}
      </div>
    </section>
  );
}

function InspectorPanel({
  selectedInstruction,
  selectedSnapshot,
  selectedTimelineCell,
  selectedEvents,
}: {
  selectedInstruction: Instruction | null | undefined;
  selectedSnapshot: CycleSnapshot | undefined;
  selectedTimelineCell: CycleSnapshot["timeline"][number] | null;
  selectedEvents: PipelineEvent[];
}) {
  return (
    <section className="inspector-panel">
      {selectedTimelineCell ? (
        <div className="inspector-section">
          <h2>{selectedInstruction?.text ?? `pc 0x${formatHex(selectedTimelineCell.pc)}`}</h2>
          <p className="muted">
            S{selectedTimelineCell.seqId}, {selectedTimelineCell.stage}, cycle {selectedSnapshot?.cycle ?? "-"}
            {selectedInstruction ? `, line ${selectedInstruction.source.line}` : ""}
          </p>
          <EventList
            events={selectedEvents}
            emptyText="No event is attached to this dynamic instruction in the selected cycle."
          />
        </div>
      ) : (
        <p className="muted">Select a timeline cell to inspect stalls, flushes, retires, and diffs.</p>
      )}
    </section>
  );
}

function RegistersPanel({ snapshot, nameStyle }: { snapshot: CycleSnapshot; nameStyle: RegisterNameStyle }) {
  const changedRegisters = new Set<number>(snapshot.registerDiffs.map((diff) => diff.register));

  return (
    <section className="state-panel">
      {/* Always mounted so the grid below never shifts when a write appears. */}
      <div className="state-summary" aria-label="Register writes in this cycle">
        {snapshot.registerDiffs.length > 0
          ? snapshot.registerDiffs.map((diff) => (
              <span className="state-summary-entry" key={diff.register}>
                {registerName(diff.register, nameStyle)} {toHex32(diff.before)} {"->"} {toHex32(diff.after)}
              </span>
            ))
          : `write @ cycle ${snapshot.cycle}: -`}
      </div>
      <div className="register-grid" aria-label="Registers">
        {snapshot.registers.map((value, index) => {
          const changed = changedRegisters.has(index);
          return (
            <div
              className={clsx("register-cell", changed && "changed")}
              key={changed ? `${snapshot.cycle}:${index}` : index}
            >
              <span className="register-name" title={registerName(index, nameStyle === "abi" ? "numeric" : "abi")}>
                {registerName(index, nameStyle)}
              </span>
              <span className="register-value-stack">
                <strong className="register-value">{toHex32(value)}</strong>
                <span className="register-secondary">{toInt32(value)}</span>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MemoryPanel({ snapshot }: { snapshot: CycleSnapshot }) {
  const entries = groupMemoryWords(snapshot.memory);

  return (
    <section className="state-panel">
      {/* Always mounted so the word list below never shifts when a write appears. */}
      <div className="state-summary" aria-label="Memory writes in this cycle">
        {snapshot.memoryDiffs.length > 0 ? (
          snapshot.memoryDiffs.map((diff) => (
            <span className="state-summary-entry" key={diff.address}>
              [{toHex32(diff.address)}]: {formatByte(diff.before)} {"->"} {formatByte(diff.after)}
            </span>
          ))
        ) : (
          <>write @ cycle {snapshot.cycle}: -</>
        )}
      </div>
      <div className="inspector-section">
        <h2>Memory</h2>
        {entries.length === 0 ? (
          <p className="muted">No memory writes yet.</p>
        ) : (
          entries.map(({ address, bytes, value }) => (
            <div className="diff-row" key={address}>
              [{toHex32(address)}] {toHex32(value)}{" "}
              <span className="muted">bytes {bytes.map(formatByte).join(" ")}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function formatByte(value: number): string {
  return `0x${(value & 0xff).toString(16).padStart(2, "0")}`;
}

function formatHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

function groupMemoryWords(memory: Record<number, number>): Array<{ address: number; bytes: number[]; value: number }> {
  const wordAddresses = new Set<number>();
  for (const address of Object.keys(memory).map(Number)) {
    if (Number.isInteger(address)) {
      wordAddresses.add(address - (address % 4));
    }
  }
  return Array.from(wordAddresses)
    .sort((a, b) => a - b)
    .map((address) => {
      const bytes = [0, 1, 2, 3].map((offset) => memory[address + offset] ?? 0);
      const value = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
      return { address, bytes, value };
    });
}
