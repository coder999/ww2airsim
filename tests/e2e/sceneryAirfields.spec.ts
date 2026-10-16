import { test, expect } from '@playwright/test'
import { startGame, waitForTerrain, type DiagWindow } from './harness.js'

/**
 * The strip, airfield scenery and tree clearing are built from the airfields of
 * the world that is loaded. The boot world is Free Flight (Tacloban, Dulag);
 * Convoy Strike's recovery field, Bayug, is on no other mission's list, so
 * after an in-place swap it had no strip drawn and trees grew over it
 * (Mark, 2026-10-15). Wiring check: read the diagnostic, not a picture.
 */
test.setTimeout(120_000)

test('an in-place swap to Convoy Strike builds Bayug\'s strip as well as Tacloban\'s', async ({ page }) => {
  await page.goto('/')
  await startGame(page, { scenario: 'Convoy Strike', dev: true })
  await waitForTerrain(page)
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.sceneryAirfields()), { timeout: 30_000 }).toEqual(['tacloban', 'bayug'])
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})
