import { test, expect, type Page } from '@playwright/test'
import { percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

/**
 * F8A Task 11 (2026-10-16): what the busiest F8A site-state costs. Tacloban in the build-up window carries the vehicle cap
 * (12 placed vehicles), 8 parked aircraft, 19 hit-box buildings drawn as glbs, 7 lights and 259 instanced clutter pieces.
 * It is measured against the same free-flight scenario with NO sites (procedural Tacloban, the shipped base), so the
 * difference is what F8A adds. The camera is the same in both arms and frozen (`sceneryView=1`, paused 500 ft from the
 * apron, looking at the base), so this prices the GPU, not the sim (the sim's cost is `tools/sites/vehicleCost.ts`).
 *
 * Differential p95s across two page loads are noise-dominated (docs/clouds.md section 4), so each arm is loaded six
 * times, interleaved, and the gate compares the arms' MEDIANS. Run it with and without `BUDGET_PARAMS=trees=off`, from a
 * fresh dev server each time (docs/testing.md, ryzen budget regression note): the forest inflates the baseline.
 *
 * The 1.0 ms delta is a TRIPWIRE chosen here, not a ruling: the effects budget's number, as F7B's drop spec used. Mark's
 * budget rule (2026-10-16): the gate stays as written and a red result is documented with its numbers, never tuned.
 */
const DELTA_P95_MS = 1.0
test.setTimeout(900_000)
const TACLOBAN = { x: -29666, z: -47605 }
const consoleErrors: string[] = []
test.beforeEach(async ({ page }) => {
  consoleErrors.length = 0
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400)) })
  page.on('pageerror', (e) => consoleErrors.push(e.message))
  await page.setViewportSize({ width: 2560, height: 1440 })
})
test.afterEach(() => { expect(consoleErrors, consoleErrors.join('\n')).toEqual([]) })

type Arm = 'base' | 'site'
type Run = { readonly arm: Arm; readonly p95: number; readonly n: number; readonly models: number }
async function measure(page: Page, arm: Arm): Promise<Run> {
  const q = new URLSearchParams({
    cloudTier: 'high', oceanTier: 'high', sceneryView: '1',
    spawnX: String(TACLOBAN.x - 520), spawnY: '160', spawnZ: String(TACLOBAN.z - 60),
    ...(arm === 'site' ? { siteState: 'tacloban:buildup' } : {}),
  })
  await page.goto(withParams(`/?${q.toString()}`, {}))
  await waitForTerrain(page)
  if (arm === 'site') await page.waitForFunction(() => (window as DiagWindow).__ww2!.siteScenery().some((s) => s.airfield === 'tacloban' && s.modelsAttached > 0), undefined, { timeout: 30_000 })
  await page.waitForTimeout(3_000)
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
  await page.waitForTimeout(6_000)
  const gpu = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
  const models = await page.evaluate(() => (window as DiagWindow).__ww2!.siteScenery().reduce((n, s) => n + s.modelsAttached, 0))
  const run = { arm, p95: percentile(gpu, 0.95), n: gpu.length, models }
  console.log(`SITEBUDGET arm=${arm} p95=${run.p95.toFixed(3)} n=${run.n} models=${run.models}`)
  return run
}
/** Median, not mean: one slow load must not swing the gate (the budget-analysis session's advice, 2026-10-16). */
const median = (runs: readonly Run[], arm: Arm): number => percentile(runs.filter((x) => x.arm === arm).map((x) => x.p95), 0.5)

test('1440p high: Tacloban at the vehicle cap adds at most 1.0 ms of gpu p95 over the sites-free base (F8A budget)', async ({ page }) => {
  const runs: Run[] = []
  for (const arm of ['base', 'site', 'base', 'site', 'base', 'site', 'base', 'site', 'base', 'site', 'base', 'site'] as const) runs.push(await measure(page, arm))
  const delta = median(runs, 'site') - median(runs, 'base')
  const detail = `site p95 ${median(runs, 'site').toFixed(3)} ms vs base ${median(runs, 'base').toFixed(3)} ms, delta ${delta.toFixed(3)} ms (trees ${process.env.BUDGET_PARAMS?.includes('trees=off') ? 'off' : 'on'})`
  console.log(`SITEBUDGET ${detail}`)
  test.info().annotations.push({ type: 'budget', description: detail })
  for (const r of runs) expect(r.n, 'too few GPU samples for a percentile').toBeGreaterThan(100)
  for (const r of runs.filter((x) => x.arm === 'site')) expect(r.models, 'the building glbs were not attached').toBe(19)
  for (const r of runs.filter((x) => x.arm === 'base')) expect(r.models).toBe(0)
  expect(delta, detail).toBeLessThanOrEqual(DELTA_P95_MS)
})
