import clsx from "clsx";
import { X } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { toHex32, toInt32 } from "../../core";
import type { CycleSnapshot } from "../../core";
import type { RegisterNameStyle, StateTab } from "../hooks/useWorkbenchLayout";
import { registerName } from "../registerNames";
import { EventList } from "./EventList";
import { TabButton } from "./TabButton";

const STATE_TABS: Array<{ id: StateTab; label: string }> = [
  { id: "registers", label: "Registers" },
  { id: "memory", label: "Memory" },
  { id: "events", label: "Events" },
];

export function StateStrip({
  activeTab,
  open,
  onTabChange,
  onOpenChange,
  onResizeStart,
  registerNames,
  onRegisterNamesChange,
  snapshot,
}: {
  activeTab: StateTab;
  open: boolean;
  onTabChange: (tab: StateTab) => void;
  onOpenChange: (open: boolean) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  registerNames: RegisterNameStyle;
  onRegisterNamesChange: (style: RegisterNameStyle) => void;
  /** Machine state at the cursor cycle; every tab of the strip reads from it. */
  snapshot: CycleSnapshot;
}) {
  if (!open) {
    return (
      <section className="state-rail" aria-label="State strip rail">
        {STATE_TABS.map((tab) => (
          <button
            className={clsx("rail-tab", activeTab === tab.id && "active")}
            type="button"
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            aria-label={`Open ${tab.label}`}
          >
            {tab.label}
          </button>
        ))}
      </section>
    );
  }

  return (
    <section className="state-strip">
      <button
        className="resize-handle state-resizer"
        type="button"
        aria-label="Resize state strip"
        onPointerDown={onResizeStart}
      />
      <div className="tab-bar">
        <div className="tab-list" role="tablist" aria-label="State strip">
          {STATE_TABS.map((tab) => (
            <TabButton id={tab.id} key={tab.id} active={activeTab === tab.id} onSelect={onTabChange}>
              {tab.label}
            </TabButton>
          ))}
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
            aria-label="Close state strip"
            onClick={() => onOpenChange(false)}
          >
            <X size={13} />
          </button>
        </div>
      </div>
      <div className="state-body">
        {activeTab === "registers" && <RegistersPanel snapshot={snapshot} nameStyle={registerNames} />}
        {activeTab === "memory" && <MemoryPanel snapshot={snapshot} />}
        {activeTab === "events" && <EventList events={snapshot.events} emptyText="No events in this cycle." />}
      </div>
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
              <strong className="register-value">{toHex32(value)}</strong>
              <span className="register-secondary">{toInt32(value)}</span>
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
      {entries.length === 0 ? (
        <p className="muted">No memory writes yet.</p>
      ) : (
        entries.map(({ address, bytes, value }) => (
          <div className="diff-row" key={address}>
            [{toHex32(address)}] {toHex32(value)} <span className="muted">bytes {bytes.map(formatByte).join(" ")}</span>
          </div>
        ))
      )}
    </section>
  );
}

function formatByte(value: number): string {
  return `0x${(value & 0xff).toString(16).padStart(2, "0")}`;
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
