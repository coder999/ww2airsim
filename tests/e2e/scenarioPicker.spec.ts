import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { seaStateFor } from '../../src/render/ocean/weather.js'
import { TACLOBAN_LAT_DEG, nearestTakeoffTime, takeoffHours } from '../../src/render/sky/sun.js'
import { debriefDialog, spawnUrl, startGame, waitForScenario, type DiagWindow, launchFromOrders } from './harness.js'

/**
 * E2E, the title screen's scenario picker. Plan 9 Task 7: picking a
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
  // Form 1 -> Form 2 (Sortie Orders): the mission rows live on Form 2.
  await title.getByRole('button', { name: 'New game' }).click()

  const scenarioGroup = title.getByRole('radiogroup', { name: 'Scenario' })
  await expect(scenarioGroup.getByRole('radio', { name: 'Free Flight' })).toBeChecked()
  await expect(scenarioGroup.getByRole('radio', { name: 'Gunnery Range' })).toBeVisible()

  await scenarioGroup.getByRole('radio', { name: 'Gunnery Range' }).check()
  await launchFromOrders(title)

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
  // Form 1 -> Form 2 (Sortie Orders): the mission rows live on Form 2.
  await title.getByRole('button', { name: 'New game' }).click()

  // Free Flight is already checked (the production default).
  await launchFromOrders(title)
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
  // Form 1 -> Form 2 (Sortie Orders): the mission rows live on Form 2.
  await title.getByRole('button', { name: 'New game' }).click()

  const scenarioGroup = title.getByRole('radiogroup', { name: 'Scenario' })
  await expect(scenarioGroup.getByRole('radio', { name: 'Free Flight' })).toBeChecked()
  await scenarioGroup.getByRole('radio', { name: 'Gunnery Range' }).check()
  await launchFromOrders(title)
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
  // Scoped to the roster row's own button[aria-pressed] marker (set only by
  // makePilotButton): since the Dossier sheet landed, a bare
  // getByRole('button', { name: /Regression Test/ }) also matches that
  // row's "Dossier: Regression Test" button and is a strict-mode violation.
  await reshownTitle.locator('button[aria-pressed]').filter({ hasText: 'Regression Test' }).click()
  await reshownTitle.getByRole('button', { name: 'New game' }).click()
  const reshownScenarioGroup = reshownTitle.getByRole('radiogroup', { name: 'Scenario' })
  // The fix: Gunnery Range, what is ACTUALLY loaded -- not Free Flight, what
  // this boot started with (the bug).
  await expect(reshownScenarioGroup.getByRole('radio', { name: 'Gunnery Range' })).toBeChecked()
  await expect(reshownScenarioGroup.getByRole('radio', { name: 'Free Flight' })).not.toBeChecked()
})

/**
 * A2 (MASTER_PLAN, 2026-10-08): a scenario launched from the title flies its
 * OWN weather, not the boot scenario's (clouds.md #10). Both directions,
 * because the code paths differ: a cloudy boot switching to a clear sky must
 * route the cloud pass out of the frame, and a clear boot switching to a
 * deck must route it in. The expected values are read from the scenario
 * JSON, not restated here.
 */
type WeatherJson = { timeOfDay: number; clouds?: unknown[]; windMps: number }
const weatherOf = (id: string): WeatherJson =>
  (JSON.parse(readFileSync(fileURLToPath(new URL(`../../content/scenarios/${id}.json`, import.meta.url)), 'utf8')) as { weather: WeatherJson }).weather

const SWITCHES = [
  { boot: '/', from: 'free-flight', to: 'gunnery-range', label: 'Gunnery Range' },
  { boot: '/?scenario=gunnery-range', from: 'gunnery-range', to: 'airfield-strike', label: 'Airfield Strike' },
] as const

for (const s of SWITCHES) {
  test(`a title launch from ${s.from} to ${s.to} flies ${s.to}'s own weather`, async ({ page }) => {
    const from = weatherOf(s.from)
    const to = weatherOf(s.to)
    // Not vacuous: each pair differs in hour and in whether there is a deck,
    // and the second also in sea state, or the switch could pass by doing nothing.
    expect(from.timeOfDay).not.toBe(to.timeOfDay)
    expect((from.clouds ?? []).length > 0).not.toBe((to.clouds ?? []).length > 0)
    if (s.to === 'airfield-strike') expect(seaStateFor(from.windMps, undefined)).not.toBe(seaStateFor(to.windMps, undefined))

    await page.goto(s.boot)
    await waitForScenario(page, s.from)
    const diag = (): Promise<{ hour: number; layers: number; composited: boolean; sea: number }> => page.evaluate(() => {
      const w = (window as DiagWindow).__ww2!
      return { hour: w.sun().timeOfDay, layers: w.clouds().layers.length, composited: w.clouds().composited, sea: w.seaState() }
    })
    await page.waitForSelector('[data-ww2-title][data-ww2-ready="true"]', { timeout: 60_000 })
    const before = await diag()
    expect(before.layers).toBe((from.clouds ?? []).length)
    expect(before.composited).toBe(before.layers > 0)

    await startGame(page, { scenario: s.label })
    await waitForScenario(page, s.to)
    // A title launch flies the takeoff time A3 preselects (94866345): the Morning,
    // Midday or Dusk nearest the scenario's own hour, so airfield-strike's 0730 flies at 0740.
    const takeoff = takeoffHours(TACLOBAN_LAT_DEG)
    const hour = takeoff[nearestTakeoffTime(to.timeOfDay, takeoff)]
    // scenarioId can lead the switch's last step; wait for the hour, which is applied with the rest of the weather.
    await page.waitForFunction((h) => { const t = (window as DiagWindow).__ww2!.sun().timeOfDay; return t >= h && t < h + 0.1 }, hour, { timeout: 30_000 }).catch(() => undefined)
    const after = await diag()
    // The sun creeps with the sim clock: a few seconds of flight is well under 0.1 h.
    expect(after.hour).toBeGreaterThanOrEqual(hour)
    expect(after.hour).toBeLessThan(hour + 0.1)
    expect(after.layers).toBe((to.clouds ?? []).length)
    expect(after.composited).toBe(after.layers > 0)
    expect(after.sea).toBe(seaStateFor(to.windMps, undefined))
    expect(await page.evaluate(() => (window as DiagWindow).__ww2!.validationErrors)).toEqual([])
  })
}
