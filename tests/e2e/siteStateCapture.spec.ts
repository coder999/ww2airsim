import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { waitForTerrain, type DiagWindow } from './harness.js'

// F8A Task 9 (2026-10-16), extended to the F8B sites 2026-10-17 and the F8C sites (Ormoc, the beaches, Jinamoc) 2026-10-17: fixed views of every F8A, F8B and F8C site-state for Mark's final-result viewing. Evidence, not an oracle:
// the correctness twin is siteState.spec.ts. Two views per site and window, both flying east past the west side of the
// strip (where the buildings are): a pass at 300 ft and one at 1,000 ft. The spawn is 800 m short of the building line
// because the frame runs a second or two before `sceneryView` freezes it (l1l2Capture does the same). Tanauan has no field in
// the first two windows, so it is not shot there.
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/f8-sites'
// E2E_CAPTURE_SITES=buri,bayug shoots only those (a run of the three F8B sites is 30 views).
const ONLY = (process.env.E2E_CAPTURE_SITES ?? '').split(',').filter((s) => s !== '')

const RUNWAY: Record<string, { x: number; z: number }> = {
  tacloban: { x: -29666, z: -47605 },
  dulag: { x: -31629, z: -16479 },
  tanauan: { x: -31752, z: -30273 },
  // F8B. The strips are near east-west (Buri and San Pablo heading 80), Bayug runs north-south; the spawn flies east either way, so
  // Buri and San Pablo are seen along the strip and Bayug across it, toward its camp on the east side.
  buri: { x: -41025, z: -22005 },
  bayug: { x: -45100, z: -20700 },
  'san-pablo': { x: -39930, z: -20590 },
  // F8C: placed by F8C_VIEWS below, not by these offsets
  ormoc: { x: -75727, z: -22748 },
  'landing-beaches': { x: -30900, z: -42200 },
  jinamoc: { x: -27520, z: -46230 },
}
/** F8B: `tiltDeg` is how far the strip's axis lies off due east (Buri and San Pablo 10, Bayug's north-south strip is crossed instead); `dz` shifts the pass north (-) or south (+). */
const F8B_VIEWS: Record<string, { tiltDeg: number; dz: number; low: number; high: number }> = {
  buri: { tiltDeg: 10, dz: -30, low: 350, high: 700 },
  'san-pablo': { tiltDeg: 10, dz: -30, low: 350, high: 700 },
  bayug: { tiltDeg: 0, dz: -150, low: 200, high: 450 }, // its camp is 170 to 300 m beyond the strip: closer than the others
}
/**
 * F8C (2026-10-17): the three sites without a strip are shot from the sea toward the shore, because their action is at the water's
 * edge. Each view is defined in the site's own frame: the camera at local (x, z) and an altitude, looking at local (x, z) of the
 * target at ground level; `p` and `t` are local meters. The airplane spawns heading east and flies 376 m before the frame freezes
 * (measured by the F8B run), so the spawn is placed 376 m west of the camera and the head is turned (`look=<yaw left>,<pitch>`)
 * to the target. `c` is the frame center and `h` its heading, from the site file.
 */
type F8CView = { p: [number, number]; alt: number; t: [number, number] }
const F8C_VIEWS: Record<string, { c: { x: number; z: number }; h: number; low: F8CView; high: F8CView }> = {
  ormoc: { c: { x: -75727, z: -22748 }, h: 110, low: { p: [260, 40], alt: 55, t: [-80, 0] }, high: { p: [450, 100], alt: 200, t: [-80, 0] } },
  'landing-beaches': { c: { x: -30900, z: -42200 }, h: 23, low: { p: [200, 20], alt: 50, t: [-100, 0] }, high: { p: [350, 60], alt: 200, t: [-100, 0] } },
  jinamoc: { c: { x: -27520, z: -46230 }, h: 90, low: { p: [260, 30], alt: 55, t: [10, 0] }, high: { p: [420, 80], alt: 200, t: [0, 0] } },
}
const f8cAt = (site: string, view: 'low' | 'high'): { spawn: string; look: string } => {
  const f = F8C_VIEWS[site]!, v = f[view], r = (f.h * Math.PI) / 180
  const world = (x: number, z: number): { x: number; z: number } => ({ x: f.c.x + x * Math.cos(r) - z * Math.sin(r), z: f.c.z + x * Math.sin(r) + z * Math.cos(r) })
  const cam = world(...v.p), tgt = world(...v.t)
  const dx = tgt.x - cam.x, dz = tgt.z - cam.z, flat = Math.hypot(dx, dz)
  const yaw = (Math.atan2(-dz, dx) * 180) / Math.PI, pitch = (-Math.atan2(v.alt - 3, flat) * 180) / Math.PI
  return { spawn: `spawnX=${Math.round(cam.x - 376)}&spawnY=${v.alt}&spawnZ=${Math.round(cam.z)}`, look: `look=${yaw.toFixed(1)},${pitch.toFixed(1)}` }
}
const WINDOWS = ['pre-invasion', 'assault', 'buildup', 'endgame', 'j6-alternate'] as const
// local (x across, z along) of the spawn, per view, then the altitude in meters (the ground at these sites is 2 to 22 m)
const VIEWS = {
  low: { dx: -940, dz: -100, y: 90 },
  high: { dx: -1000, dz: -60, y: 300 },
} as const

for (const site of Object.keys(RUNWAY).filter((k) => ONLY.length === 0 || ONLY.includes(k))) for (const state of WINDOWS) for (const view of Object.keys(VIEWS) as (keyof typeof VIEWS)[]) {
  if (site === 'tanauan' && (state === 'pre-invasion' || state === 'assault')) continue
  if (site === 'jinamoc' && state === 'pre-invasion') continue // no field yet: nothing to shoot
  test(`${site}-${state}-${view}`, async ({ page }) => {
    test.setTimeout(120_000)
    mkdirSync(OUT, { recursive: true })
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)) })
    await page.setViewportSize({ width: 1920, height: 1080 })
    const v = VIEWS[view], r = RUNWAY[site]!
    // F8A sites: the fixed offsets above. F8B sites (2026-10-17): the first F8B run framed the strips badly (the airplane covered the strip and
    // the buildings sat 600 m off), so those views are placed by distance before the runway center (350 and 700 m; Bayug 200 and 450), on the strip axis for the
    // east-west strips, with the head pitched down so the airplane leaves the middle of the frame. The airplane flies 376 m in the
    // 3 s before `sceneryView` freezes the frame (measured in the first run: requested -42025, frozen at -41648).
    const f8b = F8B_VIEWS[site]
    const ahead = f8b === undefined ? 0 : f8b[view]
    const f8c = F8C_VIEWS[site] === undefined ? undefined : f8cAt(site, view)
    const at = f8c !== undefined ? `${f8c.spawn}&${f8c.look}` : f8b === undefined
      ? `spawnX=${r.x + v.dx}&spawnY=${v.y}&spawnZ=${r.z + v.dz}`
      : `spawnX=${Math.round(r.x - ahead - 376)}&spawnY=${v.y}&spawnZ=${Math.round(r.z + ahead * Math.tan((f8b.tiltDeg * Math.PI) / 180) + f8b.dz)}&look=0,${view === 'low' ? -14 : -20}`
    const url = `/?siteState=${site}:${state}&${at}&sceneryView=1`
    await page.goto(url)
    await waitForTerrain(page)
    // Jinamoc in the assault is all construction frames (procedural, no glb), so there it waits for the field itself.
    const frames = site === 'jinamoc' && state === 'assault'
    await page.waitForFunction(([s, f]) => (window as DiagWindow).__ww2!.siteScenery().some((x) => x.airfield === s && (f || x.modelsAttached > 0)), [site, frames] as const, { timeout: 30_000 })
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `${OUT}/${site}-${state}-${view}.png` })
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
    expect(errors).toEqual([])
  })
}
