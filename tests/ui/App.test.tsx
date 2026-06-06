import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "../../src/ui/App";

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
    const editor = screen.getByLabelText("Assembly source");
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
    const registerNames = Array.from(registerGrid.querySelectorAll(".register-name")).map((element) => element.textContent);
    expect(registerNames).toEqual(Array.from({ length: 32 }, (_, index) => `x${index}`));
    expect(registerGrid.querySelector(".register-cell.changed .register-name")?.textContent).toBe("x1");
  });

  it("creates a new program from the program switcher", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /Select program:/ }));
    await userEvent.click(screen.getByRole("button", { name: "New program" }));
    expect(screen.getByLabelText("Program name")).toHaveValue("Untitled");
    expect(screen.getByRole("button", { name: /Select program: Untitled/ })).toBeInTheDocument();
  });

  it("renames the selected program from the program switcher", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: /Select program:/ }));
    await userEvent.click(screen.getByRole("button", { name: "Rename Forwarding chain" }));
    const nameInput = screen.getByLabelText("Program name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Forwarding renamed{Enter}");
    expect(screen.getByRole("button", { name: /Select program: Forwarding renamed/ })).toBeInTheDocument();
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
