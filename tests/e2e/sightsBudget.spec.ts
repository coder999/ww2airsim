import { test, expect, type Page } from '@playwright/test'
import { percentile, recordFrameTime, spawnUrl, waitForTerrain, type DiagWindow } from './harness.js'
import { withParams } from './views.js'

/**
 * F6B budget gate (b) (plan section 7), reference GPU only, under `hwlock ryzen-budget`: the sight (the `U` marker:
 * bombsight, torpedosight, with its labels and run line) on minus off at most 0.10 ms of gpu p95, ALTERNATING inside one
 * page load (six pairs, medians) so the bimodal ryzen frame time (docs/testing.md "Known gaps") cancels out of the difference.
 * Titles say "budget" and "p95" so the nightly sorts them as budget tests.
 */
const SIGHT_COST_MS = 0.1
const BAY = { x: -27466, z: -50805 }
test.setTimeout(300_000)
const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!

async function alternate(page: Page, url: string, before: () => Promise<void>): Promise<{ on: number; off: number }> {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(withParams(url, { cloudTier: 'high', oceanTier: 'high' }))
  await waitForTerrain(page)
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.tick() ?? 0) > 240, undefined, { timeout: 60_000 })
  await page.waitForTimeout(3000)
  await before()
  const sample = async (): Promise<number> => {
    await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
    await page.waitForTimeout(4000)
    const g = await page.evaluate(() => (window as DiagWindow).__ww2!.gpuFrameTimesMs())
    expect(g.length).toBeGreaterThan(80)
    return percentile(g, 0.95)
  }
  const setSight = async (want: boolean): Promise<void> => {
    if ((await page.evaluate(() => (window as DiagWindow).__ww2!.impactMarker().on)) !== want) await page.keyboard.press('KeyU')
    await page.waitForFunction((w) => (window as DiagWindow).__ww2!.impactMarker().on === w, want, { timeout: 10_000 })
  }
  const on: number[] = [], off: number[] = []
  for (let i = 0; i < 6; i++) { await setSight(true); on.push(await sample()); await setSight(false); off.push(await sample()) }
  return { on: median(on), off: median(off) }
}

const view = (aircraft: string, y: number): string => withParams(spawnUrl({ x: BAY.x, y, z: BAY.z }), { scenario: 'night-bay', launch: '1', aircraft, loadout: 'bombs', god: '1' })

test('1440p budget (high): bombsight on night-bay costs at most 0.10 ms of gpu p95', async ({ page }) => {
  const r = await alternate(page, view('f6f-hellcat', 600), async () => undefined)
  console.log(`SIGHTSBUDGET bombsight on=${r.on.toFixed(3)} off=${r.off.toFixed(3)} cost=${(r.on - r.off).toFixed(3)}`)
  recordFrameTime(r.on - r.off, 'bombsight cost, night-bay')
  expect(r.on - r.off).toBeLessThanOrEqual(SIGHT_COST_MS)
})
test('1440p budget (high): torpedosight on night-bay costs at most 0.10 ms of gpu p95', async ({ page }) => {
  const r = await alternate(page, view('tbm-3-avenger', 120), async () => { await page.keyboard.press('KeyO') })
  console.log(`SIGHTSBUDGET torpedosight on=${r.on.toFixed(3)} off=${r.off.toFixed(3)} cost=${(r.on - r.off).toFixed(3)}`)
  recordFrameTime(r.on - r.off, 'torpedosight cost, night-bay')
  expect(r.on - r.off).toBeLessThanOrEqual(SIGHT_COST_MS)
})
