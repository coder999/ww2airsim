import { expect, test, type Page } from '@playwright/test'
import { percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { VIEWS, withParams } from './views.js'

/**
 * Cloud Fidelity II §3.1: camera motion must not bring back the scene-wide
 * velocity MRT tax. A same-build audit on 2026-09-25 measured 3.849 ms p50
 * with the original MRT and 3.595 ms with a zero-motion TRAA source and no
 * motion pass. The accepted ceiling leaves 0.15 ms for reconstruction while
 * requiring at least 0.10 ms back from the original path.
 */
const ZERO_MOTION_REFERENCE_P50_MS = 3.595
const RECONSTRUCTION_TOLERANCE_MS = 0.15

test.setTimeout(120_000)

async function frameP50(page: Page): Promise<{ p50: number; n: number }> {
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
  await page.waitForTimeout(6000)
  const samples = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
  return { p50: percentile(samples, 0.5), n: samples.length }
}

test('camera motion stays within the no-MRT 4K budget', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text().slice(0, 400))
  })
  page.on('pageerror', (error) => errors.push(error.message))

  const view = VIEWS.find((candidate) => candidate.name === 'in-deck-1900')!
  await page.setViewportSize({ width: 3840, height: 2160 })
  await page.goto(withParams(view.url, { cloudTier: 'off', oceanTier: 'high' }))
  await waitForTerrain(page)
  await page.waitForTimeout(3000)

  const { p50, n } = await frameP50(page)
  console.log(`MOTION_BUDGET4K clouds-off in-deck-1900 p50=${p50.toFixed(3)} n=${n}`)
  expect(errors, errors.join('\n')).toEqual([])
  expect(n).toBeGreaterThan(30)
  expect(p50).toBeLessThanOrEqual(ZERO_MOTION_REFERENCE_P50_MS + RECONSTRUCTION_TOLERANCE_MS)
})
