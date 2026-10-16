import { test, expect, type Page } from '@playwright/test'
import { debriefDialog, startGame, toConditions, waitForScenario, type DiagWindow } from './harness.js'
import { flyPass } from './pilot.js'
import { groundTruthTerrain, rangePass } from '../pilot/rangePass.js'

/**
 * E2E, whole-branch review finding C-1. `main.ts`'s `onNewGame` closure
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
const PASS = rangePass('gunnery-range', 'target-1', groundTruthTerrain())

test.setTimeout(400_000)

const combat = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.combat()!)

/**
 * One gunnery-range sortie: the strafing pass that kills target-1 and lands
 * straight ahead on Tacloban -- a genuine physics landing, not a scripted
 * touchdown (see `meta-game.spec.ts`'s own doc comment), flown by the shared
 * test pilot (`./pilot.ts`). Leaves the debrief showing "LANDED" with
 * `continueLabel` panel up; the caller decides what to do with it.
 */
async function flyOneGunneryRangeSortie(page: Page): Promise<void> {
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
  const flown = await flyPass(page, PASS)
  expect(flown.end, 'the pass did not end at rest on the runway').toBe('stopped')
  expect((await combat(page)).player.kills, 'target-1 was never destroyed').toBeGreaterThan(0)
  await debriefDialog(page).waitFor({ timeout: 30_000 })
  await expect(debriefDialog(page)).toContainText('LANDED')
}

test('land, return to Headquarters, launch again: a second debrief shows (C-1), and an unscored sortie banks nothing either time', async ({
  page,
}) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  await startGame(page, { scenario: 'Gunnery Range' })
  await waitForScenario(page, 'gunnery-range')

  // -- First sortie and landing.
  await flyOneGunneryRangeSortie(page)
  await expect(debriefDialog(page)).toContainText('score 500')
  // The debrief shows the recovery multiplier actually applied. A Training sortie banks nothing, so there is no ledger.
  await expect(debriefDialog(page)).toContainText('Recovery: LANDED (×1)')
  await expect(debriefDialog(page).getByText('Campaign Ledger')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/meta-game-relaunch-first-landing.png' })

  await debriefDialog(page).getByRole('button', { name: 'Return to Headquarters' }).click()
  const hq = page.getByRole('dialog', { name: 'Headquarters' })
  await expect(hq.getByText('Air Group Headquarters')).toBeVisible()
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.campaign())).toMatchObject({ pending: null, human: { sorties: 0, banked: 0 } })

  // Same scenario -- this is `onNewGame`'s SAME-scenario branch (a direct `rebuildFrame()` call, not
  // `loadScenario(...).then(rebuildFrame)`), the other of the two paths through `onNewGame` the fix has to cover.
  const title = await toConditions(page, { scenario: 'Gunnery Range' })
  await title.getByRole('button', { name: 'Next' }).click()
  await title.getByRole('button', { name: 'Next' }).click()
  await title.getByRole('button', { name: 'Launch' }).click()
  await expect(title).toBeHidden()

  // The world rebuilt fresh: target-1 is alive again, not still wrecked from the first sortie.
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
  const secondSortieTargets = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraft().map((a) => a.id))
  expect(secondSortieTargets.sort()).toEqual(['f6f-1', 'target-1', 'target-2'])

  // -- THE fix under test: a second landing, on a `frame` rebuilt through `onNewGame` rather than Restart, must still
  // raise a debrief. Before the fix, `landingShown` was still `true` from the first landing.
  await flyOneGunneryRangeSortie(page)
  await expect(debriefDialog(page)).toContainText('score 500')
  await page.screenshot({ path: 'test-results/meta-game-relaunch-second-landing.png' })

  await debriefDialog(page).getByRole('button', { name: 'Return to Headquarters' }).click()
  await expect(hq.getByText('Air Group Headquarters')).toBeVisible()
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.campaign())).toMatchObject({ pending: null, human: { sorties: 0, banked: 0 } })
  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
})
