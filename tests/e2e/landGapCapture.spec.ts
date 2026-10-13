import { mkdirSync } from 'node:fs'
import { test, expect } from '@playwright/test'
import { waitForTerrain, spawnUrl, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

// L3 Phase 0b: shipping terrain, the best existing drape and the whole-map
// synthetic ground at the same views and three altitudes, for a human to read
// against OpenSkyFlight (docs/superpowers/plans/2026-10-09-l3-land-quality.md).
// A capture tool, not a test: skipped unless E2E_CAPTURE=1 (docs/testing.md).
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/land-gap'
// Centre of the synthsr bake (content/drape-spike/drape-synthsr.json), heading east.
const C = { x: -31629, z: -47829 }
const FT = 0.3048
const lightingCapture = process.env.LAND_LIGHTING_CAPTURE === '1'
const VIEWS = lightingCapture ? [
  { name: 'ridge-morning', x: -63000, z: -32000, y: 6000 * FT, hour: 7.5 },
  { name: 'ridge-noon', x: -63000, z: -32000, y: 6000 * FT, hour: 12 },
  { name: 'ridge-afternoon', x: -63000, z: -32000, y: 6000 * FT, hour: 16.5 },
] : [
  { name: 'alt-1000ft', x: C.x - 5000, y: 1000 * FT },
  { name: 'alt-4000ft', x: C.x - 6000, y: 4000 * FT },
  { name: 'alt-13000ft', x: C.x - 6500, y: 13000 * FT },
] as const
const VARIANTS = (process.env.DRAPE_VARIANTS ?? (lightingCapture ? 'off,on' : 'off,synth,synthsr')).split(',')
test.setTimeout(150_000)
for (const view of VIEWS) for (const v of VARIANTS) {
  test(`${view.name} ${v}`, async ({ page }) => {
    mkdirSync(OUT, { recursive: true })
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)) })
    page.on('pageerror', e => errors.push(e.message))
    await page.setViewportSize({ width: 1920, height: 1080 })
    const url = spawnUrl({ x: view.x, y: view.y, z: 'z' in view ? view.z : C.z })
    await page.goto(withParams(url, { sceneryView: '1', cloudTier: 'off', oceanTier: 'high',
      ...(lightingCapture ? { terrainLighting: v, timeOfDay: String('hour' in view ? view.hour : 12), launch: '1' }
        : v === 'off' ? {} : { drape: v }) }))
    if (lightingCapture) {
      // Quick launch + sceneryView deliberately stays at tick zero without
      // a title dialog, so the ordinary startGame helper cannot detect it.
      await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 30000 })
    } else await waitForTerrain(page)
    if (lightingCapture && v !== 'off') await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.terrainLighting()), { timeout: 30000 })
      .toMatchObject({ mode: v, ready: true, error: null })
    await page.waitForTimeout(3000)
    await page.waitForTimeout(800)
    await page.screenshot(lightingCapture
      ? { path: `${OUT}/${view.name}-${v}.jpg`, type: 'jpeg', quality: 92 }
      : { path: `${OUT}/${view.name}-${v}.png` })
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
    expect(errors).toEqual([])
  })
}
