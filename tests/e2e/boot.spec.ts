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

test('controls are locked until ready, then Headquarters takes the first click', async ({ page }) => {
  // domcontentloaded, not load: 'load' waits for the 2 MB title art and can
  // land after the unlock, so the locked-state assertions below would race.
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const title = page.getByRole('dialog', { name: 'Title' })
  const hq = page.getByRole('dialog', { name: 'Headquarters' })
  await expect(page.locator('[data-ww2-title][data-ww2-ready="false"]')).toBeAttached()
  await expect(title.getByRole('progressbar')).toBeVisible()
  // A1: while booting the art shows alone; every memo, and so every control, waits for ready (Headquarters included).
  await expect(title.getByRole('button', { name: 'Settings' })).toBeHidden()
  await expect(hq).toHaveCount(0)
  await page.waitForSelector('[data-ww2-title][data-ww2-ready="true"]', { timeout: 60_000 })
  const readyAtMs = await page.evaluate(() => performance.now())
  console.log(`navigation to ready: ${Math.round(readyAtMs)} ms`)
  await expect(title.getByRole('progressbar')).toBeHidden()
  await expect(hq).toBeVisible()
  await expect(hq.getByRole('button', { name: 'Settings' })).toBeEnabled()
  // Create a campaign the instant Headquarters appears; the button must take the click.
  await hq.getByRole('button', { name: 'New campaign' }).click()
  await hq.getByPlaceholder('Player name').fill('Boot Check')
  await hq.getByRole('radiogroup', { name: 'Service' }).getByRole('radio', { name: /U\.S\. Navy/ }).click()
  await hq.getByRole('button', { name: 'Next' }).click()
  await hq.getByRole('button', { name: 'Enlist' }).click()
  await expect(hq.getByText('Air Group Headquarters')).toBeVisible()
})

test('the longest main-thread task before ready is under 1 500 ms', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('[data-ww2-title][data-ww2-ready="true"]', { timeout: 60_000 })
  const longest = await page.evaluate(() =>
    Math.max(0, ...(window as unknown as { __lt: [number, number][] }).__lt.map(([, d]) => d)))
  console.log(`longest task before ready: ${Math.round(longest)} ms`)
  expect(longest).toBeLessThan(1_500)
})
