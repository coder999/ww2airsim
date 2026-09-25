import { test, expect, type Page } from '@playwright/test'
import { percentile, waitForTerrain, type DiagWindow } from './harness.js'
import { PILOT_SKILL_PARAM, SCENARIO_PARAM } from '../../src/render/spawn.js'
import { isBehind } from './pursuitGeometry.js'

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

const aircraft = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.aircraft())

test.setTimeout(120_000)

// `isBehind` lives in `./pursuitGeometry.ts`, unit-tested in
// `tests/render/pursuitGeometry.test.ts`. It was inline here and inverted --
// wrong bearing convention AND alignment-with-nose instead of
// opposition-to-nose, which for this scenario's due-east spawn made the whole
// acceptance test pass exactly when the AI was winning (final whole-branch
// review, Critical 1). The fix is one line of arithmetic; the reason it went
// unseen for a whole task is that no assertion could reach it from here.

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
  // (which climbs to sub-second). Task 4 added this believing the route to
  // the remote reference Chromium freezes `requestAnimationFrame` under fast
  // `.poll()` traffic, with `src/sim/loop.ts`'s `MAX_STEPS_PER_FRAME`
  // dropping owed sim time. **That diagnosis is disproven** (final-review fix
  // wave, 2026-09-24): the freeze it was inferred from is `ai-maneuver.spec
  // .ts`'s player being SHOT DOWN at tick 517, after which `frame.ts:617`
  // deliberately holds the world -- and it reproduces identically at one poll
  // per second. See that spec's header for the measurement. The cadence stays
  // because this spec is verified green with it and its timing is not worth
  // re-rolling for a cosmetic reason; it is NOT load-bearing, and it is not
  // evidence of any throttling.
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

  // The world FREEZES the moment the player is destroyed (`frame.ts:617`'s
  // `holding`), so a dead player's last geometry would sit there being polled
  // forever -- and if it happened to satisfy `isBehind`, this test would
  // report a win the player did not live to have. That is not hypothetical:
  // it is exactly how `ai-maneuver.spec.ts` fails on this same scenario
  // (tick 517, structure 0). Checked AFTER the poll, which is sound precisely
  // because a destroyed player's world never advances again.
  const survived = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { destroyed: d.combat()?.player.destroyed ?? null, structure: d.combat()?.player.structure ?? null }
  })
  expect(survived.destroyed, `the player was shot down (structure ${survived.structure}) -- "got behind" was read off a frozen world`).toBe(false)

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
