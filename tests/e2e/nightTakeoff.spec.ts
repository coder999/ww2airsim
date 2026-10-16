import { test, expect, type Page } from '@playwright/test'
import { toConditions as headquartersToConditions, type DiagWindow } from './harness.js'
import { DEV_TAKEOFF_HOURS } from '../../src/render/sky/sun.js'

/**
 * Night takeoff choices on Form 4 are Dev-only (F6A Task 9; rank gating is F5): the title offers "Late dusk (dev)"
 * and "Night (dev)" only while Dev is checked, and a launch with one flies that hour.
 */
test.setTimeout(150_000)

async function toConditions(page: Page, dev: boolean) {
  await page.goto('/')
  return headquartersToConditions(page, { dev })
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
