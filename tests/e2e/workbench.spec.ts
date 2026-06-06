import { expect, test } from "@playwright/test";

test("program library, stepping, timeline selection, and inspector work", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("CPU Pipeline Playground")).toBeVisible();
  const layout = await page.evaluate(() => {
    const box = (selector: string) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      if (!rect) return null;
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    return {
      left: box(".left-pane"),
      center: box(".center-pane"),
      right: box(".right-pane"),
      timeline: box(".timeline-shell"),
      editor: box(".editor-shell"),
      firstInstruction: document.querySelector(".instruction-cell")?.textContent?.trim() ?? "",
      selectedProgram: document.querySelector(".program-row.selected")?.textContent?.trim() ?? "",
    };
  });
  expect(layout.left?.width).toBeGreaterThan(250);
  expect(layout.center?.width).toBeGreaterThan(600);
  expect(layout.right?.width).toBeGreaterThan(280);
  expect(layout.timeline?.height).toBeGreaterThan(250);
  expect(layout.editor?.height).toBeGreaterThan(200);
  expect(layout.timeline!.y + layout.timeline!.height).toBeLessThanOrEqual(layout.editor!.y + 1);
  expect(layout.firstInstruction).toMatch(/^L\d+\s+[a-z]+$/);
  expect(layout.selectedProgram).toContain("ready");
  expect(layout.left!.x + layout.left!.width).toBeLessThanOrEqual(layout.center!.x + 1);
  expect(layout.center!.x + layout.center!.width).toBeLessThanOrEqual(layout.right!.x + 1);
  await page.getByRole("button", { name: "Reset" }).click();
  await page.getByRole("button", { name: "Step" }).click();
  await expect(page.getByText("cycle 1")).toBeVisible();
  await page.getByRole("grid", { name: "Pipeline timeline" }).locator("button").first().click();
  await expect(page.getByText("Inspector")).toBeVisible();
  await page.getByRole("button", { name: "New program" }).click();
  await expect(page.getByLabel("Program name")).toHaveValue("Untitled");
  await expect(page.getByRole("button", { name: /Untitled/ })).toHaveAttribute("aria-current", "true");
});
