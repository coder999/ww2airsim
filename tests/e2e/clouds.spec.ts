import { test, expect, type Page } from '@playwright/test'
import { percentile, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { CLOUD_TIER_PARAM } from '../../src/render/scene/clouds.js'
import { loadAirfield } from '../../tools/content/load.js'

/**
 * Tier 2, clouds (Plan 16a). Screenshots are READ by the executor, not just
 * taken; the numbers are the budget of design §6. Same platform and caveats
 * as `adapter.spec.ts`.
 */
test.setTimeout(180_000)
const errors = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)

/**
 * A TSL graph that fails to BUILD is not a WebGPU validation error: three
 * logs `THREE.TSL: ...` to the console, substitutes a blank material, and
 * the frame comes out black with `validationErrors` empty. Found on the
 * first GPU run of this spec (2026-09-19), which passed every assertion over
 * a black screen. So every case here also fails on a three console error.
 */
const threeErrors: string[] = []
test.beforeEach(({ page }) => {
  threeErrors.length = 0
  page.on('console', (m) => { if (m.type() === 'error') threeErrors.push(m.text().slice(0, 400)) })
  page.on('pageerror', (e) => threeErrors.push(e.message))
})
test.afterEach(() => {
  expect(threeErrors, `console errors:\n${threeErrors.join('\n')}`).toEqual([])
})
const gpuP95 = async (page: Page): Promise<{ p95: number; n: number }> => {
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
  // Six seconds, not four: while sampling, main.ts serializes each frame on
  // its timestamp resolve, so a heavier frame yields FEWER samples per second
  // (111 in 4 s at high on 2026-09-19, against the 120 the budget wants).
  await page.waitForTimeout(6000)
  const gpu = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
  return { p95: percentile(gpu, 0.95), n: gpu.length }
}
/** Over the gulf 8 km north of Tacloban's strip: open water below, the deck above or around. */
const TACLOBAN = loadAirfield('tacloban').runway.center
const OVER_GULF = { x: TACLOBAN.x, z: TACLOBAN.z - 8000 }

test('from the chocks: the deck overhead, the runway unpainted, two layers reported', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  await waitForTerrain(page)
  const c = await page.evaluate(() => (window as DiagWindow).__ww2!.clouds())
  expect(c.layers.map((l) => l.kind)).toEqual(['cumulus', 'cirrus'])
  expect(c.tier).not.toBe('off')
  await page.screenshot({ path: 'test-results/clouds-chocks.png' })
  await page.keyboard.down('Numpad8')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'test-results/clouds-chocks-up.png' })
  await page.keyboard.up('Numpad8')
  expect(await errors(page)).toEqual([])
})

test('inside the deck in cockpit view: whiteout outside, panel visible', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(spawnUrl({ ...OVER_GULF, y: 1900 }))
  await waitForTerrain(page)
  await page.keyboard.press('KeyC')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: 'test-results/clouds-inside-cockpit.png' })
  expect(await errors(page)).toEqual([])
})

test('above the deck: cloud tops over the gulf under the cirrus sheet', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(spawnUrl({ ...OVER_GULF, y: 3200 }))
  await waitForTerrain(page)
  await page.screenshot({ path: 'test-results/clouds-above-level.png' })
  await page.keyboard.down('Numpad2')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'test-results/clouds-above-down.png' })
  await page.keyboard.up('Numpad2')
  expect(await errors(page)).toEqual([])
})

test('budget tripwire: level under the deck stays below the superseded 120 Hz frame', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  const at = { ...OVER_GULF, y: 1300 }
  await page.goto(`${spawnUrl(at)}&${CLOUD_TIER_PARAM}=off`)
  await waitForTerrain(page)
  await page.waitForTimeout(1500)
  const off = await gpuP95(page)
  await page.goto(`${spawnUrl(at)}&${CLOUD_TIER_PARAM}=high`)
  await waitForTerrain(page)
  await page.waitForTimeout(1500)
  const high = await gpuP95(page)
  await page.screenshot({ path: 'test-results/clouds-budget-view.png' })
  console.log(`clouds off p95 ${off.p95.toFixed(3)} ms (${off.n}); high p95 ${high.p95.toFixed(3)} ms (${high.n}); cost ${(high.p95 - off.p95).toFixed(3)} ms`)
  expect(off.n).toBeGreaterThan(120)
  expect(high.n).toBeGreaterThan(120)
  // The two page loads make their p95 difference too noisy to be an upper
  // bound (Cloud Fidelity II §3.4 measured 3.47-3.83 ms incremental). The
  // authoritative High gate is budget4k.spec.ts's 16.67 ms (Mark's 60 Hz
  // decision); this older 1440p total remains a tighter regression tripwire.
  expect(high.p95).toBeLessThan(8.33)
  expect(await errors(page)).toEqual([])
})

// The title holds the simulation at the exact spawn, so these images can be
// compared between shader revisions without flight/drift changing the field.
for (const tier of ['high', 'medium', 'low'] as const) {
  test(`distant cloud edges at ${tier}: stable under-deck and above-deck views`, async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1440 })
    for (const y of [1300, 3200]) {
      await page.goto(`${spawnUrl({ ...OVER_GULF, y })}&${CLOUD_TIER_PARAM}=${tier}`)
      await page.waitForFunction(() => (window as DiagWindow).__ww2?.groundHeightM() !== null
        && (window as DiagWindow).__ww2?.groundHeightM() !== undefined)
      await expect(page.getByRole('dialog', { name: 'Title' })).toBeVisible()
      await page.getByRole('dialog', { name: 'Title' }).evaluate((el) => { el.style.visibility = 'hidden' })
      await page.waitForTimeout(1000)
      expect(await page.evaluate(() => (window as DiagWindow).__ww2!.clouds().tier)).toBe(tier)
      expect(await errors(page)).toEqual([])
      expect(await page.evaluate(() => (window as DiagWindow).__ww2!.tick())).toBe(0)
      const png = await page.screenshot({ path: `test-results/clouds-distant-${tier}-${y}.png` })
      if (tier === 'high' && y === 1300) {
        // A pixel-noise guard, not an image golden: the fixed horizon strip
        // measured 8.02 gray levels of horizontal high-frequency residual at
        // 0c96e76, versus ~1.3 with bounded sampling (RX 6700 XT, 2026-09-19).
        // Decode our screenshot in the browser to avoid a PNG dependency.
        const quality = await page.evaluate(async (base64) => {
          const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob())
          const canvas = document.createElement('canvas')
          canvas.width = bitmap.width
          canvas.height = bitmap.height
          const ctx = canvas.getContext('2d')!
          ctx.drawImage(bitmap, 0, 0)
          bitmap.close()
          const { data, width } = ctx.getImageData(80, 610, 2401, 105)
          const gray = (pixel: number): number => (data[pixel * 4]! + data[pixel * 4 + 1]! + data[pixel * 4 + 2]!) / 3
          let residual = 0, count = 0, darkest = 255, brightest = 0
          for (let row = 0; row < 105; row++) {
            for (let x = 1; x < width - 1; x++) {
              const p = row * width + x, g = gray(p)
              residual += Math.abs(g - (gray(p - 1) + gray(p + 1)) / 2)
              darkest = Math.min(darkest, g)
              brightest = Math.max(brightest, g)
              count++
            }
          }
          return { residual: residual / count, range: brightest - darkest }
        }, png.toString('base64'))
        console.log('distant cloud pixel quality', quality)
        expect(quality.residual, 'distant clouds became pixel stipple again').toBeLessThan(3)
        // Re-baselined 2026-09-25, photoreal render pass Task 5 (AgX
        // tonemapping): was > 40, measured 36.0 because the cloud tops in the
        // strip used to clip at 254.7 gray and AgX now rolls them off to ~206
        // (toneMap=none of the same build still measures 78.3, as at Task 4).
        // The guard is unchanged in kind: a blank strip (cloudTier=off, same
        // view, AgX) measures 2.7, so half the clouded range still separates
        // the two by a wide margin, as 40 did against 78.3.
        expect(quality.range, 'a blank strip must not pass as smooth clouds').toBeGreaterThan(18)
      }
    }
  })
}

// Photoreal Task 3 (2026-09-24): the march now renders into a reduced-
// resolution target that must follow the canvas. READ all three: no
// stretched or stale-size frame after either resize.
test('resize: the cloud pass follows the canvas down and back up', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(spawnUrl({ ...OVER_GULF, y: 1900 }))
  await waitForTerrain(page)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'test-results/clouds-resize-1440.png' })
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'test-results/clouds-resize-720.png' })
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'test-results/clouds-resize-back.png' })
  expect(await errors(page)).toEqual([])
})

// Photoreal Task 3: the chase-view airframe against the deck from below.
// READ: the airframe edges against cloud as sharp as against clear sky, with
// no low-resolution halo (the composite's depth-aware upsample).
test('near silhouette: chase-view airframe under the deck', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(spawnUrl({ ...OVER_GULF, y: 1200 }))
  await waitForTerrain(page)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'test-results/clouds-silhouette-chase.png' })
  expect(await errors(page)).toEqual([])
})

// Photoreal Task 11 (spec §4.4 acceptance): the sun ~15 deg up behind the
// deck, camera at 1200 m facing it. READ: bright rims (the dual-lobe phase's
// silver lining) on the cumulus nearest the sun, and bloom not blowing the
// frame out. The look is a quarter-turn snap (input/lookAround.ts), chosen
// from `__ww2.sun()`'s azimuth against the spawn heading (090).
test('sun behind cloud: facing the late-afternoon sun from under the deck', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(`${spawnUrl({ ...OVER_GULF, y: 1200 })}&timeOfDay=16.8`)
  await waitForTerrain(page)
  const sun = await page.evaluate(() => (window as DiagWindow).__ww2!.sun())
  expect(sun.elevationDeg).toBeGreaterThan(10)
  expect(sun.elevationDeg).toBeLessThan(20)
  const relative = ((sun.azimuthDeg - 90 + 540) % 360) - 180
  const key = Math.abs(relative) < 45 ? null : Math.abs(relative) > 135 ? 'Numpad0' : relative > 0 ? 'Numpad6' : 'Numpad4'
  const looked = key === null ? 0 : key === 'Numpad0' ? 180 : key === 'Numpad6' ? 90 : -90
  const off = Math.abs(((relative - looked + 540) % 360) - 180)
  console.log(`sun az ${sun.azimuthDeg.toFixed(1)} el ${sun.elevationDeg.toFixed(1)}; look ${key ?? 'ahead'}; sun ${off.toFixed(1)} deg off the look axis`)
  expect(off).toBeLessThan(45)
  if (key !== null) await page.keyboard.down(key)
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'test-results/clouds-sun-behind.png' })
  if (key !== null) await page.keyboard.up(key)
  expect(await errors(page)).toEqual([])
})
