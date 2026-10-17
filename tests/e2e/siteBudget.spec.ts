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

/**
 * F8B (2026-10-17): the busiest F8B state, Buri in the build-up window (13 buildings, 9 drawn as glbs, 8 vehicles, 3 parked
 * P-38s, 447 clutter pieces), against the same sites-free free-flight scenario, the same camera and the same 1.0 ms tripwire.
 * (Buri's clutter is the most of any F8B state, 447 against Bayug's 294 and San Pablo's 201; its vehicle cap of 12 is not
 * reached by any F8B state, 8 at most, so "at the cap" does not apply: this is the busiest F8B state, not a cap run.)
 * Frozen camera 520 m west of Buri's center and 60 m north of its axis at 160 m, looking east along the strip.
 *
 * The second test splits the delta by source with the DEV `?siteOmit=` flag: the same state with buildings, aircraft, vehicles
 * or clutter left out. It records, never asserts (a split of a delta of about a millisecond is noise-bound; read it as an
 * ordering, not as exact numbers). Both run per mode: trees off and trees on, from a fresh dev server each.
 */
const BURI = { x: -41025, z: -22005 }
type ArmId = 'base' | 'site' | 'no-buildings' | 'no-aircraft' | 'no-vehicles' | 'no-clutter'
const OMIT: Record<ArmId, string | null> = { base: null, site: '', 'no-buildings': 'buildings', 'no-aircraft': 'aircraft', 'no-vehicles': 'vehicles', 'no-clutter': 'clutter' }
type BuriRun = { readonly arm: ArmId; readonly p95: number; readonly n: number; readonly models: number }
async function measureBuri(page: Page, arm: ArmId): Promise<BuriRun> {
  const omit = OMIT[arm]
  const q = new URLSearchParams({
    cloudTier: 'high', oceanTier: 'high', sceneryView: '1',
    spawnX: String(BURI.x - 520), spawnY: '160', spawnZ: String(BURI.z - 60),
    ...(omit === null ? {} : { siteState: 'buri:buildup' }),
    ...(omit === null || omit === '' ? {} : { siteOmit: omit }),
  })
  await page.goto(withParams(`/?${q.toString()}`, {}))
  await waitForTerrain(page)
  const withModels = omit === null ? false : omit !== 'buildings'
  if (withModels) await page.waitForFunction(() => (window as DiagWindow).__ww2!.siteScenery().some((s) => s.airfield === 'buri' && s.modelsAttached > 0), undefined, { timeout: 30_000 })
  await page.waitForTimeout(3_000)
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
  await page.waitForTimeout(6_000)
  const gpu = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
  const models = await page.evaluate(() => (window as DiagWindow).__ww2!.siteScenery().reduce((n, s) => n + s.modelsAttached, 0))
  const run = { arm, p95: percentile(gpu, 0.95), n: gpu.length, models }
  console.log(`SITEBUDGET-F8B arm=${arm} p95=${run.p95.toFixed(3)} n=${run.n} models=${run.models}`)
  return run
}
const medianOf = (runs: readonly BuriRun[], arm: ArmId): number => percentile(runs.filter((x) => x.arm === arm).map((x) => x.p95), 0.5)
const trees = (): string => (process.env.BUDGET_PARAMS?.includes('trees=off') ? 'off' : 'on')

test('1440p high: Buri in the build-up (the busiest F8B state) adds at most 1.0 ms of gpu p95 over the sites-free base (F8B budget)', async ({ page }) => {
  const runs: BuriRun[] = []
  for (let i = 0; i < 6; i++) for (const arm of ['base', 'site'] as const) runs.push(await measureBuri(page, arm))
  const delta = medianOf(runs, 'site') - medianOf(runs, 'base')
  const detail = `Buri buildup: site p95 ${medianOf(runs, 'site').toFixed(3)} ms vs base ${medianOf(runs, 'base').toFixed(3)} ms, delta ${delta.toFixed(3)} ms (trees ${trees()})`
  console.log(`SITEBUDGET-F8B ${detail}`)
  console.log(`SITEBUDGET-F8B raw ${JSON.stringify(runs.map((r) => [r.arm, +r.p95.toFixed(3)]))}`)
  test.info().annotations.push({ type: 'budget', description: detail })
  for (const r of runs) expect(r.n, 'too few GPU samples for a percentile').toBeGreaterThan(100)
  for (const r of runs.filter((x) => x.arm === 'site')) expect(r.models, 'the building glbs were not attached').toBe(9)
  for (const r of runs.filter((x) => x.arm === 'base')) expect(r.models).toBe(0)
  expect(delta, detail).toBeLessThanOrEqual(DELTA_P95_MS)
})

test('1440p high: Buri build-up p95 split by source (records only: differential arms with ?siteOmit=)', async ({ page }) => {
  test.setTimeout(2_400_000)
  const arms: readonly ArmId[] = ['base', 'site', 'no-buildings', 'no-aircraft', 'no-vehicles', 'no-clutter']
  const runs: BuriRun[] = []
  for (let i = 0; i < 6; i++) for (const arm of arms) runs.push(await measureBuri(page, arm))
  const site = medianOf(runs, 'site')
  const share = Object.fromEntries((['no-buildings', 'no-aircraft', 'no-vehicles', 'no-clutter'] as const).map((a) => [a.slice(3), +(site - medianOf(runs, a)).toFixed(3)]))
  const detail = `Buri buildup split (trees ${trees()}): base ${medianOf(runs, 'base').toFixed(3)}, site ${site.toFixed(3)}, delta by source (site minus site-without) ${JSON.stringify(share)}`
  console.log(`SITEBUDGET-F8B ${detail}`)
  console.log(`SITEBUDGET-F8B split raw ${JSON.stringify(runs.map((r) => [r.arm, +r.p95.toFixed(3)]))}`)
  test.info().annotations.push({ type: 'budget', description: detail })
  for (const r of runs) expect(r.n, 'too few GPU samples for a percentile').toBeGreaterThan(100)
})

/**
 * F8C (2026-10-17): the busiest F8C state, the landing beaches in the build-up window (18 buildings, 11 of them standing glbs, 7 more
 * rubble from the Japanese works; 12 vehicles, the cap, four of them LCVPs afloat; 197 clutter pieces), against the same sites-free
 * free-flight scenario, the same 1.0 ms tripwire, six interleaved loads per arm, the median of GPU p95, trees off and trees on from a fresh
 * dev server each. Chosen by instance count among the three F8C sites (landing beaches buildup 227, Ormoc buildup 65, Jinamoc buildup 44; the
 * F8A Tacloban state, 515 clutter and 8 parked aircraft, remains the heaviest site-state of all). The camera is frozen 350 m offshore of the
 * beachhead at 200 m, looking at it (the capture spec's `look`), so the whole site is in frame in both arms.
 *
 * The second test splits the delta by source with `?siteOmit=`, the arms interleaved inside each round as F8B's was, and prints the base
 * arm of every round beside the split, so a split that is drift can be told from one that is cost (F8B's trees-off split was drift). It
 * records, never asserts.
 */
const BEACH = { c: { x: -30900, z: -42200 }, h: 23, p: [350, 60] as const, alt: 200, t: [-100, 0] as const }
const beachCamera = (): string => {
  const r = (BEACH.h * Math.PI) / 180
  const world = (x: number, z: number): { x: number; z: number } => ({ x: BEACH.c.x + x * Math.cos(r) - z * Math.sin(r), z: BEACH.c.z + x * Math.sin(r) + z * Math.cos(r) })
  const cam = world(BEACH.p[0], BEACH.p[1]), tgt = world(BEACH.t[0], BEACH.t[1])
  const dx = tgt.x - cam.x, dz = tgt.z - cam.z
  const yaw = (Math.atan2(-dz, dx) * 180) / Math.PI, pitch = (-Math.atan2(BEACH.alt - 3, Math.hypot(dx, dz)) * 180) / Math.PI
  return `spawnX=${Math.round(cam.x)}&spawnY=${BEACH.alt}&spawnZ=${Math.round(cam.z)}&look=${yaw.toFixed(1)},${pitch.toFixed(1)}`
}
async function measureBeach(page: Page, arm: ArmId): Promise<BuriRun> {
  const omit = OMIT[arm]
  await page.goto(withParams(`/?cloudTier=high&oceanTier=high&sceneryView=1&${beachCamera()}${omit === null ? '' : '&siteState=landing-beaches:buildup'}${omit === null || omit === '' ? '' : `&siteOmit=${omit}`}`, {}))
  await waitForTerrain(page)
  const withModels = omit === null ? false : omit !== 'buildings'
  if (withModels) await page.waitForFunction(() => (window as DiagWindow).__ww2!.siteScenery().some((s) => s.airfield === 'landing-beaches' && s.modelsAttached > 0), undefined, { timeout: 30_000 })
  await page.waitForTimeout(3_000)
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
  await page.waitForTimeout(6_000)
  const gpu = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
  const models = await page.evaluate(() => (window as DiagWindow).__ww2!.siteScenery().reduce((n, s) => n + s.modelsAttached, 0))
  const run = { arm, p95: percentile(gpu, 0.95), n: gpu.length, models }
  console.log(`SITEBUDGET-F8C arm=${arm} p95=${run.p95.toFixed(3)} n=${run.n} models=${run.models}`)
  return run
}

test('1440p high: the landing beaches in the build-up (the busiest F8C state) add at most 1.0 ms of gpu p95 over the sites-free base (F8C budget)', async ({ page }) => {
  const runs: BuriRun[] = []
  for (let i = 0; i < 6; i++) for (const arm of ['base', 'site'] as const) runs.push(await measureBeach(page, arm))
  const delta = medianOf(runs, 'site') - medianOf(runs, 'base')
  const detail = `Landing beaches buildup: site p95 ${medianOf(runs, 'site').toFixed(3)} ms vs base ${medianOf(runs, 'base').toFixed(3)} ms, delta ${delta.toFixed(3)} ms (trees ${trees()})`
  console.log(`SITEBUDGET-F8C ${detail}`)
  console.log(`SITEBUDGET-F8C raw ${JSON.stringify(runs.map((r) => [r.arm, +r.p95.toFixed(3)]))}`)
  test.info().annotations.push({ type: 'budget', description: detail })
  for (const r of runs) expect(r.n, 'too few GPU samples for a percentile').toBeGreaterThan(100)
  for (const r of runs.filter((x) => x.arm === 'site')) expect(r.models, 'the building glbs were not attached').toBe(11)
  for (const r of runs.filter((x) => x.arm === 'base')) expect(r.models).toBe(0)
  expect(delta, detail).toBeLessThanOrEqual(DELTA_P95_MS)
})

test('1440p high: landing beaches build-up p95 split by source, arms interleaved in each round (records only: differential arms with ?siteOmit=)', async ({ page }) => {
  test.setTimeout(2_400_000)
  const arms: readonly ArmId[] = ['base', 'site', 'no-buildings', 'no-aircraft', 'no-vehicles', 'no-clutter']
  const runs: (BuriRun & { round: number })[] = []
  for (let i = 0; i < 6; i++) for (const arm of arms) runs.push({ ...(await measureBeach(page, arm)), round: i + 1 })
  const site = medianOf(runs, 'site')
  const share = Object.fromEntries((['no-buildings', 'no-aircraft', 'no-vehicles', 'no-clutter'] as const).map((a) => [a.slice(3), +(site - medianOf(runs, a)).toFixed(3)]))
  const baseByRound = runs.filter((r) => r.arm === 'base').map((r) => +r.p95.toFixed(3))
  const detail = `Landing beaches buildup split (trees ${trees()}): base ${medianOf(runs, 'base').toFixed(3)}, site ${site.toFixed(3)}, delta by source (site minus site-without) ${JSON.stringify(share)}; base arm by round ${JSON.stringify(baseByRound)} (drift = last minus first ${(baseByRound.at(-1)! - baseByRound[0]!).toFixed(3)})`
  console.log(`SITEBUDGET-F8C ${detail}`)
  console.log(`SITEBUDGET-F8C split raw ${JSON.stringify(runs.map((r) => [r.round, r.arm, +r.p95.toFixed(3)]))}`)
  test.info().annotations.push({ type: 'budget', description: detail })
  for (const r of runs) expect(r.n, 'too few GPU samples for a percentile').toBeGreaterThan(100)
})
