import { test, expect, type Page } from '@playwright/test'
import { percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'
import type { FxStressName } from '../../src/render/fx/stress.js'

/**
 * Spec §4.5: the effects budget. Follow view on the runway, the stress scene
 * ~300 m ahead (fx/stress.ts 'budget': 8 bombs, 32 rockets, gunfire on land
 * and water at 20 Hz, a burning ship, a collapsing building, one air kill).
 * Clouds and ocean are forced to high so a probe cannot move them.
 *
 * Differential p95s across two page loads are noise-dominated (docs/clouds.md
 * §4, Measurement), so each arm is loaded twice, interleaved off/on/off/on,
 * and the gate compares the arms' means.
 *
 * The legacy 6 ms absolute check remains in terrain.spec.ts. It is not an
 * effects cost gate: a shared baseline over 6 ms must not be blamed on E1.
 */
const FX_DELTA_P95_MS = 1.0
/** The eye inside a smoke plume: accepted by Mark on 2026-09-28 at the baked sheets' measured
 *  +2.421 ms (plan E2 Task 10; E1's placeholders fit in 1.0). 3.0 keeps it a tripwire. */
const EYE_SMOKE_DELTA_P95_MS = 3.0
const BUDGET_4K_PHOTO_P95_MS = 16.67
test.setTimeout(420_000)
const consoleErrors: string[] = []
test.beforeEach(async ({ page }) => {
  consoleErrors.length = 0
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400)) })
  page.on('pageerror', (e) => consoleErrors.push(e.message))
  await page.setViewportSize({ width: 2560, height: 1440 })
})
test.afterEach(() => { expect(consoleErrors, consoleErrors.join('\n')).toEqual([]) })

type Run = { readonly fx: string; readonly p95: number; readonly n: number; readonly live: number; readonly cpuMs: number }
async function measure(page: Page, fx: 'off' | 'low' | 'medium' | 'high', scene: FxStressName): Promise<Run> {
  await page.goto(withParams('/', { fx, cloudTier: 'high', oceanTier: 'high' }))
  await waitForTerrain(page)
  await page.waitForTimeout(3000)
  await page.evaluate((n) => (window as DiagWindow).__ww2!.fxStress(n), scene)
  await page.waitForTimeout(1000)
  const mid = await page.evaluate(() => (window as DiagWindow).__ww2!.fx())
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
  await page.waitForTimeout(5000)
  const gpu = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
  const run = { fx, p95: percentile(gpu, 0.95), n: gpu.length, live: mid.live, cpuMs: mid.cpuMs }
  console.log(`FXBUDGET ${scene} fx=${fx} p95=${run.p95.toFixed(3)} n=${run.n} live=${run.live} cpuMs=${run.cpuMs.toFixed(3)}`)
  return run
}
const mean = (runs: readonly Run[], fx: string): number => { const r = runs.filter((x) => x.fx === fx); return r.reduce((s, x) => s + x.p95, 0) / r.length }

test('1440p high: effects add at most 1.0 ms of gpu p95 over ?fx=off (spec §4.5)', async ({ page }) => {
  const runs: Run[] = []
  for (const fx of ['off', 'high', 'off', 'high'] as const) runs.push(await measure(page, fx, 'budget'))
  const delta = mean(runs, 'high') - mean(runs, 'off')
  const detail = `effects p95 ${mean(runs, 'high').toFixed(3)} ms vs off ${mean(runs, 'off').toFixed(3)} ms, delta ${delta.toFixed(3)} ms`
  console.log(`FXBUDGET ${detail}`)
  test.info().annotations.push({ type: 'budget', description: detail })
  for (const r of runs) expect(r.n, 'too few GPU samples for a percentile').toBeGreaterThan(100)
  for (const r of runs.filter((x) => x.fx === 'high')) expect(r.live, 'the stress scene did not populate the pool').toBeGreaterThan(800)
  expect(delta, detail).toBeLessThanOrEqual(FX_DELTA_P95_MS)
})

test('1440p medium and low: populated and recorded', async ({ page }) => {
  for (const fx of ['medium', 'low'] as const) {
    const r = await measure(page, fx, 'budget')
    expect(r.n, 'too few GPU samples for a percentile').toBeGreaterThan(100)
    expect(r.live, 'the stress scene did not populate the pool').toBeGreaterThan(0)
  }
})

test('the eye inside a smoke plume adds at most 3.0 ms (Review Focus 5; plan E2 Task 10 ruling)', async ({ page }) => {
  const off = await measure(page, 'off', 'eye-smoke')
  const high = await measure(page, 'high', 'eye-smoke')
  const delta = high.p95 - off.p95
  const detail = `eye-smoke p95 ${high.p95.toFixed(3)} ms vs off ${off.p95.toFixed(3)} ms, delta ${delta.toFixed(3)} ms`
  console.log(`FXBUDGET ${detail}`)
  test.info().annotations.push({ type: 'budget', description: detail })
  expect(off.n, 'too few off-arm GPU samples for a percentile').toBeGreaterThan(100)
  expect(high.n, 'too few high-arm GPU samples for a percentile').toBeGreaterThan(100)
  expect(high.live).toBeGreaterThan(0)
  expect(delta, detail).toBeLessThanOrEqual(EYE_SMOKE_DELTA_P95_MS)
})

async function measure4kPhoto(page: Page, fx: 'off' | 'high'): Promise<Run> {
  await page.setViewportSize({ width: 3840, height: 2160 })
  await page.goto(withParams('/', { look: '55,30', fx, cloudTier: 'high', oceanTier: 'high' }))
  await waitForTerrain(page)
  await page.waitForTimeout(3000)
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
  await page.waitForTimeout(6000)
  const gpu = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
  const mid = await page.evaluate(() => (window as DiagWindow).__ww2!.fx())
  const run = { fx, p95: percentile(gpu, 0.95), n: gpu.length, live: mid.live, cpuMs: mid.cpuMs }
  console.log(`BUDGET4K high photo fx=${fx} p95=${run.p95.toFixed(3)} n=${run.n}`)
  return run
}

test('4K high photo: idle effects stay inside the 16.67 ms budget', async ({ page }) => {
  const off = await measure4kPhoto(page, 'off')
  const high = await measure4kPhoto(page, 'high')
  const delta = high.p95 - off.p95
  const detail = `4K photo p95 ${high.p95.toFixed(3)} ms vs off ${off.p95.toFixed(3)} ms, delta ${delta.toFixed(3)} ms`
  console.log(`FXBUDGET ${detail}`)
  test.info().annotations.push({ type: 'budget', description: detail })
  expect(off.n, 'too few off-arm GPU samples for a percentile').toBeGreaterThan(30)
  expect(high.n, 'too few high-arm GPU samples for a percentile').toBeGreaterThan(30)
  expect(high.p95, detail).toBeLessThanOrEqual(BUDGET_4K_PHOTO_P95_MS)
  expect(delta, detail).toBeLessThanOrEqual(FX_DELTA_P95_MS)
})
