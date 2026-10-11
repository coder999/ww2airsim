import { mkdir } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { loadAirfield } from '../../tools/content/load.js'
import { percentile, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'

test.describe('Takram clouds in the game', () => {
  test.setTimeout(180_000)
  const consoleErrors: string[] = []
  test.beforeEach(({ page }) => {
    consoleErrors.length = 0
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 500)) })
    page.on('pageerror', error => consoleErrors.push(error.stack ?? error.message))
  })
  test.afterEach(() => expect(consoleErrors, `console errors:\n${consoleErrors.join('\n')}`).toEqual([]))

  const tacloban = loadAirfield('tacloban').runway.center
  const flightUrl = (y: number): string => `${spawnUrl({ x: tacloban.x, y, z: tacloban.z - 8000 })}&launch&cloudRenderer=takram&cloudTier=high`
  const errors = (page: Page): Promise<readonly string[]> => page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)

  test('flies the opt-in renderer with clean WebGPU validation and camera cuts', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto(flightUrl(1800))
    await waitForTerrain(page)
    await page.waitForTimeout(4000)
    const before = await page.evaluate(() => (window as DiagWindow).__ww2!.clouds())
    expect(before.renderer).toBe('takram')
    expect(before.composited).toBe(true)
    expect(before.historyResets).toBeGreaterThan(0)
    await page.keyboard.press('KeyC')
    await page.waitForTimeout(1500)
    const after = await page.evaluate(() => (window as DiagWindow).__ww2!.clouds())
    expect(after.historyResets).toBeGreaterThan(before.historyResets)
    expect(await errors(page)).toEqual([])
  })

  test('captures the final unattended checkpoint when requested', async ({ page }) => {
    test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool, not a correctness test')
    await mkdir('artifacts/clouds-takram-game', { recursive: true })
    await page.setViewportSize({ width: 2560, height: 1440 })
    for (const [name, y] of [['under', 1300], ['inside', 1800], ['above', 3200]] as const) {
      await page.goto(flightUrl(y))
      await waitForTerrain(page)
      await page.waitForTimeout(6000)
      await page.screenshot({ path: `artifacts/clouds-takram-game/${name}.png` })
      expect(await errors(page)).toEqual([])
    }
  })

  test('Takram integrated cloud GPU budget is recorded at 1440p High', async ({ page }) => {
    test.skip(process.env.TAKRAM_GAME_BUDGET !== '1', 'reference-GPU budget run only')
    await page.setViewportSize({ width: 2560, height: 1440 })
    const measure = async (url: string): Promise<{ p95: number; samples: number }> => {
      await page.goto(url)
      await waitForTerrain(page)
      await page.waitForTimeout(2000)
      await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
      await page.waitForTimeout(8000)
      const values = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
      expect(values.length).toBeGreaterThan(120)
      return { p95: percentile(values, 0.95), samples: values.length }
    }
    const off = await measure(`${spawnUrl({ x: tacloban.x, y: 1300, z: tacloban.z - 8000 })}&launch&cloudTier=off`)
    const takram = await measure(flightUrl(1300))
    const native = await page.evaluate(() => (window as DiagWindow).__ww2!.clouds().takramGpuMs)
    expect(native.length).toBeGreaterThan(120)
    const nativeP95 = percentile(native, 0.95)
    console.log(`TAKRAM_GAME_BUDGET three-off=${off.p95.toFixed(3)}ms (${off.samples}) three-with-takram=${takram.p95.toFixed(3)}ms (${takram.samples}) native-takram=${nativeP95.toFixed(3)}ms (${native.length}) estimated-total=${(off.p95 + nativeP95).toFixed(3)}ms`)
    expect(nativeP95).toBeLessThanOrEqual(4.0)
    expect(await errors(page)).toEqual([])
  })
})
