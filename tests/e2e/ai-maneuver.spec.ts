import { test, expect, type Page } from '@playwright/test'
import { percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'

/**
 * Tier 2, Plan 7b energy-aware maneuvering. Proves the one claim only this
 * tier can: that the decision layer, wired into production `advance()`,
 * actually stops `pursuer-1` from flying through the player at point-blank
 * range -- the behavior Plan 7a's own review explicitly declined to fix
 * ("Post-review correction", docs/handoff/2026-09-23-plan7a-ai-pursuit.md).
 * Every scoring/maneuver-selection claim is unit-tested
 * (tests/sim/ai/decision.test.ts, tests/sim/scenario.test.ts); what only
 * this tier can see is that the chosen maneuver actually reaches the
 * airframe through the real render loop, not a headless harness.
 */
const RANGE = `/?${SCENARIO_PARAM}=pursuit-range`

test.setTimeout(120_000)

const positions = (page: Page) =>
  page.evaluate(() => {
    const list = (window as DiagWindow).__ww2!.aircraft()
    const pursuer = list.find((a) => a.id === 'pursuer-1')!
    const player = list.find((a) => a.id === 'f6f-1')!
    return { range: Math.hypot(pursuer.x - player.x, pursuer.y - player.y, pursuer.z - player.z) }
  })

test('the veteran pursuer breaks off at point-blank range instead of flying through the player, with zero WebGPU validation errors and the render budget held', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(RANGE)
  await waitForTerrain(page)
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())

  // Wait for the range to close under Plan 7a's own MIN_ENGAGEMENT_RANGE_M
  // (120 m) -- the exact geometry that used to pass through undisturbed.
  await expect
    .poll(() => positions(page).then((p) => p.range), {
      timeout: 30_000,
      message: 'pursuer-1 never closed to point-blank range',
    })
    .toBeLessThan(120)

  const atClosest = await positions(page)

  // Poll for the range to open past its point-blank value, rather than
  // sleeping a fixed interval and sampling once. A reference-GPU diagnostic
  // run (tick-by-tick, 500ms cadence) measured the reversal NOT completing
  // until roughly 2-2.5s after first crossing 120 m -- later than a naive
  // "0.3s reaction window plus margin" would assume -- then opening cleanly
  // past 250 m by ~5s, before the pursuer re-closes for its later
  // re-engagement (the "rejoins and eventually re-engages" Tier 1 already
  // proves). A fixed 1500ms sleep sampled mid-reversal and read as still
  // closing; 6s of poll headroom clears the reversal with margin while
  // staying well short of the observed re-close.
  await expect
    .poll(() => positions(page).then((p) => p.range), {
      timeout: 6_000,
      message: 'pursuer-1 did not open range after closing to point-blank -- it flew through instead of breaking away',
    })
    .toBeGreaterThan(atClosest.range)

  await page.screenshot({ path: 'test-results/ai-maneuver.png' })

  const live = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { gpu: d.gpuFrameTimesMs(), errors: d.validationErrors }
  })
  expect(live.errors, `WebGPU validation errors:\n${JSON.stringify(live.errors, null, 2)}`).toEqual([])
  expect(live.gpu.length).toBeGreaterThan(120)
  const p95 = percentile(live.gpu, 0.95)
  console.log(`ai maneuver: gpu p95 ${p95.toFixed(3)} ms over ${live.gpu.length} samples`)
  expect(p95).toBeLessThan(6.0)
})
