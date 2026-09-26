import { test, expect, type Page } from '@playwright/test'
import { debriefDialog, hopAndLand, percentile, waitForScenario, type DiagWindow } from './harness.js'

/**
 * Tier 2, Plan 9 Task 8: the whole meta-game acceptance, all three pieces
 * (pilot roster, live scoring, dynamic scenario switching) proven together
 * in one real session -- design doc §7's Tier 2 acceptance. Same platform
 * and caveats as `adapter.spec.ts`: the reference GPU on the Windows
 * desktop, never hosted CI.
 *
 * The flight: pick/create a pilot, shoot target-1 down for real (a kill, not
 * just damage -- `gunnery.spec.ts` only proves rounds land) on
 * `gunnery-range`, take off, and land again on the same strip. A genuine
 * physics landing, not a scripted touchdown: `nextLandingTracking`
 * (landing.ts) only ever produces a `report` after the wheels have actually
 * cleared `AIRBORNE_LATCH_M` and come back down onto the ground below
 * `LANDED_SPEED_MPS`. `approach.spec.ts`'s own doc comment rules out
 * hand-flying a full five-kilometre approach through `page.keyboard` as
 * fragile; this does not need one -- gunnery-range parks the player right on
 * the strip, so the shortest real round trip is a rotate, a brief hop clear
 * of the latch, and an immediate settle back down with the throttle cut and
 * the brakes on.
 *
 * Landing banks a REAL score (kills since the last bank, times the point
 * table, times the "landed" 1.0 recovery multiplier -- `debrief.ts`'s
 * `missionScore`) into `localStorage` via `main.ts`'s `bankMissionResult`.
 * Return to title re-reads the roster (`titleScreen.ts`'s own `show()` doc
 * comment) and must show the SAME pilot with the updated total -- not a
 * fresh, zeroed entry. Picking Air Combat (`pursuit-range`'s title-screen
 * label, see `SCENARIO_OPTIONS` in titleScreen.ts) from there and pressing
 * New game is this session's SECOND in-place scenario switch after boot
 * (the first was gunnery-range itself) -- the minimum design §7 asks for to
 * catch a leaked-mesh regression a single switch would not surface.
 */
test.setTimeout(240_000)

const combat = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.combat()!)

test('roster, live scoring and a dynamic scenario switch all work together in one session', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 })
  await page.goto('/')
  const title = page.getByRole('dialog', { name: 'Title' })
  await expect(title).toBeVisible()

  // -- Pick/create a pilot (design §3, Plan 9 Task 5), the same inline
  // "New pilot" flow `scenarioPicker.spec.ts` already exercises.
  await title.getByRole('button', { name: 'New pilot' }).click()
  await title.getByPlaceholder('Pilot name').fill('Meta Acceptance Pilot')
  await title.getByRole('button', { name: 'Add' }).click()
  await title.getByRole('button', { name: 'New game' }).click()

  const scenarioGroup = title.getByRole('radiogroup', { name: 'Scenario' })
  await scenarioGroup.getByRole('radio', { name: 'Gunnery Range' }).check()
  await title.getByRole('button', { name: 'Launch' }).click()
  await expect(title).toBeHidden()

  // First in-place switch: boot's own default (free-flight, never shown)
  // to gunnery-range.
  await waitForScenario(page, 'gunnery-range')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
  await expect
    .poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.supportedContact()), { timeout: 20_000 })
    .toBe(true)

  const ids = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraft().map((a) => a.id))
  expect(ids.sort()).toEqual(['f6f-1', 'target-1', 'target-2'])

  // -- Real scoring: shoot target-1 down, not just damage it. Points are
  // keyed on `killsByType`, not on hits -- `debrief.ts`'s `missionScore`.
  await page.keyboard.down('Space')
  await expect
    .poll(() => combat(page).then((c) => c.player.kills), { timeout: 30_000, message: 'target-1 was never destroyed' })
    .toBeGreaterThan(0)
  await page.keyboard.up('Space')
  const afterKill = await combat(page)
  const target1 = afterKill.aircraft.find((a) => a.id === 'target-1')!
  expect(target1.destroyed, 'the credited kill was not target-1').toBe(true)
  console.log(`meta-game: target-1 destroyed after ${afterKill.player.shots} shots, ${afterKill.player.hits} hits`)

  await hopAndLand(page)

  await expect(debriefDialog(page)).toContainText('LANDED')
  // -- Real, non-zero score, banked with the 1.0 "landed" multiplier: one
  // 500-point fighter kill (`POINTS_BY_TARGET_TYPE`, debrief.ts). Still
  // Ensign (design §8's ladder, `RANK_LADDER` in roster.ts): 500 points does
  // not clear the 2,500-point Lieutenant (jg) threshold, so no promotion is
  // reachable from this one sortie -- the brief's "(if fresh) a promotion"
  // is conditional for exactly this reason, not a gap in this assertion.
  await expect(debriefDialog(page)).toContainText('score 500')
  await page.screenshot({ path: 'test-results/meta-game-landed.png' })

  await debriefDialog(page).getByRole('button', { name: 'Return to title' }).click()
  const reshownTitle = page.getByRole('dialog', { name: 'Title' })
  await expect(reshownTitle).toBeVisible()

  // -- Roster round trip: the SAME pilot, with the updated total, read back
  // from `localStorage` by `show()` -- not a fresh, zeroed entry.
  await expect(reshownTitle.getByRole('button', { name: /Meta Acceptance Pilot — ENS — 500/ })).toBeVisible()
  // Scoped to the roster row's own marker (`button[aria-pressed]`, set only
  // by `makePilotButton`): since the Dossier sheet landed, a bare
  // `getByRole('button', { name: /Meta Acceptance Pilot/ })` also matches
  // that row's "Dossier: Meta Acceptance Pilot" button and is a strict-mode
  // violation -- the same marker `startGame` in harness.ts already uses.
  await reshownTitle.locator('button[aria-pressed]').filter({ hasText: 'Meta Acceptance Pilot' }).click()
  await reshownTitle.getByRole('button', { name: 'New game' }).click()

  // -- Second in-session switch: gunnery-range -> pursuit-range ("Air
  // Combat" here, `SCENARIO_OPTIONS`), without a page navigation.
  const urlBeforeSwitch = page.url()
  const reshownScenarioGroup = reshownTitle.getByRole('radiogroup', { name: 'Scenario' })
  await expect(reshownScenarioGroup.getByRole('radio', { name: 'Gunnery Range' })).toBeChecked()
  // `exact`: since 2026-09-25 the picker also lists "Air Combat: Veteran",
  // which a substring match would also select (a strict-mode violation).
  await reshownScenarioGroup.getByRole('radio', { name: 'Air Combat', exact: true }).check()
  await reshownTitle.getByRole('button', { name: 'Launch' }).click()
  await expect(reshownTitle).toBeHidden()

  await waitForScenario(page, 'pursuit-range')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
  expect(page.url()).toBe(urlBeforeSwitch)

  // Polled, not read once: `scenarioId()` reports the new bundle as soon as
  // `loadScenario` assigns it, BEFORE its `await buildScenarioEntities` and
  // the `.then(rebuildFrame)` that swaps `frame` -- so for that window
  // `aircraft()` still lists gunnery-range's roster (seen on the reference
  // GPU 2026-09-25: target-1/target-2 read right after waitForScenario).
  await expect
    .poll(() => page.evaluate(() => (window as DiagWindow).__ww2!.aircraft().map((a) => a.id).sort()), { timeout: 20_000 })
    .toEqual(['f6f-1', 'pursuer-1'])

  // -- Fly it: prove pursuit-range is not just loaded but flyable -- the
  // same "did the AI actually turn" signal `ai-pursuit.spec.ts` reads.
  const before = await page.evaluate(
    () => (window as DiagWindow).__ww2!.aircraft().find((a) => a.id === 'pursuer-1')!.headingRad,
  )
  await expect
    .poll(
      async () =>
        Math.abs(
          (await page.evaluate(() => (window as DiagWindow).__ww2!.aircraft().find((a) => a.id === 'pursuer-1')!.headingRad)) -
            before,
        ),
      { timeout: 20_000, message: 'pursuer-1 never turned -- pursuit-range did not actually load flyable' },
    )
    .toBeGreaterThan((2 * Math.PI) / 180)

  // -- Zero WebGPU validation errors and the render-time budget held after
  // TWO scenario switches (gunnery-range then pursuit-range) since boot,
  // not one -- the leaked-mesh regression design §7 calls out, which a
  // single switch cannot surface.
  await page.evaluate(() => (window as DiagWindow).__ww2!.resetFrameTimes())
  await page.waitForTimeout(4000)
  const live = await page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    return { gpu: d.gpuFrameTimesMs(), errors: d.validationErrors }
  })
  expect(live.errors, `WebGPU validation errors:\n${JSON.stringify(live.errors, null, 2)}`).toEqual([])
  expect(live.gpu.length).toBeGreaterThan(120)
  const p95 = percentile(live.gpu, 0.95)
  console.log(`meta-game acceptance: gpu p95 ${p95.toFixed(3)} ms over ${live.gpu.length} samples after 2 scenario switches`)
  expect(p95).toBeLessThan(6.0)
  await page.screenshot({ path: 'test-results/meta-game-pursuit-range.png' })
})
