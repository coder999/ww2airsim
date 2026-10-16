import { test, expect, type Page } from '@playwright/test'
import { percentile, recordFrameTime, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

/**
 * F6A night budget gates (plan Task 11; Mark's gate H0: High, 1440p, gpu p95 at most 8.33 ms), reference GPU only,
 * under `hwlock ryzen-budget`, THREE runs per view and the MEDIAN p95:
 *   (b) each new night view at most 8.33 ms (target 7.5);
 *   (c) lights on minus lights off on the same view at most 1.0 ms (alternating in one page load through `__ww2.setLightsOn`).
 * Gate (a), the nine existing day views regressing by less than 0.3 ms, compares this branch with main and is
 * measured by running budget.spec.ts against both servers (recorded in the handoff, not asserted here: a test
 * cannot hold main's numbers).
 * Titles say "budget" and "p95" so the nightly sorts them as budget tests (docs/testing.md).
 */
const GATE_MS = 8.33
const LIGHTS_COST_MS = 1.0
const TAC = { x: -29666, z: -47605 }
test.setTimeout(240_000)
const errors: string[] = []
test.beforeEach(({ page }) => {
  errors.length = 0
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 400)) })
  page.on('pageerror', (e) => errors.push(e.message))
})
test.afterEach(() => { expect(errors, errors.join('\n')).toEqual([]) })

type NightView = { readonly name: string; readonly url: string; readonly lights: boolean }
/** Query params for an A/B run, e.g. BUDGET_PARAMS=trees=off (the same hook budget.spec.ts has). */
const extra = Object.fromEntries(new URLSearchParams(process.env.BUDGET_PARAMS ?? ''))
const launch = (scenario: string): string => withParams('/', { scenario, launch: '1', aircraft: 'f6f-hellcat', loadout: 'clean', god: '1' })
export const NIGHT_VIEWS: readonly NightView[] = [
  { name: 'night-floor-600', url: withParams(spawnUrl({ x: TAC.x, y: 600, z: TAC.z - 6000 }), { timeOfDay: '21' }), lights: false },
  { name: 'night-dusk-j5', url: withParams(spawnUrl({ x: TAC.x, y: 600, z: TAC.z - 6000 }), { timeOfDay: '18.5' }), lights: false },
  { name: 'night-field', url: launch('night-field'), lights: true },
  { name: 'night-bay', url: launch('night-bay'), lights: true },
]

async function p95Once(page: Page, url: string): Promise<number> {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(withParams(url, { cloudTier: 'high', oceanTier: 'high', ...extra }))
  await waitForTerrain(page)
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.tick() ?? 0) > 240, undefined, { timeout: 60_000 })
  await page.waitForTimeout(3000)
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
  await page.waitForTimeout(6000)
  const g = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
  expect(g.length, 'GPU timestamp samples were collected').toBeGreaterThan(120)
  return percentile(g, 0.95)
}
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!
async function medianP95(page: Page, url: string): Promise<number> {
  const runs: number[] = []
  for (let i = 0; i < 3; i++) runs.push(await p95Once(page, url))
  return median(runs)
}

for (const view of NIGHT_VIEWS) {
  test(`1440p budget (high): ${view.name} gpu p95 at most ${GATE_MS} ms`, async ({ page }) => {
    const p95 = await medianP95(page, view.url)
    console.log(`NIGHTBUDGET ${view.name} lights=on median p95=${p95.toFixed(3)}`)
    recordFrameTime(p95, `at 1440p high, ${view.name}`)
    expect(p95).toBeLessThanOrEqual(GATE_MS)
  })
  if (view.lights) {
    // Lights on and off ALTERNATE inside one page load (six samples each, medians), so machine drift between runs
    // (measured 2026-10-14: the same view swung 5 to 15 ms between loads) cancels out of the difference.
    test(`1440p budget (high): ${view.name} lights cost at most ${LIGHTS_COST_MS} ms of gpu p95`, async ({ page }) => {
      await page.setViewportSize({ width: 2560, height: 1440 })
      await page.goto(withParams(view.url, { cloudTier: 'high', oceanTier: 'high', ...extra }))
      await waitForTerrain(page)
      // A freshly loaded page spends its first seconds before the world is rendering at full cost (samples of 2 to 3 ms
      // were seen, 2026-10-14): wait for 4 s of sim, then sample.
      await page.waitForFunction(() => ((window as DiagWindow).__ww2?.tick() ?? 0) > 240, undefined, { timeout: 60_000 })
      await page.waitForTimeout(3000)
      const sample = async (): Promise<number> => {
        await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
        await page.waitForTimeout(4000)
        const g = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
        expect(g.length).toBeGreaterThan(80)
        return percentile(g, 0.95)
      }
      const on: number[] = [], off: number[] = []
      for (let i = 0; i < 6; i++) {
        await page.evaluate(() => (window as DiagWindow).__ww2!.setLightsOn(true))
        on.push(await sample())
        await page.evaluate(() => (window as DiagWindow).__ww2!.setLightsOn(false))
        off.push(await sample())
      }
      const cost = median(on) - median(off)
      console.log(`NIGHTBUDGET ${view.name} on=${median(on).toFixed(3)} off=${median(off).toFixed(3)} cost=${cost.toFixed(3)}`)
      recordFrameTime(cost, `lights cost, ${view.name}`)
      expect(cost).toBeLessThanOrEqual(LIGHTS_COST_MS)
    })
  }
}
