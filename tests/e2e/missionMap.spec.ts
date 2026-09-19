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
  const clipped = await chart.locator("svg").evaluate((svg) => {
    const box = (svg as SVGSVGElement).viewBox.baseVal;
    return Array.from(svg.querySelectorAll("text"))
      .map((text) => ({ label: text.textContent, bbox: (text as SVGTextElement).getBBox() }))
      .filter(
        ({ bbox }) =>
          bbox.x < box.x ||
          bbox.y < box.y ||
          bbox.x + bbox.width > box.x + box.width ||
          bbox.y + bbox.height > box.y + box.height,
      )
      .map(({ label, bbox }) => `${label} at ${bbox.x},${bbox.y} ${bbox.width}x${bbox.height}`);
  });
  expect(clipped, `captions outside the chart:\n${clipped.join("\n")}`).toEqual([]);

  const frozen = await tick();
  await page.waitForTimeout(600);
  expect(await tick()).toBe(frozen);

  await page
    .getByRole("button", { name: "Set Tacloban as navigation destination" })
    .click();
  await expect(chart).toContainText(
    /Tacloban — Course \d{3}° · (?:\d+(?:\.\d)? km|\d+ m)/,
  );
  await page
    .getByRole("button", {
      name: "Set Essex-class fleet carrier as navigation destination",
    })
    .click();
  await expect(chart).toContainText(
    /Essex-class fleet carrier — Course \d{3}° · \d+(?:\.\d)? km/,
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
