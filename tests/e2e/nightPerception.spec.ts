import { expect, test, type Page } from '@playwright/test'
import { spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

/**
 * F6B (docs/night.md, "Perception"): the wiring, read from `__ww2.perception()`, never from pictures. The night
 * patrol test bed has two Zeros passing 1.5 miles to the south of a Hellcat at 21:00. Lit, the player is seen out
 * to 3.7 miles and a Zero chooses him; blacked out (the `N` key, applied to the world and recorded), the range
 * falls to about half a mile and neither does. The detector must be able to fail: the lit run proves a Zero
 * CAN choose the player in this geometry, so the dark run's "never" is not vacuous.
 */
test.setTimeout(240_000)
const PERCEPTION = () => (window as DiagWindow).__ww2!.perception()
// Start 8 km west of the Zeros' start, abeam 1.5 miles of them; god mode so a lit run survives its attackers.
const START = { x: -14000, y: 1500, z: -50805 }
const QUERY = { scenario: 'night-patrol', launch: '1', aircraft: 'f6f-hellcat', loadout: 'clean', cloudTier: 'off', god: '1' }

async function open(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto(withParams(spawnUrl(START), QUERY))
  await waitForTerrain(page)
  await page.waitForTimeout(1500)
}

test('lit: the player is seen far and a Zero chooses him', async ({ page }) => {
  await open(page)
  const first = await page.evaluate(PERCEPTION)
  expect(first.night).toBe(true)
  expect(first.playerLit).toBe(true)
  expect(first.playerRangeM).toBeGreaterThan(5000)
  await page.waitForFunction(() => (window as DiagWindow).__ww2!.perception().rows.some((r) => r.targetsPlayer), undefined, { timeout: 90_000 })
})

test('blacked out (N): the range collapses and no Zero chooses him while they pass 1.5 miles off', async ({ page }) => {
  await open(page)
  await page.keyboard.press('n')
  await page.waitForFunction(() => !(window as DiagWindow).__ww2!.playerLightsOn(), undefined, { timeout: 10_000 })
  const dark = await page.evaluate(PERCEPTION)
  expect(dark.playerLit).toBe(false)
  expect(dark.playerRangeM).toBeLessThan(1500)
  expect(dark.playerRangeM).toBeGreaterThanOrEqual(400)
  // Let them pass: they are 8 km away closing at about 190 m/s, abeam in about 40 s; watch 60 s.
  let chose = false
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000)
    const p = await page.evaluate(PERCEPTION)
    if (p.rows.some((r) => r.targetsPlayer)) chose = true
  }
  expect(chose).toBe(false)
  // Switch back on: seen again.
  await page.keyboard.press('n')
  await page.waitForFunction(() => (window as DiagWindow).__ww2!.perception().playerRangeM > 5000)
})
