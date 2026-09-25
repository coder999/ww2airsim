import { test, expect, type Page } from '@playwright/test'
import { spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'

/**
 * Tier 2. Confirms that the committed Wildcat glTF loads in the shipped app
 * and that the production KeyG path drives the simulated gear fraction used
 * by the model's rigged landing-gear nodes. The Node unit suite can verify
 * interpolation math, but it cannot exercise GLTFLoader's browser image
 * decode path. As elsewhere in this tier, validation is state-based rather
 * than a screenshot golden.
 */
const gearFraction = (page: Page) =>
  page.evaluate(() => (window as DiagWindow).__ww2!.gearFraction())

test.setTimeout(60_000)

test('Wildcat gear extends and retracts in flight, with no browser or WebGPU errors', async ({ page }) => {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })

  // Retracting the gear while parked correctly removes wheel support and
  // crashes the aircraft onto the runway. Start safely airborne instead;
  // spawn overrides deliberately begin with the gear fully retracted.
  await page.goto(spawnUrl({ x: 0, y: 1_000, z: 0 }))
  await waitForTerrain(page)

  expect(await gearFraction(page)).toBe(0)
  await page.keyboard.press('KeyG')
  await expect.poll(() => gearFraction(page), { timeout: 12_000 }).toBeGreaterThan(0.95)

  await page.keyboard.press('KeyG')
  await expect.poll(() => gearFraction(page), { timeout: 12_000 }).toBeLessThan(0.05)

  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
  const { impact, validationErrors } = await page.evaluate(() => {
    const diagnostics = (window as DiagWindow).__ww2!
    return { impact: diagnostics.impact(), validationErrors: diagnostics.validationErrors }
  })
  expect(impact).toBeNull()
  expect(validationErrors).toEqual([])
})
