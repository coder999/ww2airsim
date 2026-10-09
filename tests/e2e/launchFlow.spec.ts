import { test, expect, type Locator, type Page } from '@playwright/test'
import { wholeLabel, type DiagWindow } from './harness.js'

/**
 * A3 and A4 (docs/superpowers/plans/2026-10-09-a3-a4-launch.md): Form 2's
 * takeoff time reaches the sky, Form 4's render-quality row is the same
 * explicit pick as Settings, and the quality probe waits for the flight.
 */
test.setTimeout(180_000)

const SHOTS = 'test-results'
const sunHour = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.sun().timeOfDay)

async function toOrders(page: Page): Promise<Locator> {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  await page.waitForFunction(() => document.querySelector('[data-ww2-title]')?.getAttribute('data-ww2-ready') === 'true', undefined, { timeout: 60_000 })
  await title.getByRole('button', { name: 'New pilot' }).click()
  await title.getByPlaceholder('Pilot name').fill('Launch Pilot')
  await title.getByRole('button', { name: 'Add' }).click()
  await title.getByRole('button', { name: 'New game' }).click()
  return title
}

test('Form 2 offers Morning, Midday and Dusk, suggests the one nearest the historical hour, and the chosen hour is the hour flown', async ({ page }) => {
  const title = await toOrders(page)
  const times = title.getByRole('radiogroup', { name: 'Takeoff time' })
  await title.getByRole('radiogroup', { name: 'Scenario' }).getByRole('radio', { name: wholeLabel('Airfield Strike') }).click()
  // Airfield Strike's historical hour is 0730: Morning.
  await expect(times.getByRole('radio', { name: 'Morning (0740, suggested)' })).toHaveAttribute('aria-checked', 'true')
  await expect(times.getByRole('radio')).toHaveText(['Morning (0740, suggested)', 'Midday (1200)', 'Dusk (1645)'])
  // Convoy Strike's is 1500: Dusk, and a mission change resets the pick.
  await times.getByRole('radio', { name: 'Midday (1200)' }).click()
  await title.getByRole('radiogroup', { name: 'Scenario' }).getByRole('radio', { name: wholeLabel('Convoy Strike') }).click()
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

test('Form 4 offers render quality: a pick there is applied and saved, as in Settings', async ({ page }) => {
  const title = await toOrders(page)
  await title.getByRole('button', { name: 'Next' }).click()
  await title.getByRole('button', { name: 'Next' }).click()
  const group = title.getByRole('radiogroup', { name: 'Render quality' })
  await expect(group.getByRole('radio')).toHaveCount(3)
  await expect(group.getByRole('radio', { name: 'High' })).toHaveAttribute('aria-checked', 'true')
  await expect(title.getByText(/Not measured yet/)).toBeVisible()
  await group.getByRole('radio', { name: 'Medium' }).click()
  await expect(group.getByRole('radio', { name: 'Medium' })).toHaveAttribute('aria-checked', 'true')
  await page.screenshot({ path: `${SHOTS}/a4-form-4-quality.png` })
  const saved = await page.evaluate(() => window.localStorage.getItem('ww2airsim.quality.v1'))
  expect(JSON.parse(saved!)).toEqual({ ocean: 'medium', scenery: 'medium', clouds: 'medium', fx: 'medium' })
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.oceanTier()), { timeout: 30_000 }).toBe('medium')
  // The probe may still measure this flight, for the stamp, but never overrides the pick (spec §5 step 3).
  await title.getByRole('button', { name: 'Launch' }).click()
  await page.waitForFunction(() => (window as DiagWindow).__ww2!.qualityProbeChecked(), undefined, { timeout: 90_000 })
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.oceanTier())).toBe('medium')
})

test('the quality probe waits for the flight, then its verdict is stamped on Form 4 after a reload', async ({ page }) => {
  const title = await toOrders(page)
  // The title, the forms: no measurement, however long they stay up.
  await page.waitForTimeout(5_000)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.qualityProbeChecked())).toBe(false)
  const verdict = page.waitForEvent('console', { predicate: (m) => m.text().startsWith('quality: measured'), timeout: 60_000 })
  await title.getByRole('button', { name: 'Next' }).click()
  await title.getByRole('button', { name: 'Next' }).click()
  await title.getByRole('button', { name: 'Launch' }).click()
  console.log((await verdict).text())
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.qualityProbeChecked())).toBe(true)
  const recommended = await page.evaluate(() => window.localStorage.getItem('ww2airsim.qualityRecommended.v1'))
  expect(['high', 'medium', 'low']).toContain(recommended)

  await page.reload()
  const again = page.getByRole('dialog', { name: 'Title' })
  await page.waitForFunction(() => document.querySelector('[data-ww2-title]')?.getAttribute('data-ww2-ready') === 'true', undefined, { timeout: 60_000 })
  await again.locator('button[aria-pressed]').first().click()
  await again.getByRole('button', { name: 'New game' }).click()
  await again.getByRole('button', { name: 'Next' }).click()
  await again.getByRole('button', { name: 'Next' }).click()
  const label = { high: 'High', medium: 'Medium', low: 'Low' }[recommended as 'high' | 'medium' | 'low']
  await expect(again.getByRole('radiogroup', { name: 'Render quality' }).getByRole('radio', { name: `${label} (recommended)` })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/a4-form-4-recommended.png` })
})
