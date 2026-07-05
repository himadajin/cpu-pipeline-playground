import { act, renderHook, waitFor } from "@testing-library/react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { useWorkbenchLayout } from "../../src/ui/hooks/useWorkbenchLayout";

const LAYOUT_STORAGE_KEY = "cpu-pipeline-playground.layout.v2";
const LEGACY_LAYOUT_STORAGE_KEY = "cpu-pipeline-playground.layout.v1";

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
      codeOpen: true,
      codeWidth: 300,
      stateOpen: true,
      stateHeight: 240,
      stateTab: "registers",
      registerNames: "numeric",
    });
    expect(result.current.dimensions).toEqual({
      codeRailWidth: 36,
      stateRailHeight: 34,
    });
  });

  it("restores saved layout and clamps persisted sizes", () => {
    window.localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({
        codeOpen: false,
        codeWidth: 12,
        stateOpen: false,
        stateHeight: 999,
        stateTab: "events",
        registerNames: "abi",
      }),
    );

    const { result } = renderHook(() => useWorkbenchLayout());

    expect(result.current.layout).toEqual({
      codeOpen: false,
      codeWidth: 240,
      stateOpen: false,
      stateHeight: 400,
      stateTab: "events",
      registerNames: "abi",
    });
  });

  it("migrates tab and register name preferences from the v1 layout", () => {
    window.localStorage.setItem(
      LEGACY_LAYOUT_STORAGE_KEY,
      JSON.stringify({
        bottomOpen: false,
        bottomHeight: 260,
        bottomTab: "assembly",
        rightOpen: true,
        rightWidth: 420,
        rightTab: "memory",
        registerNames: "abi",
      }),
    );

    const { result } = renderHook(() => useWorkbenchLayout());

    expect(result.current.layout.stateTab).toBe("memory");
    expect(result.current.layout.registerNames).toBe("abi");
    // Pane geometry does not carry over; the new panes use their defaults.
    expect(result.current.layout.codeOpen).toBe(true);
    expect(result.current.layout.codeWidth).toBe(300);
  });

  it("opens the state strip when selecting a tab", () => {
    const { result } = renderHook(() => useWorkbenchLayout());

    act(() => {
      result.current.actions.setStateOpen(false);
      result.current.actions.setCodeOpen(false);
    });
    act(() => {
      result.current.actions.selectStateTab("events");
    });

    expect(result.current.layout.stateOpen).toBe(true);
    expect(result.current.layout.stateTab).toBe("events");
    expect(result.current.layout.codeOpen).toBe(false);
  });

  it("resizes the code pane and persists the new width", async () => {
    const { result } = renderHook(() => useWorkbenchLayout());

    act(() => result.current.actions.startCodeResize(resizeStart({ clientX: 300 })));
    act(() => {
      window.dispatchEvent(pointerEvent("pointermove", { clientX: 380 }));
      window.dispatchEvent(pointerEvent("pointerup", {}));
    });

    expect(result.current.layout.codeOpen).toBe(true);
    expect(result.current.layout.codeWidth).toBe(380);
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(LAYOUT_STORAGE_KEY) ?? "{}");
      expect(stored.codeWidth).toBe(380);
    });
  });

  it("resizes the state strip and clamps its height", () => {
    const { result } = renderHook(() => useWorkbenchLayout());

    act(() => result.current.actions.startStateResize(resizeStart({ clientY: 500 })));
    act(() => {
      window.dispatchEvent(pointerEvent("pointermove", { clientY: -500 }));
      window.dispatchEvent(pointerEvent("pointerup", {}));
    });

    expect(result.current.layout.stateOpen).toBe(true);
    expect(result.current.layout.stateHeight).toBe(400);
  });

  it("persists the register name style", async () => {
    const { result } = renderHook(() => useWorkbenchLayout());

    act(() => result.current.actions.setRegisterNames("abi"));

    expect(result.current.layout.registerNames).toBe("abi");
    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(LAYOUT_STORAGE_KEY) ?? "{}");
      expect(stored.registerNames).toBe("abi");
    });
  });
});
