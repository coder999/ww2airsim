import { test, expect, type Page } from '@playwright/test'
import { percentile, recordFrameTime, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

/**
 * F6A night budget gates (plan Task 11; Mark's gate H0: High, 1440p, gpu p95 at most 8.33 ms), reference GPU only,
 * under `hwlock ryzen-budget`, THREE runs per view and the MEDIAN p95:
 *   (b) each new night view at most 8.33 ms (target 7.5);
 *   (c) lights on minus lights off on the same view at most 1.0 ms (`?night=lights:0` is the off twin).
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
const launch = (scenario: string): string => withParams('/', { scenario, launch: '1', aircraft: 'f6f-hellcat', loadout: 'clean' })
export const NIGHT_VIEWS: readonly NightView[] = [
  { name: 'night-floor-600', url: withParams(spawnUrl({ x: TAC.x, y: 600, z: TAC.z - 6000 }), { timeOfDay: '21' }), lights: false },
  { name: 'night-dusk-j5', url: withParams(spawnUrl({ x: TAC.x, y: 600, z: TAC.z - 6000 }), { timeOfDay: '18.5' }), lights: false },
  { name: 'night-field', url: launch('night-field'), lights: true },
  { name: 'night-bay', url: launch('night-bay'), lights: true },
]

async function p95Once(page: Page, url: string): Promise<number> {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(withParams(url, { cloudTier: 'high', oceanTier: 'high' }))
  await waitForTerrain(page)
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
    test(`1440p budget (high): ${view.name} lights cost at most ${LIGHTS_COST_MS} ms of gpu p95`, async ({ page }) => {
      const on = await medianP95(page, view.url)
      const off = await medianP95(page, withParams(view.url, { night: 'lights:0' }))
      console.log(`NIGHTBUDGET ${view.name} on=${on.toFixed(3)} off=${off.toFixed(3)} cost=${(on - off).toFixed(3)}`)
      recordFrameTime(on - off, `lights cost, ${view.name}`)
      expect(on - off).toBeLessThanOrEqual(LIGHTS_COST_MS)
    })
  }
}
