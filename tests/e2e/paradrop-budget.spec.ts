import { test, expect, type Page } from '@playwright/test'
import { percentile, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

/**
 * F7B: what J5's worst-case drop costs. 18 men and 6 bundles under canopy (F3 §4, J5), seen from behind the transport
 * with the look-back key held in BOTH arms so the camera is identical and only the stick differs. Clouds and ocean
 * are forced to high so a probe cannot move them. Differential p95s across two page loads are noise-dominated
 * (docs/clouds.md §4), so each arm is loaded six times, interleaved, and the gate compares the arms' medians. Run it with and without BUDGET_PARAMS=trees=off: the forest's cost inflates the baseline and the delta.
 *
 * The 1.0 ms delta is a TRIPWIRE chosen here, not a ruling: it is the effects budget's number. The finale gate
 * (24 airborne, 10 ships, 16.7 ms at 1440p High) is F10E's.
 */
const DELTA_P95_MS = 1.0
test.setTimeout(600_000)
const TACLOBAN = { x: -29666, z: -47605 }
const consoleErrors: string[] = []
test.beforeEach(async ({ page }) => {
  consoleErrors.length = 0
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400)) })
  page.on('pageerror', (e) => consoleErrors.push(e.message))
  await page.setViewportSize({ width: 2560, height: 1440 })
})
test.afterEach(() => { expect(consoleErrors, consoleErrors.join('\n')).toEqual([]) })

type Run = { readonly arm: 'off' | 'drop'; readonly p95: number; readonly n: number; readonly entities: number; readonly drawn: number }
async function measure(page: Page, arm: 'off' | 'drop'): Promise<Run> {
  // BUDGET_PARAMS (e.g. trees=off) rides on this URL through withParams: the forest's cost swamps the baseline otherwise.
  await page.goto(withParams(spawnUrl({ x: TACLOBAN.x - 3_000, y: 300, z: TACLOBAN.z }), {
    scenario: 'free-flight', launch: '1', cloudTier: 'high', oceanTier: 'high', ...(arm === 'drop' ? { paradrop: '18,6' } : {}),
  }))
  await waitForTerrain(page)
  await page.keyboard.down('Numpad0')
  await page.waitForTimeout(6_000) // the drop is at 2 s; every canopy is open by 4 s
  const seen = await page.evaluate(() => (window as DiagWindow).__ww2!.parachutists())
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
  await page.waitForTimeout(5_000)
  const gpu = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
  await page.keyboard.up('Numpad0')
  const run = { arm, p95: percentile(gpu, 0.95), n: gpu.length, entities: seen.entities, drawn: seen.drawn }
  console.log(`PARADROPBUDGET arm=${arm} p95=${run.p95.toFixed(3)} n=${run.n} entities=${run.entities} drawn=${run.drawn}`)
  return run
}
/** Median, not mean: one slow load must not swing the gate (the budget-analysis session's advice, 2026-10-16). */
const mean = (runs: readonly Run[], arm: string): number => percentile(runs.filter((x) => x.arm === arm).map((x) => x.p95), 0.5)

test('1440p high: an 18 man and 6 bundle drop adds at most 1.0 ms of gpu p95 over no drop (F7B budget)', async ({ page }) => {
  const runs: Run[] = []
  for (const arm of ['off', 'drop', 'off', 'drop', 'off', 'drop', 'off', 'drop', 'off', 'drop', 'off', 'drop'] as const) runs.push(await measure(page, arm))
  const delta = mean(runs, 'drop') - mean(runs, 'off')
  const detail = `drop p95 ${mean(runs, 'drop').toFixed(3)} ms vs none ${mean(runs, 'off').toFixed(3)} ms, delta ${delta.toFixed(3)} ms`
  console.log(`PARADROPBUDGET ${detail}`)
  test.info().annotations.push({ type: 'budget', description: detail })
  for (const r of runs) expect(r.n, 'too few GPU samples for a percentile').toBeGreaterThan(100)
  for (const r of runs.filter((x) => x.arm === 'drop')) {
    expect(r.entities, 'the stick was not released').toBe(24)
    expect(r.drawn, 'not every canopy is drawn').toBe(24)
  }
  for (const r of runs.filter((x) => x.arm === 'off')) expect(r.entities).toBe(0)
  expect(delta, detail).toBeLessThanOrEqual(DELTA_P95_MS)
})
