import { test, expect } from '@playwright/test'
import { waitForTerrain, type DiagWindow } from './harness.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { GROUND_CONTACT_TOLERANCE_M } from '../../src/sim/ground.js'

/**
 * Tier 2, the F4U-1D Corsair (aircraft onboarding, 2026-09-29): the quick
 * launch puts it on the Essex's deck in the deck-quals scenario, and it must
 * get airborne off the bow with no validation error. The trap itself is
 * covered at the sim level by `tests/sim/trapCorsair.test.ts`; no browser
 * spec flies a full approach for any airplane.
 */
const f4u = loadAircraftSpec('f4u-corsair')
const URL = `/?${SCENARIO_PARAM}=deck-quals&launch&aircraft=f4u-corsair`
test.setTimeout(180_000)

test('the Corsair parks on the deck, takes off the bow and clears it', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(URL)
  await waitForTerrain(page)
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.supportedContact()), { timeout: 20_000 }).toBe(true)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.deck()?.shipId)).toBe('cv-1')
  await page.screenshot({ path: 'test-results/f4u-deck-parked.png' })
  await page.keyboard.down('Equal')
  await page.waitForTimeout(9000)
  await page.keyboard.down('ArrowDown')
  await page.waitForTimeout(1200)
  await page.keyboard.up('ArrowDown')
  await page.waitForFunction(
    ([h, tol]) => {
      const d = (window as DiagWindow).__ww2!
      const g = d.groundHeightM()
      return g !== null && !d.supportedContact() && d.aircraftPositionM().y - h - g > tol
    },
    [f4u.gear.heightM, GROUND_CONTACT_TOLERANCE_M] as const,
    { timeout: 30_000 },
  )
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.deck()), { timeout: 10_000 }).toBeNull()
  await page.waitForTimeout(1500)
  const after = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { impact: d.impact(), errors: d.validationErrors }
  })
  expect(after.impact).toBeNull()
  expect(after.errors).toEqual([])
  await page.keyboard.up('Equal')
  await page.screenshot({ path: 'test-results/f4u-deck-airborne.png' })
})
