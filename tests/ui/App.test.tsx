import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "../../src/ui/App";

describe("App", () => {
  it("renders the workbench and steps a program", async () => {
    render(<App />);
    expect(screen.getByText("CPU Pipeline Playground")).toBeInTheDocument();
    expect(screen.getByRole("grid", { name: "Pipeline timeline" })).toBeInTheDocument();

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
    expect(screen.getByRole("button", { name: /modified/ })).toHaveAttribute("aria-current", "true");
  });

  it("selects a new program from the program list", async () => {
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "New program" }));
    expect(screen.getByLabelText("Program name")).toHaveValue("Untitled");
    expect(screen.getByRole("button", { name: /Untitled/ })).toHaveAttribute("aria-current", "true");
  });
});
