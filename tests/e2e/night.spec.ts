import { test, expect, type Page } from '@playwright/test'
import { spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'
import { countSpecks, frameStats, lumaGrid } from './nightStats.js'
import { sunPosition } from '../../src/render/sky/sun.js'
import { loadTerrainHeader } from '../../tools/terrain/load.js'
import { moonDirection } from '../../src/render/sky/night.js'

/**
 * F6A night look (docs/night.md; Mark's D3 "movie night" floor and D5 fixed
 * moon). Correctness only: frame time is the budget spec's business. The
 * thresholds are the plan's (§3.5a, Task 3), measured on the nexus 680M
 * 2026-10-14 for the look and re-checked on the reference GPU at closeout.
 */
test.setTimeout(240_000)
const TAC = { x: -29666, z: -47605 }
const LAT_DEG = loadTerrainHeader().centreLatDeg
const errors = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)
const threeErrors: string[] = []
test.beforeEach(({ page }) => {
  threeErrors.length = 0
  page.on('console', (m) => { if (m.type() === 'error') threeErrors.push(m.text().slice(0, 400)) })
  page.on('pageerror', (e) => threeErrors.push(e.message))
})
test.afterEach(() => { expect(threeErrors, `console errors:\n${threeErrors.join('\n')}`).toEqual([]) })

const at = { x: TAC.x, y: 600, z: TAC.z - 6000 }
async function view(page: Page, hour: number, extra: Record<string, string> = {}): Promise<Buffer> {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(withParams(spawnUrl(at), { timeOfDay: String(hour), cloudTier: 'off', ...extra }))
  await waitForTerrain(page)
  await page.waitForTimeout(2500)
  return page.screenshot()
}
const sun = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.sun())
/** The horizon band: 60 rows around the horizon the spawn looks at. */
const HORIZON = { x: 0, y: 500, w: 1920, h: 60 }

test('the deep-night frame is a readable blue night: mean grey in [20, 30], never black, blue over red', async ({ page }) => {
  const png = await view(page, 21)
  const s = await sun(page)
  expect(Math.abs(s.elevationDeg - sunPosition(LAT_DEG, 21).elevationDeg)).toBeLessThan(1)
  expect(s.elevationDeg).toBeLessThan(-40)
  const f = await frameStats(page, png)
  console.log('deep night', f)
  expect(f.gray).toBeGreaterThanOrEqual(20)
  expect(f.gray).toBeLessThanOrEqual(30)
  expect(f.b).toBeGreaterThan(f.r)
  expect(await errors(page)).toEqual([])
})

test('dusk (-9 deg, J5) and deep night (-46 deg, A4/J4) are distinguishable: dusk frame at least 25% brighter, horizon band warmer', async ({ page }) => {
  const dusk = await frameStats(page, await view(page, 18.5))
  const duskBand = await frameStats(page, await page.screenshot(), HORIZON)
  const deep = await frameStats(page, await view(page, 21))
  const deepBand = await frameStats(page, await page.screenshot(), HORIZON)
  console.log('dusk', dusk, duskBand, 'deep', deep, deepBand)
  expect(dusk.gray / deep.gray).toBeGreaterThanOrEqual(1.25)
  expect(duskBand.r / duskBand.b, 'a warm band at dusk').toBeGreaterThan(1.3 * (deepBand.r / deepBand.b))
})

test('the moon is a constant: the key light is the same direction at 21:00 and 22:00 while the true sun moves; by day it is the sun', async ({ page }) => {
  await view(page, 21)
  const a = await sun(page)
  await view(page, 22)
  const b = await sun(page)
  expect(a.keyLight.kind).toBe('moon')
  expect(b.keyLight.kind).toBe('moon')
  const m = moonDirection()
  for (const k of [a.keyLight, b.keyLight]) {
    expect(k.direction.x).toBeCloseTo(m.x, 3); expect(k.direction.y).toBeCloseTo(m.y, 3); expect(k.direction.z).toBeCloseTo(m.z, 3)
  }
  expect(Math.abs(a.direction.x - b.direction.x) + Math.abs(a.direction.y - b.direction.y), 'the real sun did move').toBeGreaterThan(0.05)
  await view(page, 12)
  const day = await sun(page)
  expect(day.keyLight.kind).toBe('sun')
  expect(day.keyLight.direction).toEqual(day.direction)
})

test('stars: point sources in a night sky, none in daylight', async ({ page }) => {
  const SKY = { x: 0, y: 140, w: 1920, h: 360 }
  const night = countSpecks(await lumaGrid(page, await view(page, 21), SKY), 40)
  const day = countSpecks(await lumaGrid(page, await view(page, 12), SKY), 40)
  console.log('specks night', night, 'day', day)
  expect(night).toBeGreaterThan(20)
  expect(day).toBe(0)
})

/** The lit limb saturates; the bloom halo around it does not. */
const LIT = 235
test('the moon disc is a half: lit on the left (waning), dark on the right', async ({ page }) => {
  // Plane heading 090; the moon is at azimuth 250 = 160 deg right of the nose = look yaw +200 (left positive), 40 deg up.
  const png = await view(page, 21, { look: '200,40' })
  const g = await lumaGrid(page, png, { x: 760, y: 340, w: 400, h: 400 })
  // The disc: bright pixels near the middle of the window (stars are 1-3 px; the disc is ~60 px across).
  let n = 0, sx = 0, sy = 0
  g.luma.forEach((v, i) => { if (v > LIT) { n++; sx += i % g.w; sy += Math.floor(i / g.w) } })
  expect(n, 'a moon is on screen').toBeGreaterThan(150)
  const cx = Math.round(sx / n), cy = Math.round(sy / n)
  // Bounding box of the bright pixels within 40 px of their centroid (stars elsewhere are excluded).
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (let y = cy - 40; y <= cy + 40; y++) for (let x = cx - 40; x <= cx + 40; x++) {
    if (x < 0 || y < 0 || x >= g.w || y >= g.h || g.luma[y * g.w + x]! <= LIT) continue
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
  }
  const width = x1 - x0 + 1, height = y1 - y0 + 1
  console.log('moon bright px', { n, width, height })
  // A full disc is as wide as it is tall; a half disc with a straight terminator is half as wide.
  expect(height, 'a moon-sized disc').toBeGreaterThan(20)
  expect(width / height, 'half a disc').toBeGreaterThan(0.35)
  expect(width / height, 'half a disc').toBeLessThan(0.65)
  // Lit on the left: the round limb is on the left and the straight terminator on the right, so the
  // right-most columns of the box are full height and the left-most ones taper.
  const band = Math.max(3, Math.round(0.25 * width))
  let leftBand = 0, rightBand = 0
  for (let y = y0; y <= y1; y++) for (let k = 0; k < band; k++) {
    if (g.luma[y * g.w + x0 + k]! > LIT) leftBand++
    if (g.luma[y * g.w + x1 - k]! > LIT) rightBand++
  }
  expect(rightBand, 'the terminator is on the right: the lit limb is on the left').toBeGreaterThan(1.3 * leftBand)
})
