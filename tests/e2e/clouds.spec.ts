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
