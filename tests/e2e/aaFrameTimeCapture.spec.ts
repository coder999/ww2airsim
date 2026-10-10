import { test, expect } from '@playwright/test'
import { percentile, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

// M2: GPU frame time with the anti-aircraft guns shooting, against the same scene with them silent. A measurement tool,
// not a test: skipped unless E2E_CAPTURE=1. Run it on the reference GPU under `hwlock ryzen-budget` (docs/testing.md) with no
// `remote-run` job going (it loads ryzen's CPU and skews the numbers).
//
// The two variants are the same scenario files, run in separate invocations: the SILENT variant is the committed
// `aa-range.json` / `range-test.json` with every ship and airfield flagged to the player's own side (a scratch edit
// the wrapper script makes and reverts), so nothing shoots and the scene is otherwise identical. AA_VARIANT names which
// this run is. Run the two interleaved, three times each, so slow drift on a shared GPU lands on both alike.
test.skip(process.env.E2E_CAPTURE !== '1', 'capture tool: set E2E_CAPTURE=1')
const VARIANT = process.env.AA_VARIANT ?? 'live'
const SHIP = { x: -27916, z: -48605 }
const BASE = { x: -29666, z: -47605 }
const FT = 0.3048

const VIEWS = [
  // Heading east at 120 m/s from a mile and a quarter west of the destroyer, 300 ft: the window runs from about a mile out to just past the ship.
  { name: 'aa-low-300ft', scenario: 'aa-range', at: { x: SHIP.x - 2000, y: 300 * FT, z: SHIP.z }, settleMs: 2500, sampleMs: 8000 },
  // The same run at 6,000 ft: only the flak reaches.
  { name: 'aa-high-6000ft', scenario: 'aa-range', at: { x: SHIP.x - 4000, y: 6000 * FT, z: SHIP.z }, settleMs: 2500, sampleMs: 12_000 },
  // Over the Range Test anchorage, 300 ft: every warship in range at once.
  { name: 'range-test-300ft', scenario: 'range-test', at: { x: BASE.x + 1800, y: 300 * FT, z: BASE.z - 600 }, settleMs: 2500, sampleMs: 6000 },
] as const

test.setTimeout(120_000)
for (const view of VIEWS) {
  test(`${view.name} ${VARIANT} #${process.env.AA_REP ?? '0'}`, async ({ page }) => {
    await page.setViewportSize({ width: 2560, height: 1440 })
    await page.goto(withParams(spawnUrl(view.at), { scenario: view.scenario, launch: '1', aircraft: 'f6f-hellcat', loadout: 'both', god: '1', cloudTier: 'off', oceanTier: 'high' }))
    await waitForTerrain(page)
    await page.waitForTimeout(view.settleMs)
    await page.evaluate(() => { (window as DiagWindow).__ww2!.resetFrameTimes() })
    let peak = 0
    for (let t = 0; t < view.sampleMs; t += 500) {
      await page.waitForTimeout(500)
      const a = await page.evaluate(() => (window as DiagWindow).__ww2!.combat()!.aa)
      peak = Math.max(peak, a.rounds)
    }
    const r = await page.evaluate(() => ({
      gpu: (window as DiagWindow).__ww2!.gpuFrameTimesMs(),
      errors: (window as DiagWindow).__ww2!.validationErrors,
      aa: (window as DiagWindow).__ww2!.combat()!.aa,
    }))
    expect(r.gpu.length, 'no GPU timestamp samples').toBeGreaterThan(120)
    console.log(`AATIME ${view.name} ${VARIANT} #${process.env.AA_REP ?? '0'} gpu p50 ${percentile(r.gpu, 0.5).toFixed(3)} p95 ${percentile(r.gpu, 0.95).toFixed(3)} ms over ${r.gpu.length}, peak AA rounds in flight ${peak}, bursts in ring ${r.aa.burstsRecent}`)
    expect(r.errors).toEqual([])
    // The variants differ in exactly this: the live guns shoot, the silent ones never do.
    if (VARIANT === 'quiet') expect(peak + r.aa.burstsRecent).toBe(0)
    else expect(peak + r.aa.burstsRecent).toBeGreaterThan(0)
  })
}
