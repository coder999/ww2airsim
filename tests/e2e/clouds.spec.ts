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

test('budget: level under the deck, with and without clouds, the difference under 2.5 ms and the frame under 6 ms', async ({ page }) => {
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
  expect(high.p95 - off.p95).toBeLessThan(2.5)
  expect(high.p95).toBeLessThan(6.0)
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
        expect(quality.range, 'a blank strip must not pass as smooth clouds').toBeGreaterThan(40)
      }
    }
  })
}
