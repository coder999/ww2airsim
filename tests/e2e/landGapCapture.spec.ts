import { mkdirSync, writeFileSync } from 'node:fs'
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
const canopyCapture = process.env.LAND_CANOPY_CAPTURE === '1'
const distantCapture = process.env.DISTANT_TREES_CAPTURE === '1'
const treeFadeCapture = process.env.TREE_FADE_CAPTURE === '1'
const VIEWS = canopyCapture || treeFadeCapture || distantCapture ? [
  { name: 'low-noon', x: -36629, z: -47829, y: 1000 * FT, hour: 12 },
  { name: 'ridge-noon', x: -63000, z: -32000, y: 6000 * FT, hour: 12 },
  { name: 'high-noon', x: -38129, z: -47829, y: 13000 * FT, hour: 12 },
] : lightingCapture ? [
  { name: 'ridge-morning', x: -63000, z: -32000, y: 6000 * FT, hour: 7.5 },
  { name: 'ridge-noon', x: -63000, z: -32000, y: 6000 * FT, hour: 12 },
  { name: 'ridge-afternoon', x: -63000, z: -32000, y: 6000 * FT, hour: 16.5 },
] : [
  { name: 'alt-1000ft', x: C.x - 5000, y: 1000 * FT },
  { name: 'alt-4000ft', x: C.x - 6000, y: 4000 * FT },
  { name: 'alt-13000ft', x: C.x - 6500, y: 13000 * FT },
] as const
const VARIANTS = (process.env.DRAPE_VARIANTS ?? (treeFadeCapture ? 'whole,pixel' : lightingCapture || canopyCapture || distantCapture ? 'off,on' : 'off,synth,synthsr')).split(',')
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
      canopy: canopyCapture ? v : 'off', treeFade: distantCapture ? 'soft' : treeFadeCapture ? v : 'whole', distantTrees: distantCapture ? v : 'off',
      ...(canopyCapture || treeFadeCapture || distantCapture ? { terrainLighting: 'off', timeOfDay: '12', launch: '1' } : {}),
      ...(lightingCapture ? { terrainLighting: v, timeOfDay: String('hour' in view ? view.hour : 12), launch: '1' }
        : canopyCapture || treeFadeCapture || distantCapture || v === 'off' ? {} : { drape: v }) }))
    if (lightingCapture || canopyCapture || treeFadeCapture || distantCapture) {
      // Quick launch + sceneryView deliberately stays at tick zero without
      // a title dialog, so the ordinary startGame helper cannot detect it.
      await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 30000 })
    } else await waitForTerrain(page)
    if (lightingCapture && v !== 'off') await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.terrainLighting()), { timeout: 30000 })
      .toMatchObject({ mode: v, ready: true, error: null })
    if (canopyCapture && v !== 'off') await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.canopy()), { timeout: 30000 })
      .toMatchObject({ enabled: true, ready: true, error: null })
    if (distantCapture) await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.vegetation()?.distant), { timeout: 30000 }).toMatchObject({ enabled: v === 'on', ready: true })
    await page.waitForTimeout(3000)
    await page.waitForTimeout(800)
    if (distantCapture) writeFileSync(`${OUT}/${view.name}-${v}.json`, JSON.stringify(await page.evaluate(() => (window as DiagWindow).__ww2!.vegetation()), null, 2) + '\n')
    await page.screenshot(lightingCapture || canopyCapture || treeFadeCapture || distantCapture
      ? { path: `${OUT}/${view.name}-${v}.jpg`, type: 'jpeg', quality: 92 }
      : { path: `${OUT}/${view.name}-${v}.png` })
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
    expect(errors).toEqual([])
  })
}

if (canopyCapture || treeFadeCapture || distantCapture) for (const variant of VARIANTS) test(`${distantCapture ? 'distant trees' : treeFadeCapture ? 'tree fade' : 'canopy'} moving pass ${variant}`, async ({ browser, baseURL }) => {
  mkdirSync(OUT, { recursive: true })
  const context = await browser.newContext({ ...(baseURL ? { baseURL } : {}), viewport: { width: 1280, height: 720 },
    recordVideo: { dir: `${OUT}/video`, size: { width: 1280, height: 720 } } })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push(e.message))
  const video = page.video()!
  try {
    await page.goto(withParams(spawnUrl({ x: -36629, z: -47829, y: 1500 * FT }), {
      sceneryView: '1', look: '0,-15', launch: '1', timeOfDay: '12', cloudTier: 'off', oceanTier: 'high', canopy: canopyCapture ? variant : 'off', treeFade: distantCapture ? 'soft' : treeFadeCapture ? variant : 'whole', distantTrees: distantCapture ? variant : 'off', terrainLighting: 'off',
    }))
    await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null)
    if (canopyCapture && variant !== 'off') await page.waitForFunction(() => (window as DiagWindow).__ww2!.canopy().ready)
    if (treeFadeCapture) await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.vegetation())).toMatchObject({ fadeMode: variant, fadeStartM: 1400, fadeEndM: 1850 })
    if (distantCapture) await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.vegetation()?.distant), { timeout: 30000 }).toMatchObject({ enabled: variant === 'on', ready: true })
    await page.waitForTimeout(3000)
    const before = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraftPositionM())
    const tick = await page.evaluate(() => (window as DiagWindow).__ww2!.tick())
    await page.keyboard.press('Escape')
    // Match simulated travel rather than wall time: recording can drop frames.
    await page.waitForFunction(start => (window as DiagWindow).__ww2!.tick() >= start + 600, tick)
    const after = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraftPositionM())
    if (distantCapture) writeFileSync(`${OUT}/moving-${variant}.json`, JSON.stringify(await page.evaluate(() => (window as DiagWindow).__ww2!.vegetation()), null, 2) + '\n')
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(400)
    await page.screenshot({ path: `${OUT}/moving-${variant}.jpg`, type: 'jpeg', quality: 92 })
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
    expect(errors).toEqual([])
  } finally {
    await context.close()
    await video.saveAs(`${OUT}/moving-${variant}.webm`)
    await video.delete()
  }
})
