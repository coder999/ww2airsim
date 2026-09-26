import { test, expect, type Page } from '@playwright/test'
import { debriefDialog, waitForScenario, type DiagWindow } from './harness.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { AIRBORNE_LATCH_M } from '../../src/sim/landing.js'

/**
 * Tier 2, whole-branch review finding C-1. `main.ts`'s `onNewGame` closure
 * used to rebuild `frame` (via `rebuildFrame`) without resetting
 * `landingShown`/`shownImpactTick`/`shownDestructionTick`/
 * `postImpactOceanSeconds` or hiding the previous flight's debrief/impact
 * effect/hit flashes -- state only the Restart handler cleared. Before Plan
 * 9's "Return to title" button, `onNewGame` was reachable only at boot, when
 * all of that state was already at its initial value, so the gap never
 * mattered. The button makes it reachable mid-session, from an
 * already-shown debrief: land, "Return to title", New game, land again --
 * and the second landing's own `if (current.landing.report !== null &&
 * !landingShown)` gate in `main.ts` silently never fires again, because
 * `landingShown` is still `true` from the FIRST landing. No debrief, no
 * bank, for the rest of the page's life.
 *
 * This is the one sequence no other spec drives: `meta-game.spec.ts` (Task
 * 8's acceptance) lands exactly once per session; `scenarioPicker.spec.ts`'s
 * "return to title" regression test returns to title after a CRASH (a steep
 * dive, `spawnUrl`'s trick), never a landing, and never presses New game and
 * flies again afterward. Same platform and caveats as `adapter.spec.ts`: the
 * reference GPU on the Windows desktop, never hosted CI.
 *
 * `gunnery-range` (not a dive-into-the-sea shortcut): the failing gate is
 * specifically the LANDING debrief's, and only a real landing exercises it.
 * Each sortie also shoots target-1 down first, exactly like
 * `meta-game.spec.ts`'s acceptance flight, so the banked score is non-zero
 * both times and "the score increases from the first bank" (the fix's own
 * requirement) is actually checkable, not just "a debrief showed up twice."
 * `New game` on the same scenario respawns the world from the scenario's own
 * content fresh (`buildWorld` reads `bundle` again), so target-1 is alive
 * again for the second sortie.
 */
const f6f = loadAircraftSpec('f6f-hellcat')

test.setTimeout(400_000)

const combat = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.combat()!)

/**
 * One gunnery-range sortie: kill target-1, take off, and land back on the
 * strip -- a genuine physics landing, not a scripted touchdown (see
 * `meta-game.spec.ts`'s own doc comment for why `nextLandingTracking`
 * requires this and why this exact hop-and-flare sequence is what reliably
 * produces one on this scenario). Leaves the debrief showing "LANDED" with
 * `continueLabel` panel up; the caller decides what to do with it.
 */
async function flyOneGunneryRangeSortie(page: Page): Promise<void> {
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
  await expect
    .poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.supportedContact()), { timeout: 20_000 })
    .toBe(true)

  // -- Real scoring: shoot target-1 down, not just damage it.
  await page.keyboard.down('Space')
  await expect
    .poll(() => combat(page).then((c) => c.player.kills), { timeout: 30_000, message: 'target-1 was never destroyed' })
    .toBeGreaterThan(0)
  await page.keyboard.up('Space')

  // -- Take off.
  const start = await page.evaluate(() => {
    const p = (window as DiagWindow).__ww2!.aircraftPositionM()
    return { x: p.x, z: p.z }
  })
  await page.keyboard.down('Equal')
  await page.waitForFunction(
    ([sx, sz]) => {
      const p = (window as DiagWindow).__ww2!.aircraftPositionM()
      return Math.hypot(p.x - sx, p.z - sz) > 380
    },
    [start.x, start.z] as const,
    { timeout: 90_000 },
  )
  await page.keyboard.down('ArrowDown')
  await page.waitForTimeout(1500)
  await page.keyboard.up('ArrowDown')

  await page.waitForFunction(
    ([gearHeightM, latchM]) => {
      const d = (window as DiagWindow).__ww2!
      const groundM = d.groundHeightM()
      if (groundM === null) return false
      return !d.supportedContact() && d.aircraftPositionM().y - gearHeightM - groundM > latchM
    },
    [f6f.gear.heightM, AIRBORNE_LATCH_M] as const,
    { timeout: 30_000 },
  )

  // -- Land: throttle to idle, a nose-down pulse, then a closed loop flaring
  // whenever sink exceeds 2 m/s below 8 m -- the exact sequence measured on
  // the reference GPU in `meta-game.spec.ts` (this task, 2026-09-24).
  await page.keyboard.up('Equal')
  await page.keyboard.down('Minus')
  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(500)
  await page.keyboard.up('ArrowUp')
  let lastHeightM: number | null = null
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(300)
    const s = await page.evaluate(
      ([gearHeightM]) => {
        const d = (window as DiagWindow).__ww2!
        const groundM = d.groundHeightM()
        return {
          heightM: groundM === null ? null : d.aircraftPositionM().y - gearHeightM - groundM,
          supported: d.supportedContact(),
          impact: d.impact(),
        }
      },
      [f6f.gear.heightM] as const,
    )
    if (s.supported || s.impact !== null) break
    const sinkMps = lastHeightM === null || s.heightM === null ? null : (lastHeightM - s.heightM) / 0.3
    lastHeightM = s.heightM
    if (s.heightM !== null && s.heightM < 8 && sinkMps !== null && sinkMps > 2) {
      await page.keyboard.down('ArrowDown')
      await page.waitForTimeout(250)
      await page.keyboard.up('ArrowDown')
    }
  }
  await page.keyboard.up('Minus')

  await expect
    .poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.supportedContact()), {
      timeout: 15_000,
      message: 'never came back down',
    })
    .toBe(true)
  expect(
    await page.evaluate(() => (window as DiagWindow).__ww2!.impact()),
    'the touchdown was a crash, not a landing',
  ).toBeNull()

  await page.keyboard.press('KeyM')
  await page.keyboard.down('KeyB')
  await debriefDialog(page).waitFor({ timeout: 30_000 })
  await page.keyboard.up('KeyB')
  await expect(debriefDialog(page)).toContainText('LANDED')
}

test('land, return to title, New game, land again: a second debrief shows and the score banks a second time (C-1)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title).toBeVisible()

  await title.getByRole('button', { name: 'New pilot' }).click()
  await title.getByPlaceholder('Pilot name').fill('Relaunch Test Pilot')
  await title.getByRole('button', { name: 'Add' }).click()
  await title.getByRole('button', { name: 'New game' }).click()

  const scenarioGroup = title.getByRole('radiogroup', { name: 'Scenario' })
  await scenarioGroup.getByRole('radio', { name: 'Gunnery Range' }).check()
  await title.getByRole('button', { name: 'Launch' }).click()
  await expect(title).toBeHidden()
  await waitForScenario(page, 'gunnery-range')

  // -- First sortie and landing: the baseline bank.
  await flyOneGunneryRangeSortie(page)
  await expect(debriefDialog(page)).toContainText('score 500')
  // I-3: the debrief now shows the recovery multiplier actually applied and
  // the pilot's banked cumulative total, neither of which it rendered at all
  // before this review.
  await expect(debriefDialog(page)).toContainText('Recovery: LANDED (×1)')
  await expect(debriefDialog(page)).toContainText('Banked total: 500')
  await page.screenshot({ path: 'test-results/meta-game-relaunch-first-landing.png' })

  await debriefDialog(page).getByRole('button', { name: 'Return to title' }).click()
  const reshownTitle = page.getByRole('dialog', { name: 'Title' })
  await expect(reshownTitle).toBeVisible()

  // -- Roster round trip proves the first bank actually landed in
  // `localStorage`, same as `meta-game.spec.ts`'s acceptance check.
  await expect(reshownTitle.getByRole('button', { name: /Relaunch Test Pilot — ENS — 500/ })).toBeVisible()
  await reshownTitle.getByRole('button', { name: /Relaunch Test Pilot/ }).click()
  await reshownTitle.getByRole('button', { name: 'New game' }).click()

  // Same scenario -- this is `onNewGame`'s SAME-scenario branch (a direct
  // `rebuildFrame()` call, not `loadScenario(...).then(rebuildFrame)`), the
  // other of the two paths through `onNewGame` the fix has to cover.
  await expect(scenarioGroup.getByRole('radio', { name: 'Gunnery Range' })).toBeChecked()
  await reshownTitle.getByRole('button', { name: 'Launch' }).click()
  await expect(reshownTitle).toBeHidden()

  // The world rebuilt fresh: target-1 is alive again, not still wrecked from
  // the first sortie.
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
  const secondSortieTargets = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraft().map((a) => a.id))
  expect(secondSortieTargets.sort()).toEqual(['f6f-1', 'target-1', 'target-2'])

  // -- THE fix under test: a second landing, on a `frame` rebuilt through
  // `onNewGame` rather than Restart, must still raise a debrief. Before the
  // fix, `landingShown` was still `true` from the first landing and this
  // would time out inside `flyOneGunneryRangeSortie`'s own
  // `debriefDialog(page).waitFor(...)`.
  await flyOneGunneryRangeSortie(page)
  await expect(debriefDialog(page)).toContainText('score 500')
  // The banked total is now the SUM across both sorties (1000), not the
  // second mission's own 500 -- proof `applyMissionResult` added to the
  // pilot's existing cumulative score rather than replacing it.
  await expect(debriefDialog(page)).toContainText('Banked total: 1000')
  await page.screenshot({ path: 'test-results/meta-game-relaunch-second-landing.png' })

  await debriefDialog(page).getByRole('button', { name: 'Return to title' }).click()
  const finalTitle = page.getByRole('dialog', { name: 'Title' })
  await expect(finalTitle).toBeVisible()

  // -- The score increased from the first bank: 500 -> 1000, not stuck at
  // 500 (a second mission that silently never banked) and not a fresh,
  // zeroed pilot.
  await expect(finalTitle.getByRole('button', { name: /Relaunch Test Pilot — ENS — 1000/ })).toBeVisible()

  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})
