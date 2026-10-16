import { expect, test } from '@playwright/test'
import { percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { cloudOffUrl, takramFlightUrl, validationErrors } from './takramGameHarness.js'

test('Takram native and TSL GPU budgets are recorded at 1440p High', async ({ page }) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 2560, height: 1440 })
  const measure = async (url: string): Promise<{ p50: number; p95: number; samples: number }> => {
    await page.goto(url + (process.env.BUDGET_PARAMS ? '&' + process.env.BUDGET_PARAMS : ''))
    await waitForTerrain(page)
    await page.waitForTimeout(2000)
    await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
    await page.waitForTimeout(12000)
    const values = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
    expect(values.length).toBeGreaterThan(120)
    return { p50: percentile(values, 0.50), p95: percentile(values, 0.95), samples: values.length }
  }

  const off = await measure(cloudOffUrl(1300))
  const takram = await measure(takramFlightUrl(1300, 'takram'))
  const native = await page.evaluate(() => (window as DiagWindow).__ww2!.clouds().takramGpuMs)
  expect(native.length).toBeGreaterThan(120)
  const nativeP50 = percentile(native, 0.50)
  const nativeP95 = percentile(native, 0.95)
  const tsl = await measure(takramFlightUrl(1300, 'takram-tsl'))
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
  expect(await validationErrors(page)).toEqual([])
})
