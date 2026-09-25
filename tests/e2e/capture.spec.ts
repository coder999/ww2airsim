import { test, expect } from '@playwright/test'
import { waitForTerrain, type DiagWindow } from './harness.js'
import { VIEWS, withParams } from './views.js'

/** Screenshot capture of the eight views at 1440p, for the executing agent to
 *  READ (spec §3.1). Not an assertion of appearance: the picture is judged by
 *  whoever reads it. `CAPTURE_PARAMS` (a query string) is appended to every
 *  view so one run can capture e.g. `toneMap=none` for comparison. */
const extra = Object.fromEntries(new URLSearchParams(process.env.CAPTURE_PARAMS ?? ''))
test.setTimeout(90_000)
for (const view of VIEWS) {
  test(`capture: ${view.name}`, async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)) })
    await page.setViewportSize({ width: 2560, height: 1440 })
    await page.goto(withParams(view.url, { cloudTier: 'high', oceanTier: 'high', ...extra }))
    await waitForTerrain(page)
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `test-results/capture/${view.name}.png` })
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
    expect(errors).toEqual([])
  })
}
