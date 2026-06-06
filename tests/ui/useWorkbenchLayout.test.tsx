import { act, renderHook, waitFor } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { useWorkbenchLayout } from "../../src/ui/hooks/useWorkbenchLayout";

const LAYOUT_STORAGE_KEY = "cpu-pipeline-playground.layout.v1";

function pointerEvent(type: string, coords: { clientX?: number; clientY?: number }) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  if (coords.clientX !== undefined) Object.defineProperty(event, "clientX", { value: coords.clientX });
  if (coords.clientY !== undefined) Object.defineProperty(event, "clientY", { value: coords.clientY });
  return event;
}

function resizeStart(coords: { clientX?: number; clientY?: number }) {
  return {
    preventDefault: () => undefined,
    ...coords,
  } as ReactPointerEvent<HTMLButtonElement>;
}

describe("useWorkbenchLayout", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("loads the default layout", () => {
    const { result } = renderHook(() => useWorkbenchLayout());

    expect(result.current.layout).toEqual({
      bottomOpen: true,
      bottomHeight: 300,
      bottomTab: "assembly",
      rightOpen: true,
      rightWidth: 340,
      rightTab: "inspector",
    });
    expect(result.current.dimensions).toEqual({
      bottomRailHeight: 34,
      rightRailWidth: 36,
    });
  });

  it("restores saved layout and clamps persisted sizes", () => {
    window.localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({
        bottomOpen: false,
        bottomHeight: 999,
        bottomTab: "events",
        rightOpen: false,
        rightWidth: 12,
        rightTab: "registers",
      }),
    );

    const { result } = renderHook(() => useWorkbenchLayout());

    expect(result.current.layout).toEqual({
      bottomOpen: false,
      bottomHeight: 520,
      bottomTab: "events",
      rightOpen: false,
      rightWidth: 280,
      rightTab: "registers",
    });
  });

  it("opens the matching dock area when selecting a tab", () => {
    const { result } = renderHook(() => useWorkbenchLayout());

    act(() => {
      result.current.actions.setBottomOpen(false);
      result.current.actions.setRightOpen(false);
    });
    act(() => {
      result.current.actions.selectBottomTab("events");
      result.current.actions.selectRightTab("memory");
    });

    expect(result.current.layout.bottomOpen).toBe(true);
    expect(result.current.layout.bottomTab).toBe("events");
    expect(result.current.layout.rightOpen).toBe(true);
    expect(result.current.layout.rightTab).toBe("memory");
  });

  it("resizes the right dock and persists the new width", async () => {
    const { result } = renderHook(() => useWorkbenchLayout());

    act(() => result.current.actions.startRightResize(resizeStart({ clientX: 800 })));
    act(() => {
      window.dispatchEvent(pointerEvent("pointermove", { clientX: 700 }));
      window.dispatchEvent(pointerEvent("pointerup", {}));
    });

    expect(result.current.layout.rightOpen).toBe(true);
    expect(result.current.layout.rightWidth).toBe(440);
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(LAYOUT_STORAGE_KEY) ?? "{}");
      expect(stored.rightWidth).toBe(440);
    });
  });

  it("resizes the bottom drawer and clamps its height", () => {
    const { result } = renderHook(() => useWorkbenchLayout());

    act(() => result.current.actions.startBottomResize(resizeStart({ clientY: 500 })));
    act(() => {
      window.dispatchEvent(pointerEvent("pointermove", { clientY: -500 }));
      window.dispatchEvent(pointerEvent("pointerup", {}));
    });

    expect(result.current.layout.bottomOpen).toBe(true);
    expect(result.current.layout.bottomHeight).toBe(520);
  });
});
