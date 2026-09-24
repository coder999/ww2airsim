import { test, expect, type Page } from '@playwright/test'
import { percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { PILOT_SKILL_PARAM, SCENARIO_PARAM } from '../../src/render/spawn.js'

/**
 * Tier 2, Plan 7d. The actual acceptance bar Mark's complaint sets: not
 * "some noise exists" but "a human-equivalent scripted evasion pattern can
 * now get behind pursuer-1 at green skill within a bounded time window,
 * where it could not before this change" (spec §5).
 *
 * **Green, not this scenario's default.** The brief this spec was written
 * from claimed `pursuit-range.json` omits `pilot.skill`, so `scenario.ts`'s
 * `'green'` schema default would apply with no override needed. That is
 * false: `content/scenarios/pursuit-range.json` pins `pilot.skill` to
 * `"veteran"` explicitly (verified by reading the file directly, 2026-09-24)
 * -- Task 4 had to hand-edit that file to `"green"` to take its tuning
 * measurement, then reverted the edit, precisely because it is shipped
 * content, not test-owned. Reusing `pursuit-range` unmodified therefore
 * meant testing against `veteran`, which would defeat the entire point of
 * this acceptance test: Mark's complaint was about losing to the AI even at
 * the easiest preset. Neither `main.ts` nor `spawn.ts` had a DEV override
 * for pilot skill before this task (checked: no `pilotSkill`-shaped query
 * param existed, unlike `?oceanTier=`/`?beaufort=`/`?cloudTier=`/
 * `?timeOfDay=`) -- one was added in `spawn.ts` (`pilotSkillFromQuery`,
 * `PILOT_SKILL_PARAM`) and wired into `main.ts`'s `buildWorld` behind
 * `import.meta.env.DEV`, following exactly those four functions' shape:
 * inert in a production build, and used here instead of editing content.
 */
const RANGE = `/?${SCENARIO_PARAM}=pursuit-range&${PILOT_SKILL_PARAM}=green`

type AircraftDiag = { readonly id: string; readonly x: number; readonly y: number; readonly z: number; readonly headingRad: number }

const aircraft = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.aircraft())

test.setTimeout(120_000)

/** True when `player` is within `withinDeg` of directly behind `enemy`'s
 *  tail and inside `withinM` -- an approximation of "got behind it" using
 *  only the horizontal heading diagnostics already exposes (no full 3D
 *  attitude is available from `aircraft()`), which is the geometry this
 *  scenario's own combat plane is flown in. */
function isBehind(player: AircraftDiag, enemy: AircraftDiag, withinM: number, withinDeg: number): boolean {
  const dx = player.x - enemy.x, dz = player.z - enemy.z
  const rangeM = Math.hypot(dx, dz, player.y - enemy.y)
  if (rangeM > withinM) return false
  const bearingToPlayer = Math.atan2(dx, dz)
  const angleOff = Math.abs(Math.atan2(Math.sin(bearingToPlayer - enemy.headingRad), Math.cos(bearingToPlayer - enemy.headingRad)))
  return (angleOff * 180) / Math.PI < withinDeg
}

test('a scripted evasion-and-reversal lets the player get behind a green pursuer within a bounded window, where it could not before this plan', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(RANGE)
  await waitForTerrain(page)
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())

  // A hard break turn, sustained, then a reversal -- the textbook response
  // to a relentless six-o'clock pursuer: force an overshoot, then cut back
  // across its turn circle onto its tail. Held via keyboard.down/up, this
  // repo's existing e2e input-simulation convention (tests/e2e/gunnery.spec.ts,
  // approach.spec.ts).
  await page.keyboard.down('ArrowLeft')
  await page.keyboard.down('ArrowDown') // pitchUp binding is ArrowDown (src/input/bindings.ts)
  await page.waitForTimeout(4000)
  await page.keyboard.up('ArrowLeft')
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(3000)
  await page.keyboard.up('ArrowRight')
  await page.keyboard.up('ArrowDown')

  // Explicit `intervals` rather than Playwright's default ramping cadence
  // (which climbs to sub-second): Task 4 found this worktree's route to the
  // remote reference-desktop Chromium freezes `requestAnimationFrame`
  // deterministically under heavy `.poll()` traffic
  // (`src/sim/loop.ts`'s `MAX_STEPS_PER_FRAME` drops, rather than banks, sim
  // time owed beyond 5 ticks/frame -- a real environment issue, not an AI
  // bug; fix is out of this task's scope). Polling once a second avoids
  // retriggering it.
  await expect
    .poll(
      async () => {
        const list = await aircraft(page)
        const player = list.find((a) => a.id === 'f6f-1')!
        const pursuer = list.find((a) => a.id === 'pursuer-1')!
        return isBehind(player, pursuer, 400, 45)
      },
      { timeout: 40_000, intervals: [1000], message: 'player never got behind pursuer-1 within the bounded window' },
    )
    .toBe(true)

  await page.screenshot({ path: 'test-results/ai-pursuit-difficulty.png' })

  const live = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { gpu: d.gpuFrameTimesMs(), errors: d.validationErrors }
  })
  expect(live.errors, `WebGPU validation errors:\n${JSON.stringify(live.errors, null, 2)}`).toEqual([])
  expect(live.gpu.length).toBeGreaterThan(120)
  const p95 = percentile(live.gpu, 0.95)
  console.log(`ai pursuit difficulty: gpu p95 ${p95.toFixed(3)} ms over ${live.gpu.length} samples`)
  expect(p95).toBeLessThan(6.0)
})
