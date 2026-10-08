import { test, expect } from '@playwright/test'
import { waitForTerrain, spawnUrl, type DiagWindow } from './harness.js'
import { withParams } from './views.js'
import { toLocal } from '../../src/sim/world/projection.js'

/** SPIKE (satellite drape): the same views with and without `?drape=`, for a
 *  human to read. Not an assertion of appearance. */
const town = toLocal(11.244, 125.0035)
// Heading is east by default, so spawns sit inland (west) and look across the town.
const VIEWS = [
  { name: 'town-450', url: spawnUrl({ x: town.x - 3500, y: 450, z: town.z + 900 }) },
  { name: 'town-1500', url: spawnUrl({ x: town.x - 6000, y: 1500, z: town.z + 1500 }) },
  { name: 'south-600', url: spawnUrl({ x: town.x - 2500, y: 600, z: town.z + 8000 }) },
  { name: 'high-4500', url: spawnUrl({ x: town.x - 9000, y: 4500, z: town.z + 3000 }) },
]
const VARIANTS = (process.env.DRAPE_VARIANTS ?? 'off,1944').split(',')
test.setTimeout(120_000)
// A capture tool, not a test: a plain Tier 2 run skips it (docs/testing.md, "Philosophy").
test.skip(!process.env.E2E_CAPTURE, 'set E2E_CAPTURE=1 to run the drape spike capture')
for (const view of VIEWS) for (const v of VARIANTS) {
  test(`drape ${view.name} ${v}`, async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)) })
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto(withParams(view.url, { cloudTier: 'low', oceanTier: 'high', ...(v === 'off' ? {} : { drape: v }) }))
    await waitForTerrain(page)
    await page.keyboard.press('/')
    await page.waitForTimeout(4000)
    await page.screenshot({ path: `test-results/drape/${view.name}-${v}.png` })
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
    expect(errors).toEqual([])
  })
}
