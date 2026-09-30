import { expect, test } from "@playwright/test";
import { waitForTerrain, type DiagWindow } from "./harness.js";

test.setTimeout(150_000);
test.use({ viewport: { width: 2560, height: 1440 } });

test("the navigation chart selects recovery points without advancing the world", async ({
  page,
}) => {
  await page.goto("/");
  await waitForTerrain(page);
  const tick = () => page.evaluate(() => (window as DiagWindow).__ww2!.tick());

  await page.keyboard.press("KeyP");
  const chart = page.getByRole("dialog", { name: "Navigation chart" });
  await expect(chart).toBeVisible();
  await expect(chart).toContainText("YOU");
  await expect(chart).toContainText("Tacloban");
  await expect(chart).toContainText("Dulag");
  await expect(chart).toContainText("Essex-class fleet carrier");
  await expect(chart).toContainText("f6f-2");

  // Every caption must lie inside the chart's own viewBox; a caption pushed
  // past an edge is silently clipped, which a text assertion cannot see.
  const clipped = await chart.getByRole("img", { name: /^Navigation chart/ }).evaluate((svg) => {
    const root = svg as SVGSVGElement;
    const box = root.viewBox.baseVal;
    const rootInverse = root.getScreenCTM()!.inverse();
    return Array.from(root.querySelectorAll("text"))
      .map((text) => {
        // getBBox is in the text's own space; the chart draws inside a
        // translated group, so map the corners into the viewBox's space.
        const local = (text as SVGTextElement).getBBox();
        const toRoot = rootInverse.multiply((text as SVGTextElement).getScreenCTM()!);
        const a = new DOMPoint(local.x, local.y).matrixTransform(toRoot);
        const b = new DOMPoint(local.x + local.width, local.y + local.height).matrixTransform(toRoot);
        return { label: text.textContent, x0: a.x, y0: a.y, x1: b.x, y1: b.y };
      })
      .filter(
        (t) =>
          Math.min(t.x0, t.x1) < box.x ||
          Math.min(t.y0, t.y1) < box.y ||
          Math.max(t.x0, t.x1) > box.x + box.width ||
          Math.max(t.y0, t.y1) > box.y + box.height,
      )
      .map((t) => `${t.label} at ${t.x0.toFixed(1)},${t.y0.toFixed(1)} to ${t.x1.toFixed(1)},${t.y1.toFixed(1)}`);
  });
  expect(clipped, `captions outside the chart:\n${clipped.join("\n")}`).toEqual([]);

  const frozen = await tick();
  await page.waitForTimeout(600);
  expect(await tick()).toBe(frozen);

  await page
    .getByRole("button", { name: "Set Tacloban as navigation destination" })
    .click();
  await expect(chart).toContainText(
    /Tacloban — Course \d{3}° · (?:\d+(?:\.\d)? nm|\d+ ft)/,
  );
  await page
    .getByRole("button", {
      name: "Set Essex-class fleet carrier as navigation destination",
    })
    .click();
  await expect(chart).toContainText(
    /Essex-class fleet carrier — Course \d{3}° · \d+(?:\.\d)? nm/,
  );
  await page.screenshot({ path: "test-results/mission-map.png" });

  await page.keyboard.press("KeyP");
  await expect(chart).toBeHidden();
  await page.waitForTimeout(300);
  expect(await tick()).toBeGreaterThan(frozen);
  const errors = await page.evaluate(
    () => (window as DiagWindow).__ww2!.validationErrors,
  );
  expect(
    errors,
    `WebGPU validation errors:\n${JSON.stringify(errors, null, 2)}`,
  ).toEqual([]);
});
