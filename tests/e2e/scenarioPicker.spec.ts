import { test, expect } from '@playwright/test'
import { debriefDialog, spawnUrl, waitForScenario, type DiagWindow } from './harness.js'

/**
 * Tier 2, the title screen's scenario picker. Plan 9 Task 7: picking a
 * scenario no longer navigates to `?scenario=<id>` and reloads -- it swaps
 * the entity list in place, via `main.ts`'s `loadScenario`. What only a
 * browser can prove is that this stays true end to end: the URL never
 * changes, the title hides immediately (there is no reload to wait out),
 * and the world that comes up carries the REAL, different entity list the
 * picked scenario declares -- not just a relabelled default and not the
 * previous scenario's meshes left over.
 */
test.setTimeout(120_000)

test('picking a different scenario swaps entities in place, with no navigation', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title).toBeVisible()
  const urlBefore = page.url()

  // Select a pilot (required before New game enables -- design §3/Plan 9
  // Task 5) via the "New pilot" inline form, self-contained here rather than
  // via harness.ts's `startGame`: that helper (since `d9c7203`) selects a
  // pilot AND immediately presses New Game, with no gap to interact with the
  // scenario radiogroup in between -- and this test's whole point is picking
  // a scenario, and in some cases re-checking it, before that click. Not a
  // gap in `startGame`; just a different job.
  await title.getByRole('button', { name: 'New pilot' }).click()
  await title.getByPlaceholder('Pilot name').fill('Scenario Swap Test')
  await title.getByRole('button', { name: 'Add' }).click()

  const scenarioGroup = title.getByRole('radiogroup', { name: 'Scenario' })
  await expect(scenarioGroup.getByRole('radio', { name: 'Free Flight' })).toBeChecked()
  await expect(scenarioGroup.getByRole('radio', { name: 'Gunnery Range' })).toBeVisible()

  await scenarioGroup.getByRole('radio', { name: 'Gunnery Range' }).check()
  await title.getByRole('button', { name: 'New game' }).click()

  // No reload: the title hides immediately and the URL never carries
  // `?scenario=`, unlike the pre-Task-7 navigation this replaces.
  await expect(title).toBeHidden()
  // `waitForScenario`, not a `groundHeightM()` poll: see that helper's doc
  // comment (harness.ts) for why the terrain signal cannot tell "the switch
  // landed" from "terrain arrived on its own, unrelated schedule".
  await waitForScenario(page, 'gunnery-range')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
  expect(page.url()).toBe(urlBefore)

  // The real, different entity list gunnery-range.json carries -- not
  // free-flight's f6f-2 wingman, and not an empty/default world relabelled.
  const ids = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraft().map((a) => a.id))
  expect(ids.sort()).toEqual(['f6f-1', 'target-1', 'target-2'])

  expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
  await page.screenshot({ path: 'test-results/scenario-picker.png' })
})

test('picking the already-loaded scenario also stays in place (the same code path, scenarioId === requestedScenarioId)', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title).toBeVisible()
  const urlBefore = page.url()

  // Select a pilot (required before New game enables -- design §3/Plan 9
  // Task 5) via the "New pilot" inline form, self-contained here rather than
  // via harness.ts's `startGame`: that helper (since `d9c7203`) selects a
  // pilot AND immediately presses New Game, with no gap to interact with the
  // scenario radiogroup in between -- and this test's whole point is picking
  // a scenario, and in some cases re-checking it, before that click. Not a
  // gap in `startGame`; just a different job.
  await title.getByRole('button', { name: 'New pilot' }).click()
  await title.getByPlaceholder('Pilot name').fill('Same Scenario Test')
  await title.getByRole('button', { name: 'Add' }).click()

  // Free Flight is already checked (the production default).
  await title.getByRole('button', { name: 'New game' }).click()
  await expect(title).toBeHidden()
  // This branch never calls `loadScenario` (main.ts: `scenarioId ===
  // requestedScenarioId` skips straight to a synchronous `rebuildFrame`), so
  // there is no async switch to race -- `waitForScenario` here is
  // belt-and-braces, not the fix this test needed.
  await waitForScenario(page, 'free-flight')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
  expect(page.url()).toBe(urlBefore)

  const ids = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraft().map((a) => a.id))
  expect(ids.sort()).toEqual(['f6f-1', 'f6f-2'])
})

test('return to title after an in-place scenario switch preselects the scenario actually loaded, not the one this boot started with', async ({ page }) => {
  // Regression test for a bug review found in this task: `TitleScreenHandle.
  // show()` used to take no argument, so it could only ever rebuild the
  // scenario radiogroup off `createTitleScreen`'s OWN `currentScenarioId`
  // closure -- fixed once at construction and never updated by a later
  // `loadScenario` switch. A player who switched scenarios in-session, then
  // returned to title via a debrief's "Return to title" button, saw the
  // ORIGINAL boot scenario still checked; pressing New game without
  // re-touching the radio silently switched back to it. `titleScreen.test.ts`
  // has this bug's type-level contract (no DOM there); this is the real,
  // whole-browser round trip.
  //
  // `spawnUrl({x:0,y:120,z:0})` is a DEV override on the URL, which
  // `main.ts`'s `loadScenario` re-applies on EVERY call (not just the
  // initial one) -- so the airplane starts 120 m over open water no matter
  // which scenario this test switches to, letting it reuse `contact.spec.ts`'s
  // steep-dive-into-the-sea trick to reach a debrief quickly regardless.
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto(spawnUrl({ x: 0, y: 120, z: 0 }))
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title).toBeVisible()

  // Select a pilot (required before New game enables -- design §3/Plan 9
  // Task 5) via the "New pilot" inline form, self-contained here rather than
  // via harness.ts's `startGame`: that helper (since `d9c7203`) selects a
  // pilot AND immediately presses New Game, with no gap to interact with the
  // scenario radiogroup in between -- and this test's whole point is picking
  // a scenario, and in some cases re-checking it, before that click. Not a
  // gap in `startGame`; just a different job.
  await title.getByRole('button', { name: 'New pilot' }).click()
  await title.getByPlaceholder('Pilot name').fill('Regression Test')
  await title.getByRole('button', { name: 'Add' }).click()

  const scenarioGroup = title.getByRole('radiogroup', { name: 'Scenario' })
  await expect(scenarioGroup.getByRole('radio', { name: 'Free Flight' })).toBeChecked()
  await scenarioGroup.getByRole('radio', { name: 'Gunnery Range' }).check()
  await title.getByRole('button', { name: 'New game' }).click()
  await expect(title).toBeHidden()

  // `waitForScenario`, not a `groundHeightM()` poll: see that helper's doc
  // comment (harness.ts). This exact test failed on the reference GPU
  // 2026-09-24 with the previous scenario's stale entity list -- root cause
  // was `onNewGame` crashing on a real TDZ `ReferenceError` before
  // `loadScenario` ever ran (fixed in `main.ts`, see `roster`'s declaration
  // there); `groundHeightM()` is still the wrong signal to wait on here even
  // with that crash gone, for the reason `waitForScenario`'s own comment
  // gives.
  await waitForScenario(page, 'gunnery-range')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
  // The real, different entity list, confirming the switch actually landed
  // before this test goes on to crash and return to title.
  const ids = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraft().map((a) => a.id))
  expect(ids.sort()).toEqual(['f6f-1', 'target-1', 'target-2'])

  await page.keyboard.down('ArrowUp')
  await debriefDialog(page).waitFor({ timeout: 20_000 })
  await page.keyboard.up('ArrowUp')
  await debriefDialog(page).getByRole('button', { name: 'Return to title' }).click()

  const reshownTitle = page.getByRole('dialog', { name: 'Title' })
  await expect(reshownTitle).toBeVisible()
  // The scenario row is hidden (design §3) until a pilot is selected, same
  // as the very first title build -- this fresh `build()` starts with no
  // pilot selected again, so the roster persisted across the crash/return
  // trip (`saveRoster`, roster.ts) is what makes the SAME pilot pickable
  // here rather than needing another "New pilot" round trip.
  await reshownTitle.getByRole('button', { name: /Regression Test/ }).click()
  const reshownScenarioGroup = reshownTitle.getByRole('radiogroup', { name: 'Scenario' })
  // The fix: Gunnery Range, what is ACTUALLY loaded -- not Free Flight, what
  // this boot started with (the bug).
  await expect(reshownScenarioGroup.getByRole('radio', { name: 'Gunnery Range' })).toBeChecked()
  await expect(reshownScenarioGroup.getByRole('radio', { name: 'Free Flight' })).not.toBeChecked()
})
