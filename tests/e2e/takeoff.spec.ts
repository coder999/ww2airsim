import { test, expect, type Page } from '@playwright/test'
import { percentile, waitForTerrain, type DiagWindow, TRIPWIRE_1440P_P95_MS } from './harness.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'

/**
 * Tier 2, Plan 7h (AI takeoff): `takeoff-range` in the shipped app on the
 * reference GPU. Two allied AI Zeros start parked on Dulag's runway with
 * `pilot.takeoff`; the player sits chocked at Tacloban. Tier 1
 * (`tests/sim/ai/takeoff*.test.ts`, `airfield-strike.test.ts`) proves the
 * takeoff headless; what only this tier proves is that it happens in the
 * running app, on the terrain the renderer draws, without validation errors,
 * and inside the frame budget.
 *
 * No camera follows an AI, so the check is numeric, as in `recovery.spec.ts`.
 */
const URL = `/?${SCENARIO_PARAM}=takeoff-range`
const ZEROS = ['ai-1', 'ai-2']

// Sim time is ~50-60 s to hand-off (Task 4 measured 50 s and 60 s); triple
// time makes that ~20 s of wall clock, plus boot and terrain.
test.setTimeout(240_000)

const aircraft = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.aircraft())

test('takeoff-range: both Zeros roll, lift off and hand off, the player is untouched, zero validation errors, the budget held', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(URL)
  await waitForTerrain(page)

  const rows = await aircraft(page)
  expect(rows.map((r) => r.id).sort()).toEqual(['ai-1', 'ai-2', 'f6f-1'])
  expect(rows.find((r) => r.id === 'f6f-1')!.takeoff).toBeNull()
  for (const id of ZEROS) expect(rows.find((r) => r.id === id)!.takeoff, id).not.toBeNull()

  await page.keyboard.press('KeyT')
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.timeScale())).toBe(3)
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())

  const rollAt: Record<string, number> = {}
  const doneAt: Record<string, number> = {}
  await expect
    .poll(async () => {
      const [r, tick] = await Promise.all([aircraft(page), page.evaluate(() => (window as DiagWindow).__ww2!.tick())])
      for (const a of r) {
        if (!ZEROS.includes(a.id)) continue
        if (a.takeoff === 'roll' && rollAt[a.id] === undefined) rollAt[a.id] = tick / 60
        if (a.takeoff === null && doneAt[a.id] === undefined) doneAt[a.id] = tick / 60
      }
      return ZEROS.every((id) => doneAt[id] !== undefined)
    }, { timeout: 150_000, intervals: [500], message: 'both Zeros did not leave takeoff mode' })
    .toBe(true)
  console.log(`takeoff: roll began (sim s) ${JSON.stringify(rollAt)}; handed off ${JSON.stringify(doneAt)}`)
  for (const id of ZEROS) {
    expect(rollAt[id], `${id} never rolled`).toBeDefined()
    expect(doneAt[id]!, id).toBeLessThan(90)
  }
  await page.screenshot({ path: 'test-results/takeoff-handoff-tacloban.png' })

  const after = await aircraft(page)
  for (const id of ZEROS) expect(after.find((r) => r.id === id)!.mode, id).not.toBe('takeoff')
  const player = after.find((r) => r.id === 'f6f-1')!
  expect(player.takeoff).toBeNull()
  const impact = await page.evaluate(() => (window as DiagWindow).__ww2!.impact())
  expect(impact, 'the parked player registered an impact').toBeNull()

  const live = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { gpu: d.gpuFrameTimesMs(), errors: d.validationErrors }
  })
  expect(live.errors, `WebGPU validation errors:\n${JSON.stringify(live.errors, null, 2)}`).toEqual([])
  expect(live.gpu.length).toBeGreaterThan(120)
  const p95 = percentile(live.gpu, 0.95)
  console.log(`takeoff: gpu p95 ${p95.toFixed(3)} ms over ${live.gpu.length} samples`)
  // The 1440p baseline is over 6.0 without any AI in view (recovery.spec.ts,
  // handoff 7g Open item 1), so a red here is that baseline, not takeoff cost.
  expect(p95).toBeLessThan(TRIPWIRE_1440P_P95_MS)
})
