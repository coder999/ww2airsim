import { test, expect, type Page } from '@playwright/test'
import { percentile, TRIPWIRE_1440P_P95_MS, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'
import { windowsForChapter } from '../../src/campaign/worldStates.js'

/**
 * F10E (2026-10-17): what the two finales cost, measured and reported, NEVER tuned (master plan Decision 2: the finale gate stays as written and a red
 * result is recorded, not fixed). A6 and J6 carry the locked populations (24 airborne, 10 ships, 14 or 12 in the close set, about 12 ground vehicles
 * moving or parked per side) over the six Burauen/Tacloban sites in the window each chapter plays in.
 *
 * The cost is split by source with six arms, all loaded six times, interleaved in rounds, the MEDIAN of each arm's GPU p95 compared (as siteBudget.spec.ts):
 *   base        free-flight, no sites, no population (the empty baseline)
 *   sites-a6    the same free-flight with the A6 site windows (endgame) merged in: the SITE cost
 *   sites-j6    the same with the J6 windows (j6-alternate)
 *   a6, j6      the finale scenario itself, played live for 80 s so every held group has spawned and the fighting has begun
 *   drops       free-flight with the J6/A6 worst-case drop (24 men and 8 bundles under canopy, `?paradrop=24,8`): the DROP cost
 * so population cost = finale minus its sites arm, and the total is finale minus base. The view is the pilot's own, parked on the ramp (Tacloban for A6,
 * Buri for J6), unpaused: the GPU p95 is what that camera draws, the rAF p95 and the main thread's work per frame carry the simulation of 24 aircraft.
 * The gate as written: the finale's GPU p95 at or under the 8.33 ms 1440p tripwire; the rAF p95 is recorded beside the 16.7 ms (60 Hz) bar. Run it with and
 * without `BUDGET_PARAMS=trees=off`, from a fresh dev server each time, inside `hwlock ryzen-budget` and with no other browser on ryzen's GPU (AGENTS.md).
 */
const RAF_60HZ_MS = 16.7
const SETTLE_TICK = 80 * 60
test.setTimeout(3_600_000)
const consoleErrors: string[] = []
test.beforeEach(async ({ page }) => {
  consoleErrors.length = 0
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400)) })
  page.on('pageerror', (e) => consoleErrors.push(e.message))
  await page.setViewportSize({ width: 2560, height: 1440 })
})
test.afterEach(() => { expect(consoleErrors, consoleErrors.join('\n')).toEqual([]) })

const siteState = (chapter: 'A6' | 'J6'): string => Object.entries(windowsForChapter(chapter)).map(([site, window]) => `${site}:${window}`).join(',')
type ArmId = 'base' | 'sites-a6' | 'sites-j6' | 'a6' | 'j6' | 'drops'
const URLS: Record<ArmId, Record<string, string>> = {
  base: { scenario: 'free-flight', launch: '1' },
  'sites-a6': { scenario: 'free-flight', launch: '1', siteState: siteState('A6') },
  'sites-j6': { scenario: 'free-flight', launch: '1', siteState: siteState('J6') },
  a6: { scenario: 'a6-battle-for-the-airfields', launch: '1', siteState: siteState('A6') },
  j6: { scenario: 'j6-operation-te-go', launch: '1', siteState: siteState('J6') },
  drops: { scenario: 'free-flight', launch: '1', paradrop: '24,8' },
}
type Run = { readonly arm: ArmId; readonly gpu: number; readonly raf: number; readonly work: number; readonly n: number; readonly aircraft: number; readonly drawn: number }
async function measure(page: Page, arm: ArmId): Promise<Run> {
  await page.goto(withParams(`/?${new URLSearchParams({ cloudTier: 'high', oceanTier: 'high', ...URLS[arm] }).toString()}`, {}))
  await waitForTerrain(page)
  const finale = arm === 'a6' || arm === 'j6'
  if (finale) await page.waitForFunction((t) => ((window as DiagWindow).__ww2?.tick() ?? 0) >= t, SETTLE_TICK, { timeout: 180_000 })
  else await page.waitForTimeout(4_000)
  if (arm === 'drops') { await page.keyboard.down('Numpad0'); await page.waitForTimeout(6_000) }
  const seen = await page.evaluate(() => { const d = (window as DiagWindow).__ww2!; return { counts: d.entityCounts(), chutes: d.parachutists() } })
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
  await page.waitForTimeout(8_000)
  const t = await page.evaluate(() => { const d = (window as DiagWindow).__ww2!; return { gpu: d.gpuFrameTimesMs(), raf: d.frameTimesMs(), work: d.cpuFrameSamples().map((c) => c.workMs) } })
  if (arm === 'drops') await page.keyboard.up('Numpad0')
  const aircraft = arm === 'drops' ? seen.chutes.entities : (seen.counts as { aircraft?: number }).aircraft ?? 0
  const run = { arm, gpu: percentile(t.gpu, 0.95), raf: percentile(t.raf, 0.95), work: percentile(t.work, 0.95), n: t.gpu.length, aircraft, drawn: seen.chutes.drawn }
  console.log(`FINALEBUDGET arm=${arm} gpuP95=${run.gpu.toFixed(3)} rafP95=${run.raf.toFixed(3)} workP95=${run.work.toFixed(3)} n=${run.n} entities=${run.aircraft} counts=${JSON.stringify(seen.counts)}`)
  return run
}
const med = (runs: readonly Run[], arm: ArmId, key: 'gpu' | 'raf' | 'work'): number => percentile(runs.filter((r) => r.arm === arm).map((r) => r[key]), 0.5)
const trees = (): string => (process.env.BUDGET_PARAMS?.includes('trees=off') ? 'off' : 'on')

test('1440p high: the finales, split by source (base, sites, population, drops), six interleaved loads per arm, gpu p95 against the 8.33 ms tripwire (F10E budget, reported never tuned)', async ({ page }) => {
  const arms: readonly ArmId[] = ['base', 'sites-a6', 'a6', 'sites-j6', 'j6', 'drops']
  const runs: Run[] = []
  for (let round = 0; round < 6; round++) for (const arm of arms) runs.push(await measure(page, arm))
  const m = (a: ArmId, k: 'gpu' | 'raf' | 'work' = 'gpu') => med(runs, a, k)
  const row = (a: ArmId) => `${a}: gpu ${m(a).toFixed(3)} raf ${m(a, 'raf').toFixed(3)} work ${m(a, 'work').toFixed(3)}`
  const detail = `trees ${trees()} | ${arms.map(row).join(' | ')} | A6 site ${(m('sites-a6') - m('base')).toFixed(3)} population ${(m('a6') - m('sites-a6')).toFixed(3)} total ${(m('a6') - m('base')).toFixed(3)} | J6 site ${(m('sites-j6') - m('base')).toFixed(3)} population ${(m('j6') - m('sites-j6')).toFixed(3)} total ${(m('j6') - m('base')).toFixed(3)} | drops ${(m('drops') - m('base')).toFixed(3)} (ms; bars ${TRIPWIRE_1440P_P95_MS} gpu, ${RAF_60HZ_MS} raf)`
  console.log(`FINALEBUDGET ${detail}`)
  console.log(`FINALEBUDGET raw ${JSON.stringify(runs.map((r) => [r.arm, +r.gpu.toFixed(3), +r.raf.toFixed(3), +r.work.toFixed(3)]))}`)
  test.info().annotations.push({ type: 'budget', description: detail })
  for (const r of runs) expect(r.n, 'too few GPU samples for a percentile').toBeGreaterThan(100)
  for (const a of ['a6', 'j6'] as const) for (const r of runs.filter((x) => x.arm === a)) expect(r.aircraft, `${a}: the finale population is not in play`).toBeGreaterThanOrEqual(20)
  for (const r of runs.filter((x) => x.arm === 'drops')) { expect(r.aircraft, 'the stick was not released').toBe(32); expect(r.drawn, 'not every canopy is drawn').toBe(32) }
  expect(m('a6'), `A6 ${detail}`).toBeLessThanOrEqual(TRIPWIRE_1440P_P95_MS)
  expect(m('j6'), `J6 ${detail}`).toBeLessThanOrEqual(TRIPWIRE_1440P_P95_MS)
})
