import { expect, test } from '@playwright/test'
import { percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { takramFlightUrl, validationErrors } from './takramGameHarness.js'

test.describe('Takram clouds in the game', () => {
  test.setTimeout(180_000)
  const consoleErrors: string[] = []
  test.beforeEach(({ page }) => {
    consoleErrors.length = 0
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500)) })
    page.on('pageerror', error => consoleErrors.push(error.stack ?? error.message))
  })
  test.afterEach(() => expect(consoleErrors, `console errors:\n${consoleErrors.join('\n')}`).toEqual([]))

  for (const renderer of ['takram', 'takram-tsl'] as const) {
    test(`flies the explicit ${renderer} renderer with clean WebGPU validation and camera cuts`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 })
      await page.goto(takramFlightUrl(1800, renderer))
      await waitForTerrain(page)
      await page.waitForTimeout(4000)
      const before = await page.evaluate(() => (window as DiagWindow).__ww2!.clouds())
      expect(before.renderer).toBe(renderer)
      expect(before.composited).toBe(true)
      expect(before.historyResets).toBeGreaterThan(0)
      await page.keyboard.press('KeyC')
      await page.waitForTimeout(1500)
      const after = await page.evaluate(() => (window as DiagWindow).__ww2!.clouds())
      expect(after.historyResets).toBeGreaterThan(before.historyResets)
      expect(await validationErrors(page)).toEqual([])
    })
  }

  test('reports separate full-TSL render-pass timings', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto(takramFlightUrl(1300, 'takram-tsl'))
    await waitForTerrain(page)
    await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
    await page.waitForTimeout(4000)
    const samples = await page.evaluate(() => (window as DiagWindow).__ww2!.clouds().takramPassGpuMs)
    expect(samples.march.length).toBeGreaterThan(10)
    expect(samples.temporal.length).toBeGreaterThan(10)
    expect(samples.march.every(value => Number.isFinite(value) && value > 0)).toBe(true)
    expect(samples.temporal.every(value => Number.isFinite(value) && value > 0)).toBe(true)
    console.log(`TAKRAM_TSL_PASS march=${percentile(samples.march, 0.50).toFixed(3)}/${percentile(samples.march, 0.95).toFixed(3)}ms temporal=${percentile(samples.temporal, 0.50).toFixed(3)}/${percentile(samples.temporal, 0.95).toFixed(3)}ms p50/p95 (${samples.march.length}/${samples.temporal.length})`)
    expect(await validationErrors(page)).toEqual([])
  })
})
