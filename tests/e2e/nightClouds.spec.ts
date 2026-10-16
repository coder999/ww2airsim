import { mkdirSync } from 'node:fs'
import { test, expect, type Page } from '@playwright/test'
import { spawnUrl, startGame, type DiagWindow } from './harness.js'
import { withParams } from './views.js'
import { type Rect } from './nightStats.js'
import { sunPosition } from '../../src/render/sky/sun.js'
import { loadTerrainHeader } from '../../tools/terrain/load.js'

/**
 * Clouds and haze at night (fix-night-clouds, 2026-10-15; docs/night.md). F6A made the sky and ground read as
 * night but never exercised the cloud pass: Mark's playtest showed bright white day clouds under a dark star
 * sky. These specs hold the cloud march to the night lighting model (moon key light, floor ambient) and the day
 * look unchanged. Correctness only; frame time is the budget spec's business (docs/testing.md).
 *
 * Method: the same view is rendered twice, `cloudTier=off` and on. A pixel is a CLOUD pixel when the two frames
 * differ by more than CLOUD_DIFF in luminance (the ocean is deterministic at a fixed hour and the sim is held,
 * so everything else matches). Mean luminance is then read over those pixels in the cloud-on frame.
 * `E2E_CAPTURE_DIR` also saves the PNGs for a person to read.
 */
test.setTimeout(420_000)
const TAC = { x: -29666, z: -47605 }
const LAT_DEG = loadTerrainHeader().centreLatDeg
const OUT = process.env.E2E_CAPTURE_DIR
const CLOUD_DIFF = 6
const threeErrors: string[] = []
test.beforeEach(({ page }) => {
  threeErrors.length = 0
  page.on('console', (m) => { if (m.type() === 'error') threeErrors.push(m.text().slice(0, 400)) })
  page.on('pageerror', (e) => threeErrors.push(e.message))
})
test.afterEach(() => { expect(threeErrors, `console errors:\n${threeErrors.join('\n')}`).toEqual([]) })

/** Free Flight (cumulus 1,500 m base, 900 m thick, 0.45 cover + cirrus). Under the deck, looking up at it; above it, looking out over the tops. */
const VIEWS = {
  // Sky above the horizon (the HUD readout owns the top rows). The cloud mask is where cloud-on differs from cloud-off.
  under: { at: { x: TAC.x, y: 1000, z: TAC.z - 8000 }, roi: [{ x: 0, y: 30, w: 1280, h: 200 }] },
  // The deck below the horizon, either side of the player's own airplane.
  above: { at: { x: TAC.x, y: 3200, z: TAC.z - 8000 }, roi: [{ x: 0, y: 290, w: 380, h: 250 }, { x: 900, y: 290, w: 380, h: 250 }] },
} as const
type ViewName = keyof typeof VIEWS
const SIZE = { width: 1280, height: 720 }
/** Rows of the frame the DEV readout and HUD do not own. */
const BODY: Rect = { x: 0, y: 100, w: SIZE.width, h: SIZE.height - 160 }

type Shot = { luma: Float32Array; r: Float32Array; g: Float32Array; b: Float32Array; w: number; h: number }
async function shoot(page: Page, name: string, at: { x: number; y: number; z: number }, hour: number, extra: Record<string, string>): Promise<Shot> {
  await page.setViewportSize(SIZE)
  await page.goto(withParams(spawnUrl(at), { timeOfDay: String(hour), ...extra }))
  // Form 4's cloudiness is a RANDOM roll by default (harness.ts), so a bare waitForTerrain gave a clear sky on one load and an overcast on the next.
  await startGame(page, { cloudiness: 'Partly Cloudy' })
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null && ((window as DiagWindow).__ww2?.tick() ?? 0) > 0, undefined, { timeout: 60_000 })
  await page.waitForTimeout(4000)
  const png = await page.screenshot(OUT !== undefined ? (mkdirSync(OUT, { recursive: true }), { path: `${OUT}/${name}.png` }) : {})
  return page.evaluate(async ({ base64, box }) => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob())
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width; canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0); bitmap.close()
    const { data } = ctx.getImageData(box.x, box.y, box.w, box.h)
    const n = box.w * box.h
    const luma = new Float32Array(n), r = new Float32Array(n), g = new Float32Array(n), b = new Float32Array(n)
    for (let p = 0; p < n; p++) {
      r[p] = data[p * 4]!; g[p] = data[p * 4 + 1]!; b[p] = data[p * 4 + 2]!
      luma[p] = 0.2126 * r[p]! + 0.7152 * g[p]! + 0.0722 * b[p]!
    }
    return { luma: Array.from(luma), r: Array.from(r), g: Array.from(g), b: Array.from(b), w: box.w, h: box.h }
  }, { base64: png.toString('base64'), box: BODY }).then((v) => ({ luma: Float32Array.from(v.luma), r: Float32Array.from(v.r), g: Float32Array.from(v.g), b: Float32Array.from(v.b), w: v.w, h: v.h }))
}

export type CloudStats = { cloudFraction: number; cloudLuma: number; clearLuma: number; roiLuma: number; cloudRgb: [number, number, number] }
/** Cloud pixels = where the cloud-on frame is BRIGHTER than the cloud-off frame (a cloud adds light; its shadow on the sea only subtracts it, and by day counted as cloud before 2026-10-15), inside the view's region of interest. */
function cloudStats(on: Shot, off: Shot, roi: readonly Rect[]): CloudStats {
  let nc = 0, lc = 0, nk = 0, lk = 0, nr = 0, lr = 0
  const rgb: [number, number, number] = [0, 0, 0]
  for (const rect of roi) {
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        const p = y * on.w + x
        nr++; lr += on.luma[p]!
        if (on.luma[p]! - off.luma[p]! > CLOUD_DIFF) { nc++; lc += on.luma[p]!; rgb[0] += on.r[p]!; rgb[1] += on.g[p]!; rgb[2] += on.b[p]! } else { nk++; lk += off.luma[p]! }
      }
    }
  }
  return {
    cloudFraction: nc / nr,
    cloudLuma: nc > 0 ? lc / nc : 0,
    clearLuma: nk > 0 ? lk / nk : 0,
    roiLuma: lr / nr,
    cloudRgb: [rgb[0] / Math.max(1, nc), rgb[1] / Math.max(1, nc), rgb[2] / Math.max(1, nc)],
  }
}
async function measure(page: Page, view: ViewName, hour: number, extra: Record<string, string> = {}): Promise<CloudStats> {
  const name = `${view}-h${hour}${extra.night !== undefined ? '-' + extra.night.replace(/[^a-z0-9.]/g, '') : ''}`
  const off = await shoot(page, `${name}-off`, VIEWS[view].at, hour, { cloudTier: 'off', ...extra })
  const on = await shoot(page, name, VIEWS[view].at, hour, { cloudTier: 'high', ...extra })
  const s = cloudStats(on, off, VIEWS[view].roi)
  console.log(name, JSON.stringify(s))
  return s
}
/** The hour (day 294 at Leyte) at which the sun is at `elevationDeg`, on the evening side, by bisection on sunPosition. */
function hourForElevation(elevationDeg: number): number {
  let lo = 12, hi = 24
  for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (sunPosition(LAT_DEG, mid).elevationDeg > elevationDeg) lo = mid; else hi = mid }
  return Math.round(((lo + hi) / 2) * 1000) / 1000
}
const sunElev = (hour: number): number => sunPosition(LAT_DEG, hour).elevationDeg

test('deep night: clouds are dark masses lit faintly by the moon, not day clouds (under the deck and above it)', async ({ page }) => {
  expect(sunElev(21)).toBeLessThan(-40)
  expect(sunElev(12)).toBeGreaterThan(40)
  for (const view of ['under', 'above'] as const) {
    const day = await measure(page, view, 12)
    const night = await measure(page, view, 21)
    expect(day.cloudFraction, `${view}: clouds are in the day frame`).toBeGreaterThan(0.05)
    expect(night.cloudFraction, `${view}: clouds are in the night frame`).toBeGreaterThan(0.05)
    // Measured before the fix (2026-10-15): night clouds were as bright as day clouds (ratio about 1.0).
    expect(night.cloudLuma / day.cloudLuma, `${view}: night cloud luminance / day cloud luminance`).toBeLessThan(0.3)
    // A cloud is not a hole in the sky and not a glowing lamp: it is within a sane factor of the clear sky/sea beside it.
    expect(night.cloudLuma / Math.max(1, night.clearLuma), `${view}: cloud / clear contrast`).toBeLessThan(5)
    expect(night.cloudLuma, `${view}: not black`).toBeGreaterThan(3)
    expect(night.cloudRgb[2], `${view}: blue over red`).toBeGreaterThan(night.cloudRgb[0])
  }
})

test('stars show through the gaps: clouds do not wash out the clear sky', async ({ page }) => {
  const off = await shoot(page, 'stars-off', VIEWS.above.at, 21, { cloudTier: 'off' })
  const on = await shoot(page, 'stars-on', VIEWS.above.at, 21, { cloudTier: 'high' })
  // Brightest sky pixels outside the cloud mask: a star is a point far above the floor.
  let kept = 0, total = 0
  for (let p = 0; p < off.luma.length; p++) {
    if (off.luma[p]! > 60 && p / off.w < off.h * 0.5) {
      total++
      if (Math.abs(on.luma[p]! - off.luma[p]!) < 20) kept++
    }
  }
  console.log('stars', { total, kept })
  expect(total, 'there are stars to keep').toBeGreaterThan(10)
})

for (const view of ['under', 'above'] as const) {
  test(`dusk sweep, ${view}: cloud luminance falls monotonically from day to deep night with no jump (noon, then sun -3, -6, -9, -18, -46 deg)`, async ({ page }) => {
    // Noon is the day anchor. The low-sun day look (+3 deg) is main's and unchanged, and it is dimmer than dusk's exposure-lifted clouds, so it is not in the monotone chain.
    const noon = (await measure(page, view, 12)).cloudLuma
    const lumas: number[] = []
    for (const e of [-3, -6, -9, -18, -46]) lumas.push((await measure(page, view, hourForElevation(e))).cloudLuma)
    expect(lumas[0]!, `${view}: dusk clouds are no brighter than noon clouds`).toBeLessThanOrEqual(noon)
    console.log(`${view} sweep (cloud luma)`, lumas.map((v) => v.toFixed(1)).join(' '))
    for (let i = 1; i < lumas.length; i++) {
      expect(lumas[i]!, `${view}: step ${i} does not brighten`).toBeLessThanOrEqual(lumas[i - 1]! * 1.05)
      // No pop: the biggest single step is the dusk collapse itself, and it is bounded.
      expect(lumas[i]! / lumas[i - 1]!, `${view}: step ${i} ratio`).toBeGreaterThan(0.2)
    }
  })
}

test('day regression: with the sun up the clouds are the day look (the night model changes nothing at 12:00 and at sunset +8 deg)', async ({ page }) => {
  // `?night=clouds:0` lights the clouds as by day at any hour: the path main renders. Alternating the two inside one
  // page-load family cancels the machine's state; the tolerance is temporal noise (two loads of the same view).
  const roi = (shot: Shot, view: ViewName): number => cloudStats(shot, shot, VIEWS[view].roi).roiLuma
  for (const view of ['under', 'above'] as const) {
    for (const hour of [12, 17.3]) {
      expect(sunElev(hour)).toBeGreaterThan(5)
      const model = roi(await shoot(page, `${view}-day-h${hour}-model`, VIEWS[view].at, hour, { cloudTier: 'high' }), view)
      const twin = roi(await shoot(page, `${view}-day-h${hour}-twin`, VIEWS[view].at, hour, { cloudTier: 'high', night: 'clouds:0' }), view)
      console.log(`day ${view} h${hour}`, { model, twin })
      expect(Math.abs(model / twin - 1), `${view} h${hour}: model on vs the day twin`).toBeLessThan(0.03)
    }
  }
  // The twin can fail: at night it is the old look, far brighter than the model's.
  const nightModel = roi(await shoot(page, 'under-night-model', VIEWS.under.at, 21, { cloudTier: 'high' }), 'under')
  const nightTwin = roi(await shoot(page, 'under-night-twin', VIEWS.under.at, 21, { cloudTier: 'high', night: 'clouds:0' }), 'under')
  console.log('night', { nightModel, nightTwin })
  expect(nightTwin / nightModel, 'at night the day-lit twin is much brighter').toBeGreaterThan(2)
})
