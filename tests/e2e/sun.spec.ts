import { test, expect, type Page } from '@playwright/test'
import { spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { VIEWS } from './views.js'
import { TIME_OF_DAY_PARAM, sunPosition } from '../../src/render/sky/sun.js'
import { loadAirfield } from '../../tools/content/load.js'
import { loadTerrainHeader } from '../../tools/terrain/load.js'

/**
 * Tier 2, the movable sun (Plan 16c). Screenshots are READ by the executor;
 * design §7 is the acceptance. Same console-error guard as clouds.spec.ts.
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
const TACLOBAN = loadAirfield('tacloban').runway.center
const OVER_GULF = { x: TACLOBAN.x, z: TACLOBAN.z - 8000 }
/** The app computes the sun at the terrain's centre latitude (main.ts). */
const LAT_DEG = loadTerrainHeader().centreLatDeg

async function rgbStats(page: Page, png: Buffer, rect: { x: number; y: number; w: number; h: number }): Promise<{ r: number; g: number; b: number; gray: number }> {
  return page.evaluate(async ({ base64, rect }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const { data } = ctx.getImageData(rect.x, rect.y, rect.w, rect.h)
    let r = 0, g = 0, b = 0
    const n = rect.w * rect.h
    for (let p = 0; p < n; p++) { r += data[p * 4]!; g += data[p * 4 + 1]!; b += data[p * 4 + 2]! }
    return { r: r / n, g: g / n, b: b / n, gray: (r + g + b) / (3 * n) }
  }, { base64: png.toString('base64'), rect })
}
/** Title held at tick 0 and hidden: frames at two hours differ only by the sun. */
async function fixedView(page: Page, url: string): Promise<void> {
  await page.goto(url)
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 30_000 })
  await expect(page.getByRole('dialog', { name: 'Title' })).toBeVisible()
  await page.getByRole('dialog', { name: 'Title' }).evaluate((el) => { el.style.visibility = 'hidden' })
  await page.waitForTimeout(1000)
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.tick())).toBe(0)
}
/** Clear of the overlays: the legend sits top-right, the diagnostics top-left, PAUSED at mid-height. */
const SKY_STRIP = { x: 500, y: 120, w: 1400, h: 300 }
const GROUND_STRIP = { x: 200, y: 1000, w: 2160, h: 300 }
const at = { ...OVER_GULF, y: 1300 }

test('the same view at 06:30, 12:00 and 17:00: warm ends, blue noon, brightest ground at noon, geometry as computed', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  const hours = [6.5, 12, 17] as const
  const sky: { r: number; g: number; b: number; gray: number }[] = []
  const ground: number[] = []
  for (const h of hours) {
    await fixedView(page, `${spawnUrl(at)}&${TIME_OF_DAY_PARAM}=${h}`)
    const s = await page.evaluate(() => (window as DiagWindow).__ww2!.sun())
    expect(s.timeOfDay).toBeCloseTo(h, 2)
    const expected = sunPosition(LAT_DEG, h)
    expect(Math.abs(s.elevationDeg - expected.elevationDeg)).toBeLessThan(1)
    expect(Math.abs(s.azimuthDeg - expected.azimuthDeg)).toBeLessThan(1)
    const png = await page.screenshot({ path: `test-results/sun-${h}.png` })
    sky.push(await rgbStats(page, png, SKY_STRIP))
    ground.push((await rgbStats(page, png, GROUND_STRIP)).gray)
    expect(await errors(page)).toEqual([])
  }
  console.log('sky', sky, 'ground', ground)
  const warmth = sky.map((s) => s.r - s.b)
  expect(warmth[0]!, 'dawn sky warmer than noon').toBeGreaterThan(warmth[1]!)
  expect(warmth[2]!, 'evening sky warmer than noon').toBeGreaterThan(warmth[1]!)
  expect(sky[1]!.b, 'noon sky is blue').toBeGreaterThan(sky[1]!.r)
  expect(ground[1]!, 'ground brightest at noon').toBeGreaterThan(ground[0]!)
  expect(ground[1]!).toBeGreaterThan(ground[2]!)
})

test('the shadow map moves with the sun: the same world points read differently at 10:00 and 16:30', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const points = [0, 1500, 3000, -2200, 5100].map((d) => ({ x: OVER_GULF.x + d, z: OVER_GULF.z + d * 0.7 }))
  const read = async (h: number): Promise<number[]> => {
    await page.goto(`${spawnUrl(at)}&${TIME_OF_DAY_PARAM}=${h}`)
    await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 30_000 })
    await page.waitForTimeout(800)
    const vals = await page.evaluate(async (pts) => Promise.all(pts.map((p) => (window as DiagWindow).__ww2!.cloudShadowAt(p.x, p.z))), points)
    return vals.map((v) => { expect(v).not.toBeNull(); return v! })
  }
  const morning = await read(10), evening = await read(16.5)
  console.log('T at 10:00', morning.map((v) => v.toFixed(3)).join(' '), '| 16:30', evening.map((v) => v.toFixed(3)).join(' '))
  const moved = morning.map((v, i) => Math.abs(v - evening[i]!))
  expect(Math.max(...moved), 'the projection must move with the sun').toBeGreaterThan(0.1)
  expect(await errors(page)).toEqual([])
})

test('the map stays anchored to the world at a low sun (16b\'s check at 16:30)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const points = [0, 1500, 3000, -2200, 5100].map((d) => ({ x: OVER_GULF.x + d, z: OVER_GULF.z + d * 0.7 }))
  const reads: number[][] = []
  for (const eye of [{ dx: 0, dz: 0 }, { dx: 0, dz: 2000 }, { dx: 2500, dz: -3500 }]) {
    await page.goto(`${spawnUrl({ x: OVER_GULF.x + eye.dx, y: 1300, z: OVER_GULF.z + eye.dz })}&${TIME_OF_DAY_PARAM}=16.5`)
    await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, { timeout: 30_000 })
    await page.waitForTimeout(800)
    const vals = await page.evaluate(async (pts) => Promise.all(pts.map((p) => (window as DiagWindow).__ww2!.cloudShadowAt(p.x, p.z))), points)
    reads.push(vals.map((v) => { expect(v).not.toBeNull(); return v! }))
  }
  for (const r of reads.slice(1)) for (let i = 0; i < points.length; i++) expect(Math.abs(r[i]! - reads[0]![i]!)).toBeLessThanOrEqual(1 / 255)
  expect(await errors(page)).toEqual([])
})

test('a twilight scenario is dusk, not black, and the shadow pass is still sane', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await fixedView(page, `${spawnUrl(at)}&${TIME_OF_DAY_PARAM}=18.5`)
  const png = await page.screenshot({ path: 'test-results/sun-dusk.png' })
  const sky = await rgbStats(page, png, SKY_STRIP)
  const ground = await rgbStats(page, png, GROUND_STRIP)
  console.log('dusk', { sky, ground })
  expect(sky.gray).toBeGreaterThan(8)
  expect(ground.gray).toBeGreaterThan(4)
  expect(await errors(page)).toEqual([])
})

/**
 * Photoreal Task 9 (spec §4.3, review focus 4): with the sun 9 deg below the
 * horizon the atmosphere model alone is ~1e-4 of noon, so what is on screen is
 * the dusk floor (sky/palette.ts) through the dusk exposure. Dim, not black
 * (a NaN or a dead floor), not blown out (an exposure runaway). Mean grey of
 * the frame with the top 100 rows -- the DEV readout -- cropped: 22.1 when
 * first measured, 2026-09-25.
 */
test('dusk at under-deck-1200, 18:30: dim but not black, not blown', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(`${VIEWS.find((v) => v.name === 'under-deck-1200')!.url}&${TIME_OF_DAY_PARAM}=18.5`)
  await waitForTerrain(page)
  await page.waitForTimeout(3000)
  const png = await page.screenshot({ path: 'test-results/sun-dusk-under-deck.png' })
  const frame = await rgbStats(page, png, { x: 0, y: 100, w: 2560, h: 1340 })
  console.log('dusk under-deck-1200', frame)
  expect(frame.gray).toBeGreaterThan(2)
  expect(frame.gray).toBeLessThan(60)
  expect(await errors(page)).toEqual([])
})
