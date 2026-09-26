import { test, expect, type Page } from '@playwright/test'
import { percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'
import { MIN_ENGAGEMENT_RANGE_M } from '../../src/sim/ai/decision.js'

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
 *
 * Finding 9 (final whole-branch review): this plan does not fix or worsen
 * the pre-existing gap where a destroyed target can still be targeted (the
 * loop only guards on SELF's `destroyedAt`, not the target's) -- the
 * MIN_ENGAGEMENT_RANGE_M override tested below is a strictly safer default
 * near a dead target than the old unconditional Pursue, but closing that gap
 * is out of scope here.
 *
 * **History.** RED from 2026-09-24: the veteran shot the passive player down
 * at tick 517 (8.6 s, 386 m) before point-blank range. 7c's measurement (spec
 * §1.1, 2026-09-25) found the trigger: 7d's noise PLUS the title screen's
 * default `both` loadout, which every Tier 1 world lacked. The 7d handoff had
 * blamed 7d alone. The veteran retune (controlNoise 0.01, Mark's ruling)
 * resolved that: 0 of 128 passive-player runs killed.
 *
 * **7c, 2026-09-26: still a pass-through, by design.** On the head-on
 * `pursuit-range`, the green pursuer passes the player at 21-22 m (headless,
 * `both`), under this spec's 50 m floor. Making the AI dodge the pass (collision avoidance, or
 * Break flown on the lift vector) clears the floor at 97-114 m, but the
 * player's first-merge kill falls from 7/8 to 0/8: the merge Mark flew and
 * liked on 2026-09-25. 7c kept the merge (ruling R4) and asked Mark (7c
 * handoff, Open for Mark item 1). This spec's claim, a break-off rather than
 * a pass-through at point-blank range, is proven at Tier 1 on the frozen
 * tail-chase fixture (`tests/render/aiLethality.test.ts`, item 2), which no
 * URL can load.
 *
 * **Reference GPU, 2026-09-26: this spec PASSED, and the pass is vacuous.**
 * `atClosest` below is the first poll sample under MIN_ENGAGEMENT_RANGE_M,
 * not the minimum. A per-frame sampler on the same slot, three runs, all
 * identical: first sample under 120 m was 118.5 m at tick 595; the true
 * closest was 22.1 m at tick 624, the Tier 1 prediction. The 2026-09-25 red
 * (44.8 m) was most likely a sample that landed later in the pass (not
 * re-measured). It is still a pass-through; see the 7c handoff, Open for Mark.
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

  // Wait for the range to close under this plan's own MIN_ENGAGEMENT_RANGE_M
  // (finding 7: this is Plan 7b's own new constant, not Plan 7a's -- and
  // imported here rather than hardcoded so a future retune can't silently
  // desync the two) -- the exact geometry that used to pass through
  // undisturbed.
  await expect
    .poll(() => positions(page).then((p) => p.range), {
      timeout: 30_000,
      message: 'pursuer-1 never closed to point-blank range',
    })
    .toBeLessThan(MIN_ENGAGEMENT_RANGE_M)

  const atClosest = await positions(page)
  // Finding 5: the range-opens-afterward assertion below would also pass
  // for a pursuer that flew straight through the player -- that failure
  // mode also produces "range opens afterward," just from a much smaller
  // closest range. Floor the CLOSEST range actually observed: a genuine
  // break-off (per this plan's own Tier 1 data) bottoms out around
  // 90-100m -- comfortably inside MIN_ENGAGEMENT_RANGE_M (120m) but well
  // above a near-collision pass-through, which would bring the range to
  // something close to the airframes' own size.
  expect(atClosest.range, `pursuer-1's closest range (${atClosest.range.toFixed(1)}m) looks like a pass-through, not a break-off`).toBeGreaterThan(50)

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
