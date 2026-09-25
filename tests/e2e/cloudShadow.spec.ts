import { test, expect, type Page } from '@playwright/test'
import { percentile, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { CLOUD_SHADOW_PARAM } from '../../src/render/scene/cloudShadow.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'
import { loadAirfield } from '../../tools/content/load.js'

/**
 * Tier 2, cloud shadows (Plan 16b). Screenshots are READ by the executor;
 * the numbers are design §6. Same console-error guard as clouds.spec.ts:
 * a TSL graph that fails to build is a black frame with zero validation
 * errors, so every case also fails on a three console error.
 */
test.setTimeout(240_000)
const errors = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)
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
  await page.waitForTimeout(6000)
  const gpu = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
  return { p95: percentile(gpu, 0.95), n: gpu.length }
}
const TACLOBAN = loadAirfield('tacloban').runway.center
const OVER_GULF = { x: TACLOBAN.x, z: TACLOBAN.z - 8000 }

/** Mean and standard deviation of gray over a screen rectangle, decoded in
 *  the browser to avoid a PNG dependency (clouds.spec.ts pattern). */
async function grayStats(page: Page, png: Buffer, rect: { x: number; y: number; w: number; h: number }): Promise<{ mean: number; sd: number }> {
  return page.evaluate(async ({ base64, rect }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const { data } = ctx.getImageData(rect.x, rect.y, rect.w, rect.h)
    let sum = 0, sumSq = 0
    const n = rect.w * rect.h
    for (let p = 0; p < n; p++) {
      const g = (data[p * 4]! + data[p * 4 + 1]! + data[p * 4 + 2]!) / 3
      sum += g
      sumSq += g * g
    }
    const mean = sum / n
    return { mean, sd: Math.sqrt(Math.max(sumSq / n - mean * mean, 0)) }
  }, { base64: png.toString('base64'), rect })
}
/** Holds the title at tick 0 and hides it, so on/off images differ only by the shader. */
async function fixedView(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 30_000 })
  await expect(page.getByRole('dialog', { name: 'Title' })).toBeVisible()
  await page.getByRole('dialog', { name: 'Title' }).evaluate((el) => { el.style.visibility = 'hidden' })
  await page.waitForTimeout(1000)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.tick())).toBe(0)
}
/** The ground below the horizon in a level view: the lower quarter of the frame. */
const GROUND_STRIP = { x: 200, y: 1000, w: 2160, h: 300 }

test('budget tripwire: the shadow pass stays below the superseded 120 Hz frame and inside the measured number', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  const at = { ...OVER_GULF, y: 1300 }
  await page.goto(`${spawnUrl(at)}&${CLOUD_SHADOW_PARAM}=off`)
  await waitForTerrain(page)
  await page.waitForTimeout(1500)
  expect((await page.evaluate(() => (window as DiagWindow).__ww2!.clouds())).shadow.enabled).toBe(false)
  const off = await gpuP95(page)
  await page.goto(spawnUrl(at))
  await waitForTerrain(page)
  await page.waitForTimeout(1500)
  const c = await page.evaluate(() => (window as DiagWindow).__ww2!.clouds())
  expect(c.shadow).toEqual({ enabled: true, taps: 4, mapSideM: 80_000 })
  const on = await gpuP95(page)
  await page.screenshot({ path: 'test-results/cloud-shadow-budget-view.png' })
  console.log(`shadow off p95 ${off.p95.toFixed(3)} ms (${off.n}); on p95 ${on.p95.toFixed(3)} ms (${on.n}); cost ${(on.p95 - off.p95).toFixed(3)} ms`)
  expect(off.n).toBeGreaterThan(120)
  expect(on.n).toBeGreaterThan(120)
  expect(on.p95 - off.p95, 'the pass must be inside the timestamp the budget reads').toBeGreaterThan(0)
  // The two page loads make their p95 difference too noisy to be an upper
  // bound (three §3.4 runs ranged 0.648-1.130 ms). The positive delta still
  // proves the pass is inside the timestamp; budget4k.spec.ts is authoritative.
  expect(on.p95).toBeLessThan(8.33)
  expect(await errors(page)).toEqual([])
})

test('under the deck: the sea is darker and patchier with shadows than without', async ({ page }) => {
  // The fixed view holds the title at tick 0, so the on and off frames differ
  // only by the shader. Under the deck (not above it looking down: the title
  // hold takes no look keys, and a flown view is not reproducible on/off) the
  // lower quarter of the frame is open water with the deck's shadows on it.
  await page.setViewportSize({ width: 2560, height: 1440 })
  const at = { ...OVER_GULF, y: 1300 }
  await fixedView(page, `${spawnUrl(at)}&${CLOUD_SHADOW_PARAM}=off`)
  const off = await grayStats(page, await page.screenshot({ path: 'test-results/cloud-shadow-under-off.png' }), GROUND_STRIP)
  await fixedView(page, spawnUrl(at))
  const on = await grayStats(page, await page.screenshot({ path: 'test-results/cloud-shadow-under-on.png' }), GROUND_STRIP)
  console.log('sea strip gray', { off, on })
  expect(off.mean - on.mean, 'shadows must darken the sea').toBeGreaterThan(5)
  expect(on.sd, 'shadows are patches, not a tint').toBeGreaterThan(off.sd)
  expect(await errors(page)).toEqual([])
})

test('the map is anchored to the world: a fixed point reads the same transmittance from any eye position', async ({ page }) => {
  // The check no screenshot can make. Before 2026-09-19's flip fix the pass
  // wrote row uv.y and the lookup read row 1 - uv.y, so the map was mirrored
  // in z about the eye's snapped center: five world points read
  // (1.000 0.027 0.537 0.565 0.047) from one eye and (0.922 0.133 0.031
  // 0.573 1.000) from an eye 2 km south. Free flight has no wind, so the
  // field is static and a texel read back through the lookup's own
  // convention must not change when only the eye moves, in z OR in x.
  await page.setViewportSize({ width: 1280, height: 720 })
  const points = [0, 1500, 3000, -2200, 5100].map((d) => ({ x: OVER_GULF.x + d, z: OVER_GULF.z + d * 0.7 }))
  const reads: number[][] = []
  for (const eye of [{ dx: 0, dz: 0 }, { dx: 0, dz: 2000 }, { dx: 2500, dz: -3500 }]) {
    await page.goto(spawnUrl({ x: OVER_GULF.x + eye.dx, y: 1300, z: OVER_GULF.z + eye.dz }))
    await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 30_000 })
    await page.waitForTimeout(800)
    const vals = await page.evaluate(async (pts) => Promise.all(pts.map((p) => (window as DiagWindow).__ww2!.cloudShadowAt(p.x, p.z))), points)
    console.log(`eye +${eye.dx}/${eye.dz}: T =`, vals.map((v) => (v === null ? 'null' : v.toFixed(3))).join(' '))
    reads.push(vals.map((v) => { expect(v, 'point inside the map').not.toBeNull(); return v! }))
  }
  expect(Math.max(...reads[0]!) - Math.min(...reads[0]!), 'the points must span shadow and clear sky').toBeGreaterThan(0.3)
  for (const r of reads.slice(1)) for (let i = 0; i < points.length; i++) expect(Math.abs(r[i]! - reads[0]![i]!)).toBeLessThanOrEqual(1 / 255)
  expect(await errors(page)).toEqual([])
})

test('clear sky: the gunnery range is identical with and without the pass', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  const range = `/?${SCENARIO_PARAM}=gunnery-range`
  const whole = { x: 0, y: 0, w: 2560, h: 1440 }
  await fixedView(page, `${range}&${CLOUD_SHADOW_PARAM}=off`)
  const off = await grayStats(page, await page.screenshot(), whole)
  await fixedView(page, range)
  expect((await page.evaluate(() => (window as DiagWindow).__ww2!.clouds())).shadow.enabled).toBe(false)
  const on = await grayStats(page, await page.screenshot({ path: 'test-results/cloud-shadow-range.png' }), whole)
  expect(Math.abs(on.mean - off.mean)).toBeLessThan(1)
  expect(await errors(page)).toEqual([])
})

test('show probe from the chocks: one gray pattern across runway and terrain, and it stays on the ground in flight', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(`/?${CLOUD_SHADOW_PARAM}=show`)
  await waitForTerrain(page)
  await page.keyboard.down('Numpad8')
  await page.waitForTimeout(1500)
  await page.keyboard.up('Numpad8')
  await page.screenshot({ path: 'test-results/cloud-shadow-show-chocks.png' })
  // Level flight at 800 m over the strip: two frames 3 s apart. The pattern
  // must move with the ground track, not with the airplane: a wrong eye
  // offset in the lookup shows as the same image twice.
  await page.goto(`${spawnUrl({ x: TACLOBAN.x, y: 800, z: TACLOBAN.z + 4000 })}&${CLOUD_SHADOW_PARAM}=show`)
  await waitForTerrain(page)
  await page.waitForTimeout(1000)
  const a = await grayStats(page, await page.screenshot({ path: 'test-results/cloud-shadow-show-flight-a.png' }), GROUND_STRIP)
  await page.waitForTimeout(3000)
  const b = await grayStats(page, await page.screenshot({ path: 'test-results/cloud-shadow-show-flight-b.png' }), GROUND_STRIP)
  console.log('show probe strips', { a, b })
  expect(a.sd, 'the probe must paint a pattern, not a flat gray').toBeGreaterThan(8)
  expect(Math.abs(a.mean - b.mean), 'the pattern moved under the airplane').toBeGreaterThan(0.5)
  expect(await errors(page)).toEqual([])
})

test('the carrier deck, a plain lit material, darkens under the overcast: the sun carries the shadow', async ({ page }) => {
  // Spec §7's first risk: that `renderer.shadowMap.enabled` plus the custom
  // `light.shadow.shadowNode` does NOT reach lit materials. The flight deck
  // is a MeshStandardMaterial with no shader of its own; at tick 0 the
  // deck-quals carrier sits under the 0.55-coverage overcast (measured
  // 2026-09-19: 62.8 -> 43.6 mean gray). The strip is the deck to the left
  // of the airplane's nose, no sea and no airframe in it.
  await page.setViewportSize({ width: 2560, height: 1440 })
  const DECK_STRIP = { x: 820, y: 1024, w: 330, h: 250 }
  const url = `/?${SCENARIO_PARAM}=deck-quals`
  await fixedView(page, `${url}&${CLOUD_SHADOW_PARAM}=off`)
  const off = await grayStats(page, await page.screenshot({ path: 'test-results/cloud-shadow-deck-off.png' }), DECK_STRIP)
  await fixedView(page, url)
  const on = await grayStats(page, await page.screenshot({ path: 'test-results/cloud-shadow-deck-on.png' }), DECK_STRIP)
  console.log('deck strip gray', { off, on })
  expect(off.mean - on.mean, 'the lit deck must darken under the cloud').toBeGreaterThan(5)
  expect(await errors(page)).toEqual([])
})

test('deck run with shadows on stays under 6 ms', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(`/?${SCENARIO_PARAM}=deck-quals`)
  await waitForTerrain(page)
  expect((await page.evaluate(() => (window as DiagWindow).__ww2!.clouds())).shadow.enabled).toBe(true)
  await page.keyboard.down('Equal')
  await page.waitForTimeout(2000)
  const run = await gpuP95(page)
  await page.keyboard.up('Equal')
  console.log(`deck run with shadows gpu p95 ${run.p95.toFixed(3)} ms (${run.n})`)
  expect(run.n).toBeGreaterThan(120)
  expect(run.p95).toBeLessThan(6.0)
  await page.screenshot({ path: 'test-results/cloud-shadow-deck-run.png' })
  expect(await errors(page)).toEqual([])
})
