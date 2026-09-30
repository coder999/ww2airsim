import { test, expect } from '@playwright/test'
import { percentile, waitForTerrain, type DiagWindow, TRIPWIRE_1440P_P95_MS } from './harness.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'
import { MIN_ENGAGEMENT_RANGE_M } from '../../src/sim/ai/decision.js'

/**
 * Tier 2, the head-on merge on `pursuit-range`. Written for Plan 7b to prove
 * a break-off at point-blank range; since 7c's ruling R4 (Mark, 2026-09-25)
 * the merge is a deliberate pass at 21-22 m, and this spec now pins that
 * pass inside a band through the real render loop (see the ruling below).
 * The break-off claim itself lives at Tier 1 (`aiLethality.test.ts`, item 2).
 * Every scoring/maneuver-selection claim is unit-tested
 * (tests/sim/ai/decision.test.ts, tests/sim/scenario.test.ts); what only
 * this tier can see is that the chosen maneuver actually reaches the
 * airframe through the real render loop, not a headless harness.
 *
 * Finding 9 (final whole-branch review), RESOLVED by Plan 7e (2026-09-26):
 * a pilot re-checks its target every tick, and one whose static target is
 * destroyed loiters without firing instead of chasing the wreck
 * (tests/sim/ai/sidesTick.test.ts, "a static target that dies").
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
 * **Reference GPU, 2026-09-26: this spec PASSED, and the pass was vacuous.**
 * It read the first poll sample under MIN_ENGAGEMENT_RANGE_M, not the
 * minimum: 118.5 m at tick 595, while a per-frame sampler found the true
 * closest at 22.1 m, tick 624 (three runs, identical), the Tier 1 prediction.
 *
 * **Mark's ruling, 2026-09-27 (7c handoff item 1b):** keep the merge (R4
 * stands) and measure it honestly. The spec now records the TRUE minimum
 * with an in-page per-frame sampler and asserts it sits in a band around
 * R4's 21-22 m, so both regressions fail: a collision (below the band) and an
 * unintended dodge or break-off (above it, 97-114 m when a dodge was tried).
 */
const RANGE = `/?${SCENARIO_PARAM}=pursuit-range`

/** R4's head-on pass, 21-22 m headless and 22.1 m on the reference GPU,
 *  with room for render-loop timing but none for a collision or a dodge. */
const MERGE_BAND_M = { min: 15, max: 35 } as const

test.setTimeout(120_000)

type MergeSampler = { closest: number; closestTick: number; lastRange: number; crossed: boolean }
type SamplerWindow = DiagWindow & { __merge?: MergeSampler }

test('the veteran pursuer passes the player at the head-on merge inside R4\'s band, then opens range, with zero WebGPU validation errors and the render budget held', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(RANGE)
  await waitForTerrain(page)
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())

  // Sample every rendered frame, in the page, so the minimum is the real one
  // and not whichever instant a Playwright poll happened to land on (the
  // 2026-09-26 vacuous pass). At ~300 m/s closure a 10 ms frame is ~3 m along
  // track, under 0.1 m of error on a ~22 m minimum.
  await page.evaluate((minEngagement) => {
    const w = window as SamplerWindow
    const m: MergeSampler = { closest: Infinity, closestTick: -1, lastRange: Infinity, crossed: false }
    w.__merge = m
    const sample = (): void => {
      const d = w.__ww2!
      const list = d.aircraft()
      const pursuer = list.find((a) => a.id === 'pursuer-1')
      const player = list.find((a) => a.id === 'f6f-1')
      if (pursuer !== undefined && player !== undefined) {
        const r = Math.hypot(pursuer.x - player.x, pursuer.y - player.y, pursuer.z - player.z)
        if (r < minEngagement) m.crossed = true
        if (r < m.closest) { m.closest = r; m.closestTick = d.tick() }
        m.lastRange = r
      }
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  }, MIN_ENGAGEMENT_RANGE_M)

  const merge = (): Promise<MergeSampler> => page.evaluate(() => ({ ...(window as SamplerWindow).__merge! }))

  // The merge is over once the pair has closed inside MIN_ENGAGEMENT_RANGE_M
  // and opened back out past it.
  await expect
    .poll(async () => { const m = await merge(); return m.crossed && m.lastRange > MIN_ENGAGEMENT_RANGE_M }, {
      timeout: 40_000,
      intervals: [500],
      message: 'pursuer-1 never closed inside point-blank range and opened out again',
    })
    .toBe(true)

  const m = await merge()
  console.log(`ai maneuver: closest ${m.closest.toFixed(1)} m at tick ${m.closestTick}`)
  expect(m.closest, `closest ${m.closest.toFixed(1)} m is below R4's band: a collision-course pass`).toBeGreaterThan(MERGE_BAND_M.min)
  expect(m.closest, `closest ${m.closest.toFixed(1)} m is above R4's band: the AI dodged or broke off, which Mark declined (2026-09-25)`).toBeLessThan(MERGE_BAND_M.max)

  await page.screenshot({ path: 'test-results/ai-maneuver.png' })

  const live = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { gpu: d.gpuFrameTimesMs(), errors: d.validationErrors }
  })
  expect(live.errors, `WebGPU validation errors:\n${JSON.stringify(live.errors, null, 2)}`).toEqual([])
  expect(live.gpu.length).toBeGreaterThan(120)
  const p95 = percentile(live.gpu, 0.95)
  console.log(`ai maneuver: gpu p95 ${p95.toFixed(3)} ms over ${live.gpu.length} samples`)
  expect(p95).toBeLessThan(TRIPWIRE_1440P_P95_MS)
})
