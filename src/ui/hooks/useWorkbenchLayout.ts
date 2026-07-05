import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";

const LAYOUT_STORAGE_KEY = "cpu-pipeline-playground.layout.v2";
const LEGACY_LAYOUT_STORAGE_KEY = "cpu-pipeline-playground.layout.v1";
const CODE_PANE_MIN_WIDTH = 240;
const CODE_PANE_MAX_WIDTH = 480;
const CODE_RAIL_WIDTH = 36;
const STATE_STRIP_MIN_HEIGHT = 160;
const STATE_STRIP_MAX_HEIGHT = 400;
const STATE_RAIL_HEIGHT = 34;

export type StateTab = "registers" | "memory" | "events";
export type RegisterNameStyle = "numeric" | "abi";

export type WorkbenchLayout = {
  codeOpen: boolean;
  codeWidth: number;
  stateOpen: boolean;
  stateHeight: number;
  stateTab: StateTab;
  registerNames: RegisterNameStyle;
};

const DEFAULT_LAYOUT: WorkbenchLayout = {
  codeOpen: true,
  codeWidth: 300,
  stateOpen: true,
  stateHeight: 240,
  stateTab: "registers",
  registerNames: "numeric",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isStateTab(value: unknown): value is StateTab {
  return value === "registers" || value === "memory" || value === "events";
}

function isRegisterNameStyle(value: unknown): value is RegisterNameStyle {
  return value === "numeric" || value === "abi";
}

/** Carries user preferences over from the pre-Phase-3 layout schema. */
function migrateLegacyLayout(): WorkbenchLayout {
  try {
    const raw = window.localStorage.getItem(LEGACY_LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as { rightTab?: unknown; bottomTab?: unknown; registerNames?: unknown };
    const stateTab = isStateTab(parsed.rightTab)
      ? parsed.rightTab
      : parsed.bottomTab === "events"
        ? "events"
        : DEFAULT_LAYOUT.stateTab;
    return {
      ...DEFAULT_LAYOUT,
      stateTab,
      registerNames: isRegisterNameStyle(parsed.registerNames) ? parsed.registerNames : DEFAULT_LAYOUT.registerNames,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function loadWorkbenchLayout(): WorkbenchLayout {
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return migrateLegacyLayout();
    const parsed = JSON.parse(raw) as Partial<WorkbenchLayout>;
    return {
      codeOpen: typeof parsed.codeOpen === "boolean" ? parsed.codeOpen : DEFAULT_LAYOUT.codeOpen,
      codeWidth:
        typeof parsed.codeWidth === "number"
          ? clamp(parsed.codeWidth, CODE_PANE_MIN_WIDTH, CODE_PANE_MAX_WIDTH)
          : DEFAULT_LAYOUT.codeWidth,
      stateOpen: typeof parsed.stateOpen === "boolean" ? parsed.stateOpen : DEFAULT_LAYOUT.stateOpen,
      stateHeight:
        typeof parsed.stateHeight === "number"
          ? clamp(parsed.stateHeight, STATE_STRIP_MIN_HEIGHT, STATE_STRIP_MAX_HEIGHT)
          : DEFAULT_LAYOUT.stateHeight,
      stateTab: isStateTab(parsed.stateTab) ? parsed.stateTab : DEFAULT_LAYOUT.stateTab,
      registerNames: isRegisterNameStyle(parsed.registerNames) ? parsed.registerNames : DEFAULT_LAYOUT.registerNames,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function saveWorkbenchLayout(layout: WorkbenchLayout) {
  window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}

export function useWorkbenchLayout() {
  const [layout, setLayout] = useState<WorkbenchLayout>(() => loadWorkbenchLayout());

  useEffect(() => saveWorkbenchLayout(layout), [layout]);

  function updateLayout(changes: Partial<WorkbenchLayout>) {
    setLayout((current) => ({ ...current, ...changes }));
  }

  function selectStateTab(tab: StateTab) {
    updateLayout({ stateTab: tab, stateOpen: true });
  }

  function setCodeOpen(open: boolean) {
    updateLayout({ codeOpen: open });
  }

  function setStateOpen(open: boolean) {
    updateLayout({ stateOpen: open });
  }

  function setRegisterNames(style: RegisterNameStyle) {
    updateLayout({ registerNames: style });
  }

  function startCodeResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = layout.codeWidth;
    const handleMove = (moveEvent: PointerEvent) => {
      const nextWidth = clamp(startWidth + (moveEvent.clientX - startX), CODE_PANE_MIN_WIDTH, CODE_PANE_MAX_WIDTH);
      setLayout((current) => ({ ...current, codeOpen: true, codeWidth: nextWidth }));
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function startStateResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = layout.stateHeight;
    const handleMove = (moveEvent: PointerEvent) => {
      const nextHeight = clamp(
        startHeight - (moveEvent.clientY - startY),
        STATE_STRIP_MIN_HEIGHT,
        STATE_STRIP_MAX_HEIGHT,
      );
      setLayout((current) => ({ ...current, stateOpen: true, stateHeight: nextHeight }));
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  return {
    dimensions: {
      codeRailWidth: CODE_RAIL_WIDTH,
      stateRailHeight: STATE_RAIL_HEIGHT,
    },
    layout,
    actions: {
      selectStateTab,
      setCodeOpen,
      setRegisterNames,
      setStateOpen,
      startCodeResize,
      startStateResize,
    },
  };
}
