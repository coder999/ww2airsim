import { test, expect, type Page } from '@playwright/test'
import { percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'

/**
 * Tier 2, Plan 17 radar scope. Same platform and caveats as
 * `ai-pursuit.spec.ts`: the reference GPU on the Windows desktop, never
 * hosted CI.
 *
 * What only this tier can prove: the offscreen render-target pass actually
 * runs in the shipped app and paints the pixel the pure math in
 * `radar.ts`/`radarScope.ts` predicts (via `radarPixelAt`, not a
 * screenshot -- the cloud-shadow-mirroring lesson), `Tab` reaching the
 * selected range through the real keyboard path, and that the sweep angle
 * genuinely freezes on pause rather than jumping ahead by the paused
 * wall-clock duration.
 */
const RANGE = `/?${SCENARIO_PARAM}=pursuit-range`

test.setTimeout(120_000)

const radar = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.radar()!)

test('the scope shows the contact where the math predicts, Tab cycles range, sweep freezes on pause, budget held', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(RANGE)
  await waitForTerrain(page)
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())

  const initial = await radar(page)
  expect(initial.rangeMi).toBe(15)
  expect(initial.contacts.some((c) => c.id === 'pursuer-1')).toBe(true)

  // Read back the actual rendered pixel at the live contact's own reported
  // bearing/range, not a value this spec computed independently -- the
  // claim under test is "the shader painted what radar.ts says", not a
  // second, parallel derivation of the geometry.
  const contact = initial.contacts.find((c) => c.id === 'pursuer-1')!
  const brightness = await page.evaluate(
    ([b, r]) => (window as DiagWindow).__ww2!.radarPixelAt(b, r),
    [contact.bearingRad, contact.rangeMi] as const,
  )
  expect(brightness, 'no pixel painted at the contact\'s own reported bearing/range').not.toBeNull()
  expect(brightness!).toBeGreaterThan(0.05)

  // Tab through the real keyboard path.
  await page.keyboard.press('Tab')
  await expect.poll(() => radar(page).then((r) => r.rangeMi)).toBe(5)
  await page.keyboard.press('Tab')
  await expect.poll(() => radar(page).then((r) => r.rangeMi)).toBe(1)
  await page.keyboard.press('Tab')
  await expect.poll(() => radar(page).then((r) => r.rangeMi)).toBe(15)

  // Pause freezes the sweep exactly, rather than jumping ahead by the
  // paused wall-clock duration.
  await page.keyboard.press('Escape')
  const paused = await radar(page)
  await page.waitForTimeout(1000)
  const stillPaused = await radar(page)
  expect(stillPaused.sweepRad).toBe(paused.sweepRad)
  await page.keyboard.press('Escape')
  await expect.poll(() => radar(page).then((r) => r.sweepRad)).not.toBe(paused.sweepRad)

  await page.screenshot({ path: 'test-results/radar-scope.png' })

  const live = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { gpu: d.gpuFrameTimesMs(), errors: d.validationErrors }
  })
  expect(live.errors, `WebGPU validation errors:\n${JSON.stringify(live.errors, null, 2)}`).toEqual([])
  expect(live.gpu.length).toBeGreaterThan(120)
  const p95 = percentile(live.gpu, 0.95)
  console.log(`radar scope: gpu p95 ${p95.toFixed(3)} ms over ${live.gpu.length} samples`)
  expect(p95).toBeLessThan(6.0)
})
