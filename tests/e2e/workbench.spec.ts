import { expect, test } from "@playwright/test";

test("program library, stepping, popover details, and workbench layout work", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(page.getByText("CPU Pipeline Playground")).toBeVisible();
  const layout = await page.evaluate(() => {
    const box = (selector: string) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      if (!rect) return null;
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    return {
      code: box(".code-pane"),
      observe: box(".observe-pane"),
      timeline: box(".timeline-shell"),
      state: box(".state-strip"),
      pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  // Code column on the left at its default width; trace and state strip on the right.
  expect(layout.code?.x).toBeLessThanOrEqual(1);
  expect(layout.code?.width).toBeGreaterThanOrEqual(240);
  expect(layout.code!.x + layout.code!.width).toBeLessThanOrEqual(layout.observe!.x + 1);
  expect(layout.timeline?.height).toBeGreaterThan(250);
  expect(layout.state?.height).toBeGreaterThan(150);
  expect(layout.timeline!.y + layout.timeline!.height).toBeLessThanOrEqual(layout.state!.y + 1);
  expect(layout.pageOverflows).toBe(false);
  await expect(page.getByRole("button", { name: "Registers" })).toHaveClass(/active/);

  await page.getByRole("button", { name: "Reset" }).click();
  for (let index = 0; index < 9; index += 1) {
    await page.getByRole("button", { name: "Step" }).click();
  }
  const rowHeightBeforeEvents = await page
    .locator(".timeline-row")
    .nth(1)
    .evaluate((element) => element.getBoundingClientRect().height);
  await page.getByRole("button", { name: "Step" }).click();
  const rowHeightAfterEvents = await page
    .locator(".timeline-row")
    .nth(1)
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(rowHeightAfterEvents).toBe(rowHeightBeforeEvents);
  await expect(page.locator(".event-marker").first()).toBeVisible();
  await expect(page.locator(".event-badge")).toHaveCount(0);

  // Every state strip tab reads the machine at the cursor cycle.
  await page.getByRole("button", { name: "Events" }).click();
  await expect(page.getByText(/waits for an older writer to retire/)).toBeVisible();
  await page.getByRole("button", { name: "Registers" }).click();
  await expect(page.locator(".register-name").first()).toHaveText("x0");
  await expect(page.locator(".register-name").nth(31)).toHaveText("x31");
  await page.getByRole("button", { name: "Memory" }).click();
  await expect(page.getByText("No memory writes yet.")).toBeVisible();

  // Cell details open in a popover beside the cell and close with Escape.
  await page
    .locator(".timeline-cell.current-cycle", { hasText: /ID|EX|MEM|WB|IF/ })
    .first()
    .click();
  const popover = page.getByRole("dialog", { name: "Cell details" });
  await expect(popover).toBeVisible();
  await expect(popover.getByText(/S\d+, [A-Z]+, cycle 10, line \d+/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popover).toHaveCount(0);

  // Collapse both panes to rails and reopen them.
  const beforeCodeClose = await page.locator(".observe-pane").boundingBox();
  await page.getByRole("button", { name: "Close code pane" }).click();
  await expect(page.getByLabel("Code rail")).toBeVisible();
  const afterCodeClose = await page.locator(".observe-pane").boundingBox();
  expect(afterCodeClose!.width).toBeGreaterThan(beforeCodeClose!.width);
  await page.getByRole("button", { name: "Open Code" }).click();
  await expect(page.locator(".code-pane")).toBeVisible();

  const beforeStateClose = await page.locator(".timeline-shell").boundingBox();
  await page.getByRole("button", { name: "Close state strip" }).click();
  await expect(page.getByLabel("State strip rail")).toBeVisible();
  const afterStateClose = await page.locator(".timeline-shell").boundingBox();
  expect(afterStateClose!.height).toBeGreaterThan(beforeStateClose!.height);
  await page.getByRole("button", { name: "Open Registers" }).click();
  await expect(page.getByRole("button", { name: "Registers" })).toHaveClass(/active/);

  // Resize both panes and keep the sizes across a reload.
  const codeWidthBeforeResize = (await page.locator(".code-pane").boundingBox())!.width;
  const codeHandle = (await page.locator(".code-resizer").boundingBox())!;
  await page.mouse.move(codeHandle.x + codeHandle.width / 2, codeHandle.y + codeHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(codeHandle.x + 90, codeHandle.y + codeHandle.height / 2);
  await page.mouse.up();
  const codeWidthAfterResize = (await page.locator(".code-pane").boundingBox())!.width;
  expect(codeWidthAfterResize).toBeGreaterThan(codeWidthBeforeResize + 50);

  const stateHeightBeforeResize = (await page.locator(".state-strip").boundingBox())!.height;
  const stateHandle = (await page.locator(".state-resizer").boundingBox())!;
  await page.mouse.move(stateHandle.x + stateHandle.width / 2, stateHandle.y + stateHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(stateHandle.x + stateHandle.width / 2, stateHandle.y - 70);
  await page.mouse.up();
  const stateHeightAfterResize = (await page.locator(".state-strip").boundingBox())!.height;
  expect(stateHeightAfterResize).toBeGreaterThan(stateHeightBeforeResize + 40);

  await page.reload();
  await expect(page.getByRole("button", { name: "Registers" })).toHaveClass(/active/);
  expect((await page.locator(".code-pane").boundingBox())!.width).toBeGreaterThan(codeWidthBeforeResize + 50);
  expect((await page.locator(".state-strip").boundingBox())!.height).toBeGreaterThan(stateHeightBeforeResize + 40);

  await page.getByRole("button", { name: /Select program:/ }).click();
  await expect(page.getByRole("menu", { name: "Programs" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Rename Sum four numbers/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Delete Sum four numbers/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Restore initial samples" })).toBeVisible();
  await page.getByRole("button", { name: "Rename Sum four numbers" }).click();
  await page.getByLabel("Program name").fill("Sum renamed");
  await page.getByLabel("Program name").press("Enter");
  await expect(page.getByRole("button", { name: /Select program: Sum renamed/ })).toBeVisible();
  await page.getByRole("button", { name: "New program" }).click();
  await expect(page.getByLabel("Program name")).toHaveValue("Untitled");
  await page.getByLabel("Program name").press("Enter");
  await expect(page.getByRole("button", { name: /Select program: Untitled/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Step" })).toBeEnabled();
  await page.getByRole("button", { name: "Step" }).click();
  await expect(page.locator(".pipeline-status")).toContainText("cycle 1");
});
