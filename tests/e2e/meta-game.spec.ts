import { test, expect, type Page } from '@playwright/test'
import { debriefDialog, percentile, waitForScenario, type DiagWindow } from './harness.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { AIRBORNE_LATCH_M } from '../../src/render/landing.js'

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
const f6f = loadAircraftSpec('f6f-hellcat')

test.setTimeout(240_000)

const combat = (page: Page) => page.evaluate(() => (window as DiagWindow).__ww2!.combat()!)
const heightAboveGroundM = (page: Page) =>
  page.evaluate(([gearHeightM]) => {
    const d = (window as DiagWindow).__ww2!
    const groundM = d.groundHeightM()
    if (groundM === null) return null
    return d.aircraftPositionM().y - gearHeightM - groundM
  }, [f6f.gear.heightM] as const)

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

  // -- Take off. Same roll/rotate shape `takeoff.spec.ts` already proved on
  // the default free-flight spawn; there is no aircraft-vs-aircraft
  // collision in this sim (`weapons/combat.ts`'s ray-based hit path is the
  // only one), so rolling through target-1's now-wrecked parking spot is
  // not a hazard.
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

  // Airborne, and past the SAME latch `nextLandingTracking` itself uses to
  // decide the flight ever left the ground -- clearing only
  // `GROUND_CONTACT_TOLERANCE_M` would leave `LandingTracking.airborne`
  // false and this flight would never produce a `report` at all.
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
  console.log(`meta-game: cleared the latch at ${(await heightAboveGroundM(page))?.toFixed(1)} m`)

  // -- Land. `nextLandingTracking` only needs the wheels to come back down
  // gently (below `MAX_SUPPORTED_SINK_MPS`), not a stabilized approach, so
  // this is a short, controlled descent rather than a circuit:
  //
  // 1. Throttle to idle and a brief nose-down pulse (ArrowUp = pitchDown) --
  //    measured live on the reference GPU (this task, 2026-09-24): a plain
  //    neutral-pitch glide after the rotate above keeps CLIMBING on
  //    momentum for several seconds (throttle alone is not enough), and a
  //    longer/harder nose-down pulse (1.2 s, tried first) dives in at
  //    -11 m/s and crashes -- both measured, not guessed.
  // 2. A small closed loop below 8 m: a brief nose-up (ArrowDown) tap
  //    whenever the sink rate exceeds 2 m/s, the same flare a real landing
  //    needs and hand-scripting a single fixed pitch pulse cannot reliably
  //    produce, because how much altitude the nose-down pulse in step 1
  //    trades for speed is not exactly repeatable. Measured result:
  //    touchdown sink 1.3 m/s, speed 46.5 m/s, well inside
  //    `MAX_SUPPORTED_SINK_MPS` (4.0) and the stall-speed gate.
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
  console.log('meta-game: back on the wheels, not a crash')

  // Stop: cut the throttle the rest of the way (`KeyM`, one press to zero)
  // and hold the brakes until the debrief actually appears.
  await page.keyboard.press('KeyM')
  await page.keyboard.down('KeyB')
  await debriefDialog(page).waitFor({ timeout: 30_000 })
  await page.keyboard.up('KeyB')

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
  await reshownTitle.getByRole('button', { name: /Meta Acceptance Pilot/ }).click()
  await reshownTitle.getByRole('button', { name: 'New game' }).click()

  // -- Second in-session switch: gunnery-range -> pursuit-range ("Air
  // Combat" here, `SCENARIO_OPTIONS`), without a page navigation.
  const urlBeforeSwitch = page.url()
  const reshownScenarioGroup = reshownTitle.getByRole('radiogroup', { name: 'Scenario' })
  await expect(reshownScenarioGroup.getByRole('radio', { name: 'Gunnery Range' })).toBeChecked()
  await reshownScenarioGroup.getByRole('radio', { name: 'Air Combat' }).check()
  await reshownTitle.getByRole('button', { name: 'Launch' }).click()
  await expect(reshownTitle).toBeHidden()

  await waitForScenario(page, 'pursuit-range')
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
  expect(page.url()).toBe(urlBeforeSwitch)

  const pursuitIds = await page.evaluate(() => (window as DiagWindow).__ww2!.aircraft().map((a) => a.id))
  expect(pursuitIds.sort()).toEqual(['f6f-1', 'pursuer-1'])

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
