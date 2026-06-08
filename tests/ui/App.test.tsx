import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../../src/ui/App";

const LAYOUT_STORAGE_KEY = "cpu-pipeline-playground.layout.v1";
const PROGRAM_STORAGE_KEY = "cpu-pipeline-playground.programs.v1";

function pointerEvent(type: string, coords: { clientX?: number; clientY?: number }) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  if (coords.clientX !== undefined) Object.defineProperty(event, "clientX", { value: coords.clientX });
  if (coords.clientY !== undefined) Object.defineProperty(event, "clientY", { value: coords.clientY });
  return event;
}

describe("App", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders the workbench and steps a program", async () => {
    render(<App />);
    expect(screen.getByText("CPU Pipeline Playground")).toBeInTheDocument();
    expect(screen.getByRole("grid", { name: "Pipeline timeline" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assembly" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Inspector" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Events" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Registers" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Memory" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await userEvent.click(screen.getByRole("button", { name: "Step" }));

    expect(screen.getByText("cycle 1")).toBeInTheDocument();
    expect(screen.getByText("Inspector")).toBeInTheDocument();
  });

  it("invalidates the simulation after editing", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await userEvent.click(screen.getByRole("button", { name: "Step" }));
    const editor = await screen.findByLabelText("Assembly source");
    await userEvent.type(editor, "\naddi x11, x0, 2");
    expect(screen.getByText("simulation invalidated")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Select program: .*modified/ })).toBeInTheDocument();
  });

  it("keeps timeline events as markers and moves event logs to the Events tab", async () => {
    const { container } = render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    for (let index = 0; index < 6; index += 1) {
      await userEvent.click(screen.getByRole("button", { name: "Step" }));
    }

    expect(container.querySelector(".event-marker")).toBeInTheDocument();
    expect(container.querySelector(".event-badge")).not.toBeInTheDocument();
    expect(screen.queryByText(/commit:/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Events" }));
    expect(screen.getByText(/writes x1/)).toBeInTheDocument();
  });

  it("shows registers in fixed order and only highlights changed registers", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    for (let index = 0; index < 6; index += 1) {
      await userEvent.click(screen.getByRole("button", { name: "Step" }));
    }
    await userEvent.click(screen.getByRole("button", { name: "Registers" }));

    const registerGrid = screen.getByLabelText("Registers");
    const registerNames = Array.from(registerGrid.querySelectorAll(".register-name")).map(
      (element) => element.textContent,
    );
    expect(registerNames).toEqual(Array.from({ length: 32 }, (_, index) => `x${index}`));
    expect(registerGrid.querySelector(".register-cell.changed .register-name")?.textContent).toBe("x1");
    expect(registerGrid).toHaveTextContent("0x00000001");
    expect(registerGrid).toHaveTextContent("1");
  });

  it("shows byte-addressed memory grouped as little-endian words", async () => {
    window.localStorage.setItem(
      PROGRAM_STORAGE_KEY,
      JSON.stringify([
        {
          id: "memory",
          name: "Memory",
          source: "addi x1, x0, 16\naddi x2, x0, 255\nsw x2, 0(x1)\n",
          updatedAt: 0,
        },
      ]),
    );
    const { container } = render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    for (let index = 0; index < 7; index += 1) {
      await userEvent.click(screen.getByRole("button", { name: "Step" }));
    }
    await userEvent.click(screen.getByRole("button", { name: "Memory" }));

    expect(container).toHaveTextContent("[16] 0x000000ff");
    expect(container).toHaveTextContent("bytes 0xff 0x00 0x00 0x00");
    expect(container).toHaveTextContent("[16]: 0x00 -> 0xff");
  });

  it("collapses dock areas and reopens them from rails", async () => {
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "Close right dock" }));
    expect(screen.getByLabelText("Right dock rail")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open Registers" }));
    expect(screen.getByRole("button", { name: "Registers" })).toHaveClass("active");

    await userEvent.click(screen.getByRole("button", { name: "Close bottom drawer" }));
    expect(screen.getByLabelText("Bottom drawer rail")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open Events" }));
    expect(screen.getByRole("button", { name: "Events" })).toHaveClass("active");
  });

  it("restores saved dock layout state", async () => {
    window.localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({
        bottomOpen: false,
        bottomHeight: 260,
        bottomTab: "events",
        rightOpen: false,
        rightWidth: 420,
        rightTab: "registers",
      }),
    );
    const { container } = render(<App />);

    expect(screen.getByLabelText("Right dock rail")).toBeInTheDocument();
    expect(screen.getByLabelText("Bottom drawer rail")).toBeInTheDocument();
    expect(container.querySelector<HTMLElement>(".workbench")?.style.gridTemplateColumns).toContain("36px");
    expect(container.querySelector<HTMLElement>(".center-pane")?.style.gridTemplateRows).toContain("34px");

    await userEvent.click(screen.getByRole("button", { name: "Open Registers" }));
    await userEvent.click(screen.getByRole("button", { name: "Open Events" }));

    expect(screen.getByRole("button", { name: "Registers" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Events" })).toHaveClass("active");
    expect(container.querySelector<HTMLElement>(".workbench")?.style.gridTemplateColumns).toContain("420px");
    expect(container.querySelector<HTMLElement>(".center-pane")?.style.gridTemplateRows).toContain("260px");
  });

  it("resizes dock areas and persists the new sizes", async () => {
    const { container } = render(<App />);

    fireEvent(screen.getByRole("button", { name: "Resize right dock" }), pointerEvent("pointerdown", { clientX: 800 }));
    fireEvent(window, pointerEvent("pointermove", { clientX: 700 }));
    fireEvent(window, pointerEvent("pointerup", {}));
    expect(container.querySelector<HTMLElement>(".workbench")?.style.gridTemplateColumns).toContain("440px");

    fireEvent(
      screen.getByRole("button", { name: "Resize bottom drawer" }),
      pointerEvent("pointerdown", { clientY: 500 }),
    );
    fireEvent(window, pointerEvent("pointermove", { clientY: 430 }));
    fireEvent(window, pointerEvent("pointerup", {}));
    expect(container.querySelector<HTMLElement>(".center-pane")?.style.gridTemplateRows).toContain("370px");

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem(LAYOUT_STORAGE_KEY) ?? "{}");
      expect(stored.rightWidth).toBe(440);
      expect(stored.bottomHeight).toBe(370);
    });
  });

  it("creates a new program from the program switcher", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /Select program:/ }));
    await userEvent.click(screen.getByRole("button", { name: "New program" }));
    expect(screen.getByLabelText("Program name")).toHaveValue("Untitled");
    expect(screen.getByRole("button", { name: /Select program: Untitled/ })).toBeInTheDocument();
  });

  it("keeps step available after creating a new program from a halted simulation", async () => {
    render(<App />);
    const stepButton = screen.getByRole("button", { name: "Step" });

    for (let index = 0; index < 20 && !stepButton.hasAttribute("disabled"); index += 1) {
      await userEvent.click(stepButton);
    }
    expect(stepButton).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /Select program:/ }));
    await userEvent.click(screen.getByRole("button", { name: "New program" }));
    expect(screen.getByRole("button", { name: /Select program: Untitled/ })).toBeInTheDocument();
    expect(stepButton).toBeEnabled();

    await userEvent.click(stepButton);
    expect(screen.getByText("cycle 1")).toBeInTheDocument();
  });

  it("renames the selected program from the program switcher", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /Select program:/ }));
    await userEvent.click(screen.getByRole("button", { name: "Rename Sum four numbers" }));
    const nameInput = screen.getByLabelText("Program name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Sum renamed{Enter}");
    expect(screen.getByRole("button", { name: /Select program: Sum renamed/ })).toBeInTheDocument();
  });

  it("disables delete when only one program exists", async () => {
    window.localStorage.setItem(
      "cpu-pipeline-playground.programs.v1",
      JSON.stringify([{ id: "solo", name: "Solo", source: "addi x1, x0, 1\n", updatedAt: 0 }]),
    );
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /Select program:/ }));
    expect(screen.getByRole("button", { name: "Delete Solo" })).toBeDisabled();
  });
});
