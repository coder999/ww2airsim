import { mkdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { waitForTerrain, type DiagWindow } from './harness.js'

// F8A Task 9 (2026-10-16): fixed views of every F8A site-state for Mark's final-result viewing. Evidence, not an oracle:
// the correctness twin is siteState.spec.ts. Two views per site and window, both flying east past the west side of the
// strip (where the buildings are): a pass at 300 ft and one at 1,000 ft. The spawn is 800 m short of the building line
// because the frame runs a second or two before `sceneryView` freezes it (l1l2Capture does the same). Tanauan has no field in
// the first two windows, so it is not shot there.
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const OUT = process.env.E2E_CAPTURE_DIR ?? 'test-results/f8a-sites'

const RUNWAY: Record<string, { x: number; z: number }> = {
  tacloban: { x: -29666, z: -47605 },
  dulag: { x: -31629, z: -16479 },
  tanauan: { x: -31752, z: -30273 },
}
const WINDOWS = ['pre-invasion', 'assault', 'buildup', 'endgame', 'j6-alternate'] as const
// local (x across, z along) of the spawn, per view, then the altitude in meters (the ground at these sites is 2 to 22 m)
const VIEWS = {
  low: { dx: -940, dz: -100, y: 90 },
  high: { dx: -1000, dz: -60, y: 300 },
} as const

for (const site of Object.keys(RUNWAY)) for (const state of WINDOWS) for (const view of Object.keys(VIEWS) as (keyof typeof VIEWS)[]) {
  if (site === 'tanauan' && (state === 'pre-invasion' || state === 'assault')) continue
  test(`${site}-${state}-${view}`, async ({ page }) => {
    test.setTimeout(120_000)
    mkdirSync(OUT, { recursive: true })
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)) })
    await page.setViewportSize({ width: 1920, height: 1080 })
    const v = VIEWS[view], r = RUNWAY[site]!
    const url = `/?siteState=${site}:${state}&spawnX=${r.x + v.dx}&spawnY=${v.y}&spawnZ=${r.z + v.dz}&sceneryView=1`
    await page.goto(url)
    await waitForTerrain(page)
    await page.waitForFunction((s) => (window as DiagWindow).__ww2!.siteScenery().some((x) => x.airfield === s && x.modelsAttached > 0), site, { timeout: 30_000 })
    await page.waitForTimeout(3000)
    await page.screenshot({ path: `${OUT}/${site}-${state}-${view}.png` })
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
    expect(errors).toEqual([])
  })
}
