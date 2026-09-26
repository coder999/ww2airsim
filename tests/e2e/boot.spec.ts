import { expect, test } from '@playwright/test'

/** Loading spec §A.4. Long tasks are observed from navigation (buffered). */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __lt: [number, number][] }
    w.__lt = []
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__lt.push([e.startTime, e.duration])
    }).observe({ type: 'longtask', buffered: true })
  })
})

test('controls are locked until ready, then the first click selects a pilot', async ({ page }) => {
  // domcontentloaded, not load: 'load' waits for the 2 MB title art and can
  // land after the unlock, so the locked-state assertions below would race.
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title.getByRole('button', { name: 'Settings' })).toBeDisabled()
  await expect(title.getByRole('progressbar')).toBeVisible()
  await page.waitForSelector('[data-ww2-title][data-ww2-ready="true"]', { timeout: 60_000 })
  const readyAtMs = await page.evaluate(() => performance.now())
  console.log(`navigation to ready: ${Math.round(readyAtMs)} ms`)
  await expect(title.getByRole('progressbar')).toBeHidden()
  await expect(title.getByRole('button', { name: 'Settings' })).toBeEnabled()
  // Create a pilot the instant the lock lifts; the row must take the click.
  await title.getByRole('button', { name: 'New pilot' }).click()
  await title.getByPlaceholder('Pilot name').fill('Boot Check')
  await title.getByRole('button', { name: 'Add' }).click()
  await expect(title.locator('button[aria-pressed="true"]')).toHaveText('Boot Check')
})

test('the longest main-thread task before ready is under 1 500 ms', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('[data-ww2-title][data-ww2-ready="true"]', { timeout: 60_000 })
  const longest = await page.evaluate(() =>
    Math.max(0, ...(window as unknown as { __lt: [number, number][] }).__lt.map(([, d]) => d)))
  console.log(`longest task before ready: ${Math.round(longest)} ms`)
  expect(longest).toBeLessThan(1_500)
})
