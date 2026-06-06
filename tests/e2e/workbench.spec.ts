import { expect, test } from "@playwright/test";

test("program library, stepping, timeline selection, and inspector work", async ({ page }) => {
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
      leftExists: Boolean(document.querySelector(".left-pane")),
      center: box(".center-pane"),
      right: box(".right-pane"),
      timeline: box(".timeline-shell"),
      drawer: box(".bottom-drawer"),
      rightDock: box(".right-dock"),
      firstInstruction: document.querySelector(".instruction-cell")?.textContent?.trim() ?? "",
      pageOverflows: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
  expect(layout.leftExists).toBe(false);
  expect(layout.center?.x).toBeLessThanOrEqual(1);
  expect(layout.center?.width).toBeGreaterThan(1000);
  expect(layout.right?.width).toBeGreaterThan(280);
  expect(layout.timeline?.height).toBeGreaterThan(250);
  expect(layout.drawer?.height).toBeGreaterThan(200);
  expect(layout.rightDock?.height).toBeGreaterThan(500);
  expect(layout.timeline!.y + layout.timeline!.height).toBeLessThanOrEqual(layout.drawer!.y + 1);
  expect(layout.firstInstruction).toMatch(/^L\d+\s+[a-z]+$/);
  expect(layout.center!.x + layout.center!.width).toBeLessThanOrEqual(layout.right!.x + 1);
  expect(layout.pageOverflows).toBe(false);
  await expect(page.getByRole("button", { name: "Assembly" })).toHaveClass(/active/);
  await expect(page.getByRole("button", { name: "Inspector" })).toHaveClass(/active/);

  await page.getByRole("button", { name: "Reset" }).click();
  for (let index = 0; index < 5; index += 1) {
    await page.getByRole("button", { name: "Step" }).click();
  }
  const rowHeightBeforeEvents = await page.locator(".timeline-row").nth(1).evaluate((element) => element.getBoundingClientRect().height);
  await page.getByRole("button", { name: "Step" }).click();
  const rowHeightAfterEvents = await page.locator(".timeline-row").nth(1).evaluate((element) => element.getBoundingClientRect().height);
  expect(rowHeightAfterEvents).toBe(rowHeightBeforeEvents);
  await expect(page.locator(".event-marker").first()).toBeVisible();
  await expect(page.locator(".event-badge")).toHaveCount(0);

  await page.getByRole("button", { name: "Events" }).click();
  await expect(page.getByText(/writes x1/)).toBeVisible();
  await page.getByRole("button", { name: "Inspector" }).click();
  await page.locator(".timeline-cell.current-cycle").first().click();
  await expect(page.getByText(/line \d+, cycle 6/)).toBeVisible();
  await page.getByRole("button", { name: "Registers" }).click();
  await expect(page.locator(".register-name").first()).toHaveText("x0");
  await expect(page.locator(".register-name").nth(31)).toHaveText("x31");
  await page.getByRole("button", { name: "Memory" }).click();
  await expect(page.getByText("No memory writes yet.")).toBeVisible();

  const beforeRightClose = await page.locator(".center-pane").boundingBox();
  await page.getByRole("button", { name: "Close right dock" }).click();
  await expect(page.getByLabel("Right dock rail")).toBeVisible();
  const afterRightClose = await page.locator(".center-pane").boundingBox();
  expect(afterRightClose!.width).toBeGreaterThan(beforeRightClose!.width);
  await page.getByRole("button", { name: "Open Registers" }).click();
  await expect(page.getByRole("button", { name: "Registers" })).toHaveClass(/active/);

  const beforeBottomClose = await page.locator(".timeline-shell").boundingBox();
  await page.getByRole("button", { name: "Close bottom drawer" }).click();
  await expect(page.getByLabel("Bottom drawer rail")).toBeVisible();
  const afterBottomClose = await page.locator(".timeline-shell").boundingBox();
  expect(afterBottomClose!.height).toBeGreaterThan(beforeBottomClose!.height);
  await page.getByRole("button", { name: "Open Events" }).click();
  await expect(page.getByRole("button", { name: "Events" })).toHaveClass(/active/);

  const rightWidthBeforeResize = (await page.locator(".right-pane").boundingBox())!.width;
  const rightHandle = (await page.locator(".right-resizer").boundingBox())!;
  await page.mouse.move(rightHandle.x + rightHandle.width / 2, rightHandle.y + rightHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(rightHandle.x - 90, rightHandle.y + rightHandle.height / 2);
  await page.mouse.up();
  const rightWidthAfterResize = (await page.locator(".right-pane").boundingBox())!.width;
  expect(rightWidthAfterResize).toBeGreaterThan(rightWidthBeforeResize + 50);

  const bottomHeightBeforeResize = (await page.locator(".bottom-drawer").boundingBox())!.height;
  const bottomHandle = (await page.locator(".bottom-resizer").boundingBox())!;
  await page.mouse.move(bottomHandle.x + bottomHandle.width / 2, bottomHandle.y + bottomHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(bottomHandle.x + bottomHandle.width / 2, bottomHandle.y - 70);
  await page.mouse.up();
  const bottomHeightAfterResize = (await page.locator(".bottom-drawer").boundingBox())!.height;
  expect(bottomHeightAfterResize).toBeGreaterThan(bottomHeightBeforeResize + 40);

  await page.reload();
  await expect(page.getByRole("button", { name: "Registers" })).toHaveClass(/active/);
  await expect(page.getByRole("button", { name: "Events" })).toHaveClass(/active/);
  expect((await page.locator(".right-pane").boundingBox())!.width).toBeGreaterThan(rightWidthBeforeResize + 50);
  expect((await page.locator(".bottom-drawer").boundingBox())!.height).toBeGreaterThan(bottomHeightBeforeResize + 40);

  await page.getByRole("button", { name: /Select program:/ }).click();
  await expect(page.getByRole("menu", { name: "Programs" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Rename Forwarding chain/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Delete Forwarding chain/ })).toBeVisible();
  await page.getByRole("button", { name: "Rename Forwarding chain" }).click();
  await page.getByLabel("Program name").fill("Forwarding renamed");
  await page.getByLabel("Program name").press("Enter");
  await expect(page.getByRole("button", { name: /Select program: Forwarding renamed/ })).toBeVisible();
  await page.getByRole("button", { name: "New program" }).click();
  await expect(page.getByLabel("Program name")).toHaveValue("Untitled");
  await page.getByLabel("Program name").press("Enter");
  await expect(page.getByRole("button", { name: /Select program: Untitled/ })).toBeVisible();
});
