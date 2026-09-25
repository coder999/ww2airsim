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
 * **RED as of 2026-09-24, for a real reason, measured -- not a harness
 * artifact.** Plan 7d's Task 4 attributed this spec's failure to
 * `requestAnimationFrame` throttling under fast `.poll()` traffic, with
 * `src/sim/loop.ts`'s `MAX_STEPS_PER_FRAME` dropping owed sim time and
 * `tick()` freezing at 517. The final-review fix wave re-measured it on the
 * reference GPU and that diagnosis does not survive: polling once a second
 * (the mitigation Task 4's own theory prescribes) reproduces the identical
 * freeze -- same tick 517, same 386 m range -- so the poll cadence is not in
 * the path at all. What actually happens, read straight off
 * `__ww2.combat()` once a second:
 *
 *   tick 433  structure 1.000
 *   tick 494  structure 0.583
 *   tick 517  structure 0.000  destroyed: true   <- world stops here
 *
 * **The pursuer shoots the player down at tick 517 (8.6 s), at 386 m, long
 * before the range ever reaches MIN_ENGAGEMENT_RANGE_M.** `frame.ts:617`
 * then holds the world (`holding` includes the player's `destroyedAt`), so
 * `tick()` freezes forever and the first `.poll()` can only time out. This
 * spec flies NO inputs -- the player is a passive, non-maneuvering target --
 * and the veteran pursuer is now lethal enough on its FIRST firing pass to
 * kill one. Attributed to Plan 7d on two pieces of evidence, neither a
 * re-run of the merge-base browser: this spec was green before this branch
 * and nothing in it changed, and Tier 1's own hit-budget measurement in
 * `tests/sim/scenario.test.ts` moved from tick 7430 (recorded for Plan 7b)
 * to tick 525 (re-measured 2026-09-24, three identical runs).
 *
 * So the point-blank break-off this spec gates is no longer REACHABLE in this
 * scenario with a passive player, and no change to the polling, the timeouts
 * or the thresholds can make it so. Fixing it means a deliberate decision --
 * re-tune veteran lethality, or fly this spec's player so it survives to the
 * merge -- which is Mark's call, not a test-mechanics one. Left red and
 * documented rather than loosened.
 *
 * **2026-09-25: the geometry this spec was written against moved.**
 * `pursuit-range` is now a head-on merge at 2.5 km with a GREEN pursuer (the
 * shootdown spike; `tests/sim/pursuitMerge.test.ts`), and the old tail chase
 * lives on only as the Tier 1 fixture
 * `tests/fixtures/scenarios/pursuit-tail-chase.json`. No URL parameter can
 * load a fixture (`?scenario=` is whitelisted to the title screen's list by
 * `isKnownScenarioId`), so this spec now runs against the head-on start.
 * Headless measurement of the new start with a passive player (2026-09-25,
 * `nextFrameState`, no keys): the green pursuer closes to 16 m at 10.4 s
 * and forces `extend` there -- so the point-blank break-off this spec gates
 * IS reached again -- but it never fires.
 *
 * **Reference GPU, 2026-09-25 (after merging to main): RED.** Closest range
 * 44.8 m against the floor of 50 m below. The veteran does no better: the
 * same headless passive-player probe on `pursuit-range-veteran` closes to
 * 11 m at 10.3 s. Neither skill breaks off a head-on pass above 50 m, so
 * pointing this spec at the veteran scenario would not turn it green. What
 * the AI should do at a head-on merge is 7c's question, not this spec's.
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
