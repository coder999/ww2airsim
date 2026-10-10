import { mkdirSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { percentile, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'
import villages from '../../content/scenery/villages.json' with { type: 'json' }

// L3 Phase 2: GPU frame time and a screenshot over the densest invented
// village, with and without the new ground and the 3D huts. A capture and
// measurement tool, not a test: skipped unless E2E_CAPTURE=1. Run it on the
// reference GPU, under `hwlock ryzen-budget` (docs/testing.md).
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/land-village'
const FT = 0.3048
const village = [...villages].sort((a, b) => b.density * b.radius ** 2 - a.density * a.radius ** 2)[0]!
const VARIANTS = [
  { name: 'shipping', params: {} },
  { name: 'synth2', params: { drape: 'synth2' } },
  { name: 'synth2-villages', params: { drape: 'synth2', villages: 'on' } },
] as const
const VIEWS = [
  { name: 'alt-1000ft', back: 2200, y: 1000 * FT },
  { name: 'alt-3000ft', back: 4500, y: 3000 * FT },
] as const

test.setTimeout(180_000)
for (const view of VIEWS) for (const v of VARIANTS) {
  test(`${view.name} ${v.name}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    await page.setViewportSize({ width: 2560, height: 1440 })
    const url = spawnUrl({ x: village.x - view.back, y: view.y, z: village.z })
    await page.goto(withParams(url, { cloudTier: 'off', oceanTier: 'high', ...v.params }))
    await waitForTerrain(page)
    await page.waitForTimeout(4000)
    await page.evaluate(() => { (window as DiagWindow).__ww2!.resetFrameTimes() })
    await page.waitForTimeout(5000)
    const t = await page.evaluate(() => ({
      gpu: (window as DiagWindow).__ww2!.gpuFrameTimesMs(),
      errors: (window as DiagWindow).__ww2!.validationErrors,
    }))
    expect(t.gpu.length, 'no GPU timestamp samples').toBeGreaterThan(100)
    console.log(`LANDTIME ${view.name} ${v.name} gpu p50 ${percentile(t.gpu, 0.5).toFixed(3)} p95 ${percentile(t.gpu, 0.95).toFixed(3)} ms over ${t.gpu.length}`)
    await page.keyboard.press('Slash')
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${OUT}/${view.name}-${v.name}.png` })
    expect(t.errors).toEqual([])
  })
}
