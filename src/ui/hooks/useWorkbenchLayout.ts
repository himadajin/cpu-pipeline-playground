import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";

const LAYOUT_STORAGE_KEY = "cpu-pipeline-playground.layout.v1";
const RIGHT_DOCK_MIN_WIDTH = 280;
const RIGHT_DOCK_MAX_WIDTH = 560;
const RIGHT_RAIL_WIDTH = 36;
const BOTTOM_DRAWER_MIN_HEIGHT = 180;
const BOTTOM_DRAWER_MAX_HEIGHT = 520;
const BOTTOM_RAIL_HEIGHT = 34;

export type BottomTab = "assembly" | "events";
export type RightTab = "inspector" | "registers" | "memory";

export type WorkbenchLayout = {
  bottomOpen: boolean;
  bottomHeight: number;
  bottomTab: BottomTab;
  rightOpen: boolean;
  rightWidth: number;
  rightTab: RightTab;
};

const DEFAULT_LAYOUT: WorkbenchLayout = {
  bottomOpen: true,
  bottomHeight: 300,
  bottomTab: "assembly",
  rightOpen: true,
  rightWidth: 340,
  rightTab: "inspector",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isBottomTab(value: unknown): value is BottomTab {
  return value === "assembly" || value === "events";
}

function isRightTab(value: unknown): value is RightTab {
  return value === "inspector" || value === "registers" || value === "memory";
}

function loadWorkbenchLayout(): WorkbenchLayout {
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<WorkbenchLayout>;
    return {
      bottomOpen: typeof parsed.bottomOpen === "boolean" ? parsed.bottomOpen : DEFAULT_LAYOUT.bottomOpen,
      bottomHeight:
        typeof parsed.bottomHeight === "number"
          ? clamp(parsed.bottomHeight, BOTTOM_DRAWER_MIN_HEIGHT, BOTTOM_DRAWER_MAX_HEIGHT)
          : DEFAULT_LAYOUT.bottomHeight,
      bottomTab: isBottomTab(parsed.bottomTab) ? parsed.bottomTab : DEFAULT_LAYOUT.bottomTab,
      rightOpen: typeof parsed.rightOpen === "boolean" ? parsed.rightOpen : DEFAULT_LAYOUT.rightOpen,
      rightWidth:
        typeof parsed.rightWidth === "number"
          ? clamp(parsed.rightWidth, RIGHT_DOCK_MIN_WIDTH, RIGHT_DOCK_MAX_WIDTH)
          : DEFAULT_LAYOUT.rightWidth,
      rightTab: isRightTab(parsed.rightTab) ? parsed.rightTab : DEFAULT_LAYOUT.rightTab,
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

  function selectBottomTab(tab: BottomTab) {
    updateLayout({ bottomTab: tab, bottomOpen: true });
  }

  function selectRightTab(tab: RightTab) {
    updateLayout({ rightTab: tab, rightOpen: true });
  }

  function setBottomOpen(open: boolean) {
    updateLayout({ bottomOpen: open });
  }

  function setRightOpen(open: boolean) {
    updateLayout({ rightOpen: open });
  }

  function startRightResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = layout.rightWidth;
    const handleMove = (moveEvent: PointerEvent) => {
      const nextWidth = clamp(startWidth - (moveEvent.clientX - startX), RIGHT_DOCK_MIN_WIDTH, RIGHT_DOCK_MAX_WIDTH);
      setLayout((current) => ({ ...current, rightOpen: true, rightWidth: nextWidth }));
    };
    const handleUp = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function startBottomResize(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = layout.bottomHeight;
    const handleMove = (moveEvent: PointerEvent) => {
      const nextHeight = clamp(startHeight - (moveEvent.clientY - startY), BOTTOM_DRAWER_MIN_HEIGHT, BOTTOM_DRAWER_MAX_HEIGHT);
      setLayout((current) => ({ ...current, bottomOpen: true, bottomHeight: nextHeight }));
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
      bottomRailHeight: BOTTOM_RAIL_HEIGHT,
      rightRailWidth: RIGHT_RAIL_WIDTH,
    },
    layout,
    actions: {
      selectBottomTab,
      selectRightTab,
      setBottomOpen,
      setRightOpen,
      startBottomResize,
      startRightResize,
    },
  };
}
