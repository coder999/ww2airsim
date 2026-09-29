import { test, expect, type Page } from '@playwright/test'
import { percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'
import { GROUND_CONTACT_TOLERANCE_M } from '../../src/sim/ground.js'

/**
 * Tier 2, Plan 7g (landing AI): `recovery-range` in the shipped app on the
 * reference GPU. Two homed AI Hellcats, `ai-tac` to Tacloban and `ai-cv` to
 * the carrier `cv-1`, fly home and land through the real frame loop. Tier 1
 * (`tests/sim/ai/recoveryRange.test.ts`) proves the same landings headless at
 * ~393 s and ~405 s of sim time; what only this tier proves is that they
 * happen in the running app, that the carrier AI comes to rest on the deck
 * the RENDERER draws (not merely the sim's), and that the frame budget holds.
 *
 * The chase camera follows the player, who is parked at Tacloban, and there
 * is no live-flight camera that can be pointed at an AI (the instant replay's
 * Target camera only reaches 3 km). So the carrier landing is checked in
 * numbers, with `shipDeckProbe` under the AI's wheels; the screenshots show
 * the Tacloban view.
 */
const URL = `/?${SCENARIO_PARAM}=recovery-range`
const f6f = loadAircraftSpec('f6f-hellcat')

// ~405 s of sim time at triple time is ~135 s of wall clock on a machine
// that keeps up, plus boot and terrain.
test.setTimeout(420_000)

const aircraft = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.aircraft())

test('recovery-range: both homed AI land, the carrier AI rests on the rendered deck, zero validation errors, the budget held', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(URL)
  await waitForTerrain(page)

  const rows = await aircraft(page)
  expect(rows.map((r) => r.id).sort()).toEqual(['ai-cv', 'ai-tac', 'f6f-1'])
  expect(rows.find((r) => r.id === 'f6f-1')!.recovery).toBeNull()

  // Triple time: the harness's only time scale (frame.ts TRIPLE_TIME_SCALE).
  await page.keyboard.press('KeyT')
  await expect.poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.timeScale())).toBe(3)
  const t0 = await page.evaluate(() => (window as DiagWindow).__ww2!.tick())

  // Every homed AI goes home: 30 s of sim without a contact (7g spec §1).
  await expect
    .poll(() => aircraft(page).then((r) => r.filter((a) => a.id !== 'f6f-1').map((a) => a.recovery !== null)), { timeout: 60_000 })
    .toEqual([true, true])

  // The budget window: from ai-tac's final approach at Tacloban (in the
  // player's view) through both landings.
  await expect
    .poll(() => aircraft(page).then((r) => r.find((a) => a.id === 'ai-tac')!.recovery), { timeout: 240_000, intervals: [1000] })
    .toMatch(/^(final|rollout|landed)$/)
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())

  const landedAt: Record<string, number> = {}
  await expect
    .poll(async () => {
      const [r, tick] = await Promise.all([aircraft(page), page.evaluate(() => (window as DiagWindow).__ww2!.tick())])
      for (const a of r) if (a.mode === 'landed' && landedAt[a.id] === undefined) landedAt[a.id] = tick / 60
      return ['ai-tac', 'ai-cv'].every((id) => landedAt[id] !== undefined)
    }, { timeout: 180_000, intervals: [500], message: 'ai-tac and ai-cv did not both land' })
    .toBe(true)
  console.log(`recovery: landed (sim s, polled at 0.5 s wall) ai-tac ${landedAt['ai-tac']!.toFixed(1)} ai-cv ${landedAt['ai-cv']!.toFixed(1)}; triple time from tick ${t0}`)
  await page.screenshot({ path: 'test-results/recovery-landed-tacloban.png' })

  // Past the 3 s respot, then at rest: the carrier AI rides the deck (its
  // offset from the ship does not change) and sits on the deck the renderer
  // draws under its wheels.
  await page.waitForTimeout(3000)
  const read = () => page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    const cv = d.ships().find((s) => s.id === 'cv-1')!
    const ai = d.aircraft().find((a) => a.id === 'ai-cv')!
    return { cv, ai, tick: d.tick(), probe: d.shipDeckProbe('cv-1', [{ x: ai.x, z: ai.z }], 'world')[0] ?? null }
  })
  const a = await read()
  await page.waitForTimeout(3000)
  const b = await read()
  expect(b.tick - a.tick, 'the sim is not running').toBeGreaterThan(60)
  expect(b.ai.mode).toBe('landed')
  expect(b.ai.recovery).toBe('landed')
  const drift = Math.hypot((b.ai.x - b.cv.x) - (a.ai.x - a.cv.x), (b.ai.z - b.cv.z) - (a.ai.z - a.cv.z))
  const wheelsM = b.ai.y - f6f.gear.heightM
  console.log(`recovery: ai-cv drift on deck ${drift.toFixed(3)} m over ${((b.tick - a.tick) / 60).toFixed(1)} s; wheels ${wheelsM.toFixed(3)} m vs rendered deck ${b.probe?.toFixed(3)} m; ship moved ${Math.hypot(b.cv.x - a.cv.x, b.cv.z - a.cv.z).toFixed(1)} m`)
  expect(drift).toBeLessThan(0.5)
  expect(b.probe, 'no rendered deck under ai-cv').not.toBeNull()
  expect(Math.abs(wheelsM - b.probe!)).toBeLessThanOrEqual(0.2 + GROUND_CONTACT_TOLERANCE_M)

  const tac = (await aircraft(page)).find((r) => r.id === 'ai-tac')!
  expect(tac.mode).toBe('landed')
  const impact = await page.evaluate(() => (window as DiagWindow).__ww2!.impact())
  expect(impact, 'the parked player registered an impact').toBeNull()
  await page.screenshot({ path: 'test-results/recovery-respotted-tacloban.png' })

  const live = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { gpu: d.gpuFrameTimesMs(), errors: d.validationErrors }
  })
  expect(live.errors, `WebGPU validation errors:\n${JSON.stringify(live.errors, null, 2)}`).toEqual([])
  expect(live.gpu.length).toBeGreaterThan(120)
  const p95 = percentile(live.gpu, 0.95)
  console.log(`recovery: gpu p95 ${p95.toFixed(3)} ms over ${live.gpu.length} samples`)
  // Measured 2026-09-28 on the console server under `hwlock ryzen`: 7.46 ms,
  // FAILING. The same scene with both AI 30+ km away measured 7.37 ms, and
  // the bare runway spawn 7.82 ms, in the same session: the 1440p baseline
  // is over 6.0 without any landing in view, not this plan's cost.
  expect(p95).toBeLessThan(6.0)
})
