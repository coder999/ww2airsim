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

/** The lit limb is bright; the bloom halo around it is not. */
const LIT = 170
/**
 * The moon at a phase, read back from pixels: the lit part's bounding box, and the luminance of the
 * UNLIT side of the disc against the sky just outside the disc. The plane heads 090; the moon is at
 * azimuth 250 = 160 deg right of the nose = look yaw +200 (left positive), 40 deg up.
 */
async function moonAt(page: Page, phase: number) {
  const png = await view(page, 21, { look: '200,40', night: `phase:${phase}` })
  const g = await lumaGrid(page, png, { x: 760, y: 340, w: 400, h: 400 })
  // The moon is the LARGEST connected bright component (stars are a few pixels each).
  const seen = new Uint8Array(g.w * g.h)
  let best: number[] = []
  for (let i = 0; i < g.luma.length; i++) {
    if (seen[i] || g.luma[i]! <= LIT) continue
    const comp: number[] = [], stack = [i]
    seen[i] = 1
    while (stack.length > 0) {
      const j = stack.pop()!
      comp.push(j)
      const x = j % g.w, y = Math.floor(j / g.w)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue
        const k = ny * g.w + nx
        if (!seen[k] && g.luma[k]! > LIT) { seen[k] = 1; stack.push(k) }
      }
    }
    if (comp.length > best.length) best = comp
  }
  const n = best.length
  expect(n, `a moon is on screen at phase ${phase}`).toBeGreaterThan(40)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const j of best) { const x = j % g.w, y = Math.floor(j / g.w); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  const width = x1 - x0 + 1, height = y1 - y0 + 1
  // The disc is as tall as it is wide: its diameter is the lit part's height (a waning disc is lit to the top and bottom
  // whatever the phase), and its centre is `diameter / 2` right of the lit part's left limb.
  const R = height / 2, dcx = x0 + R, dcy = (y0 + y1) / 2
  const mean = (inner: number, outer: number, side: 1 | -1): number => {
    let s = 0, c = 0
    for (let y = Math.floor(dcy - outer); y <= Math.ceil(dcy + outer); y++) for (let x = Math.floor(dcx - outer); x <= Math.ceil(dcx + outer); x++) {
      const d = Math.hypot(x - dcx, y - dcy)
      if (d < inner || d > outer || (x - dcx) * side < 0.25 * R) continue
      s += g.luma[y * g.w + x]!; c++
    }
    return s / Math.max(c, 1)
  }
  return { width, height, ratio: width / height, bright: n, dcx, dcy, R, g, mean }
}

for (const phase of [0.7, 0.5, 0.25]) {
  test(`the moon at phase ${phase} is lit on the left by that fraction (width over diameter)`, async ({ page }) => {
    const m = await moonAt(page, phase)
    console.log('moon', phase, { width: m.width, height: m.height, ratio: m.ratio })
    expect(m.height, 'a small disc').toBeGreaterThan(14)
    expect(m.height, 'a small disc').toBeLessThan(50)
    // Anti-aliasing and the soft terminator widen a thin crescent by a pixel or two, hence the tolerance (0.19 measured at 0.25).
    expect(Math.abs(m.ratio - phase), 'lit width / diameter is the phase').toBeLessThan(0.22)
  })
}

test('the dark side of the moon is not visible: no dark disc, outline or earthshine', async ({ page }) => {
  const m = await moonAt(page, 0.5) // the largest unlit half
  // The unlit side of the disc (right of the terminator) against the sky 1.25 to 1.7 radii out on the same side.
  const inside = m.mean(0.2 * m.R, 0.85 * m.R, 1)
  const outside = m.mean(1.25 * m.R, 1.7 * m.R, 1)
  console.log('dark side', { inside, outside })
  // Bloom from the lit half makes the near side a touch brighter; a drawn dark disc would show a step the other way or a glow.
  expect(inside - outside, 'no earthshine disc').toBeLessThan(10)
  expect(outside - inside, 'no dark disc').toBeLessThan(10)
})
