import { test, expect, type Page } from '@playwright/test'
import { type DiagWindow } from './harness.js'
import { DEV_TAKEOFF_HOURS } from '../../src/render/sky/sun.js'

/**
 * Night takeoff choices on Form 4 are Dev-only (F6A Task 9; rank gating is F5): the title offers "Late dusk (dev)"
 * and "Night (dev)" only while Dev is checked, and a launch with one flies that hour.
 */
test.setTimeout(150_000)

async function toConditions(page: Page, dev: boolean) {
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  await page.waitForFunction(() => document.querySelector('[data-ww2-title]')?.getAttribute('data-ww2-ready') === 'true', undefined, { timeout: 60_000 })
  const existingPilot = title.locator('button[aria-pressed]').first()
  if (await existingPilot.isVisible()) await existingPilot.click()
  else {
    await title.getByRole('button', { name: 'New pilot' }).click()
    await title.getByPlaceholder('Pilot name').fill('Test Pilot')
    await title.getByRole('button', { name: 'Add' }).click()
  }
  if (dev) await title.getByRole('checkbox', { name: 'Dev — unlocks everything' }).check()
  await title.getByRole('button', { name: 'New game' }).first().click()
  await title.getByRole('button', { name: 'Next' }).click() // flight type
  await title.getByRole('button', { name: 'Next' }).click() // scenario
  return title
}

test('night takeoff times are offered only while Dev is checked', async ({ page }) => {
  const title = await toConditions(page, false)
  const group = title.getByRole('radiogroup', { name: 'Takeoff time' })
  await expect(group.getByRole('radio', { name: /Morning/ })).toBeVisible()
  await expect(group.getByRole('radio', { name: /Night \(dev\)/ })).toHaveCount(0)
  await expect(group.getByRole('radio', { name: /Late dusk \(dev\)/ })).toHaveCount(0)
})

test('with Dev checked, Night (dev) is offered and a launch flies the night hour (sun far below the horizon)', async ({ page }) => {
  const title = await toConditions(page, true)
  const group = title.getByRole('radiogroup', { name: 'Takeoff time' })
  await expect(group.getByRole('radio', { name: /Late dusk \(dev\)/ })).toBeVisible()
  await group.getByRole('radio', { name: /Night \(dev\)/ }).check()
  await title.getByRole('button', { name: 'Next' }).click() // conditions -> aircraft
  await title.getByRole('button', { name: 'Next' }).click() // aircraft -> armament
  await title.getByRole('button', { name: 'Launch' }).click()
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.tick() ?? 0) > 5, undefined, { timeout: 90_000 })
  const sun = await page.evaluate(() => (window as DiagWindow).__ww2!.sun())
  expect(sun.timeOfDay).toBeGreaterThanOrEqual(DEV_TAKEOFF_HOURS.night)
  expect(sun.timeOfDay).toBeLessThan(DEV_TAKEOFF_HOURS.night + 0.1)
  expect(sun.elevationDeg).toBeLessThan(-40)
  expect(sun.keyLight.kind).toBe('moon')
})
