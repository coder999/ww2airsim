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
  const flightUrl = (y: number, renderer: 'takram' | 'takram-tsl' = 'takram'): string =>
    `${spawnUrl({ x: tacloban.x, y, z: tacloban.z - 8000 })}&launch&cloudRenderer=${renderer}&cloudTier=high`
  const errors = (page: Page): Promise<readonly string[]> => page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)

  for (const renderer of ['takram', 'takram-tsl'] as const) {
    test(`flies the opt-in ${renderer} renderer with clean WebGPU validation and camera cuts`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 })
      await page.goto(flightUrl(1800, renderer))
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
      expect(await errors(page)).toEqual([])
    })
  }

  test('reports separate full-TSL render-pass timings', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto(flightUrl(1300, 'takram-tsl'))
    await waitForTerrain(page)
    await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
    await page.waitForTimeout(4000)
    const samples = await page.evaluate(() => (window as DiagWindow).__ww2!.clouds().takramPassGpuMs)
    expect(samples.march.length).toBeGreaterThan(10)
    expect(samples.temporal.length).toBeGreaterThan(10)
    expect(samples.march.every(value => Number.isFinite(value) && value > 0)).toBe(true)
    expect(samples.temporal.every(value => Number.isFinite(value) && value > 0)).toBe(true)
    console.log(`TAKRAM_TSL_PASS march=${percentile(samples.march, 0.50).toFixed(3)}/${percentile(samples.march, 0.95).toFixed(3)}ms temporal=${percentile(samples.temporal, 0.50).toFixed(3)}/${percentile(samples.temporal, 0.95).toFixed(3)}ms p50/p95 (${samples.march.length}/${samples.temporal.length})`)
    expect(await errors(page)).toEqual([])
  })

  test('captures the final unattended checkpoint when requested', async ({ page }) => {
    test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool, not a correctness test')
    const renderer = process.env.TAKRAM_RENDERER === 'takram-tsl' ? 'takram-tsl' : 'takram'
    const output = `artifacts/clouds-${renderer}-game`
    await mkdir(output, { recursive: true })
    await page.setViewportSize({ width: 2560, height: 1440 })
    for (const [name, y] of [['under', 1300], ['inside', 1800], ['above', 3200]] as const) {
      await page.goto(flightUrl(y, renderer))
      await waitForTerrain(page)
      await page.waitForTimeout(6000)
      await page.screenshot({ path: `${output}/${name}.png` })
      expect(await errors(page)).toEqual([])
    }
  })

  test('Takram native and TSL GPU budgets are recorded at 1440p High', async ({ page }) => {
    test.skip(process.env.TAKRAM_GAME_BUDGET !== '1', 'reference-GPU budget run only')
    await page.setViewportSize({ width: 2560, height: 1440 })
    const measure = async (url: string): Promise<{ p50: number; p95: number; samples: number }> => {
      await page.goto(url)
      await waitForTerrain(page)
      await page.waitForTimeout(2000)
      await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
      await page.waitForTimeout(12000)
      const values = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
      expect(values.length).toBeGreaterThan(120)
      return { p50: percentile(values, 0.50), p95: percentile(values, 0.95), samples: values.length }
    }
    const off = await measure(`${spawnUrl({ x: tacloban.x, y: 1300, z: tacloban.z - 8000 })}&launch&cloudTier=off`)
    const takram = await measure(flightUrl(1300, 'takram'))
    const native = await page.evaluate(() => (window as DiagWindow).__ww2!.clouds().takramGpuMs)
    expect(native.length).toBeGreaterThan(120)
    const nativeP50 = percentile(native, 0.50)
    const nativeP95 = percentile(native, 0.95)
    const tsl = await measure(flightUrl(1300, 'takram-tsl'))
    const tslPasses = await page.evaluate(() => (window as DiagWindow).__ww2!.clouds().takramPassGpuMs)
    expect(tslPasses.march.length).toBeGreaterThan(120)
    expect(tslPasses.temporal.length).toBeGreaterThan(120)
    const tslMarchP50 = percentile(tslPasses.march, 0.50)
    const tslMarchP95 = percentile(tslPasses.march, 0.95)
    const tslTemporalP50 = percentile(tslPasses.temporal, 0.50)
    const tslTemporalP95 = percentile(tslPasses.temporal, 0.95)
    // The native pass submits raw WebGPU work outside Three's timestamp pool,
    // so add that direct measurement to the same cloud-on frame's Three time.
    // Cloud-off remains a stability control; it omits the cloud shadow and
    // graph/composite work shared by the two real renderer paths.
    const nativeTotal = takram.p95 + nativeP95
    const tslRatio = tsl.p95 / nativeTotal
    console.log(`TAKRAM_GAME_BUDGET three-off=${off.p50.toFixed(3)}/${off.p95.toFixed(3)}ms p50/p95 (${off.samples}) three-with-native=${takram.p50.toFixed(3)}/${takram.p95.toFixed(3)}ms (${takram.samples}) native-cloud-pass=${nativeP50.toFixed(3)}/${nativeP95.toFixed(3)}ms (${native.length}) native-estimated-total-p95=${nativeTotal.toFixed(3)}ms tsl-total=${tsl.p50.toFixed(3)}/${tsl.p95.toFixed(3)}ms (${tsl.samples}) tsl-march=${tslMarchP50.toFixed(3)}/${tslMarchP95.toFixed(3)}ms (${tslPasses.march.length}) tsl-temporal=${tslTemporalP50.toFixed(3)}/${tslTemporalP95.toFixed(3)}ms (${tslPasses.temporal.length}) tsl/native-p95=${tslRatio.toFixed(3)}x`)
    expect(nativeP95).toBeLessThanOrEqual(4.0)
    expect(tsl.p95).toBeLessThanOrEqual(8.33)
    expect(await errors(page)).toEqual([])
  })
})
