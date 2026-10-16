import { test, expect, type Locator, type Page } from '@playwright/test'
import { toConditions, type DiagWindow } from './harness.js'

/**
 * A3 and A4 (docs/superpowers/plans/2026-10-09-a3-a4-launch.md): Form 2's
 * takeoff time reaches the sky. Graphics configuration is now session-wide:
 * the preflight completes before mission selection and Form 4 does not own a
 * second editable copy of the rendering controls.
 */
test.setTimeout(180_000)

const SHOTS = 'test-results'
const sunHour = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.sun().timeOfDay)

/** Headquarters to Flight Conditions for a row (an unscored Single Missions row: no rank gates). */
async function toForm4(page: Page, scenario: string): Promise<Locator> {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  return toConditions(page, { scenario })
}

test('Flight Conditions offers Morning, Midday and Dusk, suggests the nearest historical hour, and flies the chosen hour', async ({ page }) => {
  let title = await toForm4(page, 'Airfield Strike')
  const times = title.getByRole('radiogroup', { name: 'Takeoff time' })
  // Airfield Strike's historical hour is 0730: Morning.
  await expect(times.getByRole('radio', { name: 'Morning (0740, suggested)' })).toHaveAttribute('aria-checked', 'true')
  await expect(times.getByRole('radio')).toHaveText(['Morning (0740, suggested)', 'Midday (1200)', 'Dusk (1645)'])
  // Convoy Strike's is 1500: Dusk (a different mission resets the pick).
  title = await toForm4(page, 'Convoy Strike')
  await expect(times.getByRole('radio', { name: 'Dusk (1645, suggested)' })).toHaveAttribute('aria-checked', 'true')
  await times.getByRole('radio', { name: 'Midday (1200)' }).click()
  await expect(times.getByRole('radio', { name: 'Midday (1200)' })).toHaveAttribute('aria-checked', 'true')
  await page.screenshot({ path: `${SHOTS}/a3-form-2-takeoff.png` })
  await title.getByRole('button', { name: 'Next' }).click()
  await title.getByRole('button', { name: 'Next' }).click()
  await title.getByRole('button', { name: 'Launch' }).click()
  await expect(title).toBeHidden()
  // The sky clock runs from the chosen hour (sun.ts `sunClock`): a few sim seconds past 1200, not the scenario's 1500.
  await expect.poll(() => sunHour(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(12)
  expect(await sunHour(page)).toBeLessThan(12.1)
})

test('Form 4 has no rendering controls; the always-visible administration memo links that concern to Settings', async ({ page }) => {
  const title = await toForm4(page, 'Free Flight')
  await expect(title.getByRole('radiogroup', { name: 'Render quality' })).toHaveCount(0)
  await expect(title.getByRole('radiogroup', { name: 'Render scale' })).toHaveCount(0)
  await expect(title.getByLabel('Graphics status')).toContainText(/recommended|custom/)
  await expect(title.getByRole('button', { name: 'Settings' })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/preflight-form-4-summary.png` })
})

test('the graphics check completes before mission selection and persists its combined tier/scale result', async ({ page }) => {
  const title = await toForm4(page, 'Free Flight')
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.qualityProbeChecked())).toBe(true)
  const result = await page.evaluate(() => (window as DiagWindow).__ww2!.graphicsCheck().record)
  console.log(`graphics check record: ${JSON.stringify(result)}`)
  expect(result).not.toBeNull()
  expect(['high', 'medium', 'low']).toContain(result!.recommended.quality)
  expect([0.5, 0.75, 1]).toContain(result!.recommended.renderScale)
  expect(result!.measurements.length).toBeGreaterThan(0)
  expect(JSON.parse((await page.evaluate(() => window.localStorage.getItem('ww2airsim.graphicsCheck.v1')))!)).toEqual(result)
  await expect(title.getByLabel('Graphics status')).toContainText(`${Math.round(result!.recommended.renderScale * 100)}%`)

  await page.reload()
  const again = page.getByRole('dialog', { name: 'Headquarters' })
  await page.waitForFunction(() => document.querySelector('[data-ww2-title]')?.getAttribute('data-ww2-ready') === 'true', undefined, { timeout: 60_000 })
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.graphicsCheck().session)).toBeNull()
  await again.getByRole('button', { name: 'Settings' }).click()
  await expect(page.locator('[data-ww2-settings]:visible').last().locator('.stamp', { hasText: 'Recommended' })).toHaveCount(2)
  await page.screenshot({ path: `${SHOTS}/preflight-settings-recommended.png` })
})
