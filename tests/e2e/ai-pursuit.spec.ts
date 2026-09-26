import { test, expect, type Page } from '@playwright/test'
import { percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { SCENARIO_PARAM } from '../../src/render/spawn.js'

/**
 * Tier 2, Plan 7a AI pursuit. Same platform and caveats as `gunnery.spec.ts`:
 * the reference GPU on the Windows desktop, never hosted CI.
 *
 * What only this tier can prove is the wiring of the whole slice in the
 * shipped app: `pursuitControls` reaching `pursuer-1` from the same
 * fixed-tick loop that steps the player, `Controls.fire` from an AI pilot
 * (not a keypress) reaching `frame.controls` and spawning a real projectile
 * that actually lands, and the airframe actually turning rather than
 * drifting straight under its spawn velocity. Every piece is unit-tested
 * (`tests/sim/ai/*.test.ts`, `tests/sim/scenario.test.ts`'s "the pursuit
 * pilot actually hits the target it is gated on"); the Plan 3 defect class
 * -- a feature inert in the browser with its tests green -- is invisible
 * below this tier.
 *
 * **2026-09-25: the geometry moved; 7c made the second pass real.**
 * `pursuit-range` is now a head-on merge at 2.5 km with a GREEN pursuer (the
 * shootdown spike). At the merge, 7b's scorer picks Break (the player's nose
 * is on the pursuer), so there is no head-on shot. Before 7c the pursuer then
 * sat in Extend for good (0 rounds in 120 s); 7c's re-engagement
 * (`tests/render/aiReengage.test.ts`) brings it back. Measured headless with
 * the browser's `both` loadout: first post-merge shot at 68.8-83.9 s from
 * spawn, and the hit within seconds. Hence the 150 s tracer window and the
 * 60 s hit window. The claims are unchanged.
 */
const RANGE = `/?${SCENARIO_PARAM}=pursuit-range`

test.setTimeout(300_000)

const combat = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.combat()!)
const pursuer = (page: Page) =>
  page.evaluate(() => (window as DiagWindow).__ww2!.aircraft().find((a) => a.id === 'pursuer-1')!)

test('the assigned pilot turns onto a gun solution and fires through production controls, with zero WebGPU validation errors and the render budget held', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(RANGE)
  await waitForTerrain(page)
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())

  const before = await pursuer(page)
  const initial = await combat(page)
  expect(initial.player.firing).toBe(false)
  expect(initial.tracers).toBe(0)

  // Never touch a key: the player's own trigger stays untouched for the
  // whole test, so any tracer below can only be pursuer-1's own
  // `Controls.fire`. Heading, not just position, is polled first -- a
  // pursuer that never turned would still change position under its spawn
  // velocity alone (see diagnostics.ts's `aircraft().headingRad` doc
  // comment), which is exactly the "inert AI, moving world" failure this
  // spec exists to catch.
  await expect
    .poll(() => pursuer(page).then((a) => Math.abs(a.headingRad - before.headingRad)), {
      timeout: 20_000,
      message: 'pursuer-1 heading never changed -- controlsForDesiredVelocity did not reach the airframe',
    })
    .toBeGreaterThan((2 * Math.PI) / 180)

  await expect
    .poll(() => combat(page).then((c) => c.tracers), {
      timeout: 150_000,
      message: 'pursuer-1 never fired -- the AI gun gate did not reach frame.controls.fire',
    })
    .toBeGreaterThan(0)

  // Not just firing -- landing rounds. `player.structure` is the only
  // per-aircraft damage signal already exposed for the PLAYER specifically
  // (combatReadout.ts); since the player never fires or takes any other
  // damage source in this scenario, a drop here can only be pursuer-1's own
  // gunfire connecting -- the gap a reference-GPU review found: the gate
  // and the steering were checking two different lead points, so every
  // acceptance shot before that fix missed (1,002 rounds, zero hits).
  await expect
    .poll(() => combat(page).then((c) => c.player.structure), {
      timeout: 60_000,
      message: 'pursuer-1 fired but never hit the player -- the gate and the steering disagree on where the nose is aimed',
    })
    .toBeLessThan(1)

  const after = await pursuer(page)
  const moved = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z)
  expect(moved, 'pursuer-1 did not move').toBeGreaterThan(10)
  expect((await combat(page)).player.firing, 'the player fired -- this spec never presses Space').toBe(false)
  await page.screenshot({ path: 'test-results/ai-pursuit.png' })

  const live = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { gpu: d.gpuFrameTimesMs(), errors: d.validationErrors }
  })
  expect(live.errors, `WebGPU validation errors:\n${JSON.stringify(live.errors, null, 2)}`).toEqual([])
  expect(live.gpu.length).toBeGreaterThan(120)
  const p95 = percentile(live.gpu, 0.95)
  console.log(`ai pursuit: gpu p95 ${p95.toFixed(3)} ms over ${live.gpu.length} samples`)
  expect(p95).toBeLessThan(6.0)
})
