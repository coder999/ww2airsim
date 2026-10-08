import { expect, test, type Locator, type Page } from '@playwright/test'
import type { Ww2Diagnostics } from '../../src/render/diagnostics.js'
import { SPAWN_PARAMS } from '../../src/render/spawn.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { AIRBORNE_LATCH_M } from '../../src/sim/landing.js'
import { BINDINGS } from '../../src/input/bindings.js'
import type { TerrainField } from '../../src/sim/world/terrain.js'
import { flyPass } from './pilot.js'
import { groundTruthTerrain, landingAhead } from '../pilot/rangePass.js'

/** Where `landAndStop` aims, measured along the runway from wherever
 *  `hopClear` leaves the airplane: past the 5 degree path's 12-15 m of
 *  climb-out height, well short of the far end (Tacloban's circuit spot is
 *  z = +700, `hopClear` rolls 380 m before rotating). */
const LANDING_AHEAD_M = 250
let terrain: TerrainField | null = null
/**
 * The 1440p GPU p95 tripwire, ms: one 120 Hz frame. The performance GATE is
 * `budget4k.spec.ts` (60 Hz High, spec §2); these 1440p checks stay as
 * tripwires. Cloud Fidelity II §3.4 moved them from 6.0 ms, a number sized
 * for bare terrain in Plan 13a, to this; twelve specs still said 6.0 until
 * 2026-09-29 (Mark), when takeoff/recovery's Tacloban view measured 7.6-7.9 ms
 * on the desktop under `hwlock ryzen`. One copy, so it cannot drift again.
 */
export const TRIPWIRE_1440P_P95_MS = 8.33

/**
 * Records a correctness spec's GPU p95 as a `frame-time` annotation in the
 * report, without asserting it. A spec is a correctness test or a budget test,
 * never both (2026-10-08, docs/testing.md "Philosophy"): a slow frame used to
 * turn furball, takeoff and recovery red for reasons that had nothing to do
 * with what they test. The gates are the dedicated budget specs.
 */
export function recordFrameTime(p95: number): void {
  test.info().annotations.push({ type: 'frame-time', description: `gpu p95 ${p95.toFixed(3)} ms at 1440p` })
}

/** Loaded on first use, not at import: most specs never land. */
const groundTruthTerrainOnce = (): TerrainField => (terrain ??= groundTruthTerrain())

/** `window.__ww2` in a dev build (src/render/diagnostics.ts, main.ts). One
 *  shared type with the app rather than a copy declared here: Task 15 review,
 *  round 1 found that two independent copies typecheck clean even when a
 *  field is renamed or dropped on one side, failing only at runtime -- on the
 *  one machine here that cannot run it. */
export type DiagWindow = Window & { __ww2?: Ww2Diagnostics }

/**
 * The URL that starts the airplane at a given world position, built from
 * `SPAWN_PARAMS` rather than from three string literals -- so renaming a
 * parameter in `src/render/spawn.ts` breaks `tsc`/this builder rather than
 * silently producing a URL the app ignores, which would put the airplane
 * back over open water with every terrain assertion still green.
 */
export function spawnUrl(position: { x: number; y: number; z: number }): string {
  const [xName, yName, zName] = SPAWN_PARAMS
  const q = new URLSearchParams({
    [xName]: String(position.x),
    [yName]: String(position.y),
    [zName]: String(position.z),
  })
  return `/?${q.toString()}`
}

/**
 * Waits until the terrain heightfield has reached the simulation, which is
 * the LAST of the five level fetches to land (L8..L4; L4 is 526,338 of the
 * 702,346 bytes and is fetched last -- src/render/terrain/load.ts). So this
 * is also the signal that every level the mesh can draw has been uploaded,
 * and it is the only such signal the app exposes: `tick()` advances from the
 * first frame, seconds earlier.
 */
/**
 * The impact/landing debrief. Locate it by name: since Plan 14 the navigation
 * chart is a second `role="dialog"` on the page, so a bare role selector is a
 * strict-mode violation.
 */
export function debriefDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Debrief' })
}

/**
 * Waits until `main.ts`'s live `bundle` is the scenario `id` names -- the
 * only signal that actually tracks an in-place scenario switch (Plan 9 Task
 * 7) completing, via `window.__ww2.scenarioId()`.
 *
 * `groundHeightM() !== null` looks like it would do this and was used for it
 * in `scenarioPicker.spec.ts` before this helper existed, but it answers an
 * unrelated, ONE-TIME question -- whether a terrain field has arrived at
 * all -- that is already permanently true for any switch requested after
 * boot's own terrain load finishes. A spec that waits on it after clicking
 * "New game" for a second, in-session switch can resolve on its very first
 * poll, before `loadScenario`'s fetch (and the `rebuildFrame` after it) have
 * done anything -- reading `aircraft()`/`ships()` at that point would see
 * whichever scenario was ALREADY loaded, not the one just picked.
 *
 * Investigated 2026-09-24 after `scenarioPicker.spec.ts`'s "return to title"
 * test failed on the reference GPU with the previous scenario's entities
 * still in place. The failure that round trip actually reproduced turned out
 * to be a separate bug -- `onNewGame` in `main.ts` crashing on a real
 * temporal-dead-zone `ReferenceError` before `loadScenario` was ever called
 * (see the fix on `roster`'s declaration there) -- not this timing gap by
 * itself. This helper is still the correct fix and stays: even with that
 * crash gone, `groundHeightM()` remains the wrong signal in principle for the
 * reasoning above, and a slow-enough `loadScenario` fetch racing a
 * fast-enough terrain arrival is a real gap this closes regardless.
 */
export async function waitForScenario(page: Page, id: string): Promise<void> {
  await page.waitForFunction((wanted) => (window as DiagWindow).__ww2?.scenarioId() === wanted, id, {
    timeout: 30_000,
  })
}

export async function waitForTerrain(page: Page): Promise<void> {
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
  await startGame(page)
}

/**
 * Walks the title screen's four forms (2026-09-19; sortie forms 2026-09-27),
 * which hold the world until Launch. `waitForTerrain` calls this, so every spec goes
 * through the shipped title rather than a DEV bypass; a spec that waits on
 * the tick directly instead (ocean.spec.ts) calls it itself. A no-op once
 * the title is gone.
 *
 * Since Plan 9 Task 5 (`3dc0fc6`, roster step -- design §3) `New game` starts
 * disabled and only `selectPilot()` inside titleScreen.ts's `build()` clears
 * it, and `build()` resets `selectedPilotId` to null on every fresh title
 * (including a return-to-title, where the roster list persists but the
 * selection never does) -- so a bare click here used to sit on a permanently
 * disabled button until Playwright's actionability wait burned the whole
 * test timeout. Fixed 2026-09-24: pick the first existing roster entry if
 * one is present (`button[aria-pressed]` is the roster row's own marker,
 * set only by `makePilotButton` -- `New pilot`/`New game`/`about`/`close`
 * never get one), otherwise go through the "New pilot" inline form with a
 * fixed, recognizable name, matching the sequence `scenarioPicker.spec.ts`'s
 * "Regression Test" case already exercised by hand before this fix existed.
 */
/**
 * A radio row's whole label (AD-1), as a name matcher. Not `exact: true`: a
 * checked ballot row's accessible name carries its box's mark ("✕ Free
 * Flight"), which an exact match would miss. Anchored at the end, so "Air
 * Combat" does not also match "Air Combat: Veteran".
 */
export function wholeLabel(label: string): RegExp {
  return new RegExp(`(^|\\s)${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
}

export async function startGame(
  page: Page,
  options: { readonly scenario?: string; readonly aircraft?: string; readonly loadout?: string; readonly dev?: boolean } = {},
): Promise<void> {
  const title = page.getByRole('dialog', { name: 'Title' })
  const newGame = title.getByRole('button', { name: 'New game' })
  if (!(await newGame.isVisible())) return

  const existingPilot = title.locator('button[aria-pressed]').first()
  if (await existingPilot.isVisible()) {
    await existingPilot.click()
  } else {
    await title.getByRole('button', { name: 'New pilot' }).click()
    await title.getByPlaceholder('Pilot name').fill('Test Pilot')
    await title.getByRole('button', { name: 'Add' }).click()
  }

  // Four sequential forms (sortie spec): Dev on Form 1, then New game to the
  // mission, Next to the aircraft, Next to the armament, Launch. Every form
  // opens on its default, so with no options this flies exactly the sortie a
  // bare Launch did before the forms. `scenario` is the row's WHOLE label
  // (AD-1: "Air Combat" is part of "Air Combat: Veteran"); `aircraft` and
  // `loadout` may be a distinctive part of one ('Zero'; 'Both' for "Both (recommended)").
  if (options.dev === true) await title.getByRole('checkbox', { name: 'Dev — unlocks everything' }).check()
  await newGame.click()
  if (options.scenario !== undefined) await title.getByRole('radiogroup', { name: 'Scenario' }).getByRole('radio', { name: wholeLabel(options.scenario) }).check()
  await title.getByRole('button', { name: 'Next' }).click()
  if (options.aircraft !== undefined) await title.getByRole('radiogroup', { name: 'Aircraft' }).getByRole('radio', { name: options.aircraft }).check()
  await title.getByRole('button', { name: 'Next' }).click()
  if (options.loadout !== undefined) await title.getByRole('radiogroup', { name: 'Loadout' }).getByRole('radio', { name: options.loadout }).check()
  await title.getByRole('button', { name: 'Launch' }).click()
}

/**
 * From Form 2 with its mission picked: Next to the aircraft, Next to the
 * armament, Launch -- each form on its default. `title` is the Title dialog
 * locator a spec already holds (a reshown title after a flight included).
 */
export async function launchFromOrders(title: Locator): Promise<void> {
  await title.getByRole('button', { name: 'Next' }).click()
  await title.getByRole('button', { name: 'Next' }).click()
  await title.getByRole('button', { name: 'Launch' }).click()
}

/**
 * The quick launch (sortie spec A6): straight into flight, no title, a Dev
 * sortie that records nothing. Ids, not labels. For specs about flight,
 * rendering or AI; specs about the forms, scoring or the roster keep
 * `startGame`.
 */
export async function quickLaunch(page: Page, o: { readonly scenario: string; readonly aircraft?: string; readonly loadout?: string }): Promise<void> {
  const q = new URLSearchParams({ scenario: o.scenario })
  q.append('launch', '')
  if (o.aircraft !== undefined) q.set('aircraft', o.aircraft)
  if (o.loadout !== undefined) q.set('loadout', o.loadout)
  await page.goto(`/?${q.toString()}`)
  await waitForScenario(page, o.scenario)
}

/** Everything the assertions below need, in one round trip. */
export async function snapshot(page: Page): Promise<{
  position: { x: number; y: number; z: number }
  groundHeightM: number | null
  tick: number
  errors: readonly string[]
}> {
  return page.evaluate(() => {
    const d = (window as DiagWindow).__ww2!
    const p = d.aircraftPositionM()
    return {
      position: { x: p.x, y: p.y, z: p.z },
      groundHeightM: d.groundHeightM(),
      tick: d.tick(),
      errors: d.validationErrors,
    }
  })
}

/**
 * The camera/control sweep both Tier 2 suites fly: cycle the camera, look
 * all the way round including the 180-degree look-back, then deflect the
 * controls.
 *
 * Extracted here in Task 11 because `terrain.spec.ts` needs the identical
 * sweep at three altitudes over Leyte and a second copy of it would be a
 * second thing to keep true -- the sweep's value is entirely in the
 * did-anything-actually-happen assertions inside it, and those are what a
 * copy would drift on first.
 *
 * Every phase proves it took effect before the caller is allowed to trust an
 * empty `validationErrors` list. Without that, a wrong key code reports zero
 * errors because nothing happened, not because nothing went wrong -- which is
 * indistinguishable from a passing run by looking at the error list alone.
 */
export async function flySweep(page: Page): Promise<void> {
  const initialMode = await page.evaluate(() => (window as DiagWindow).__ww2!.cameraMode())

  await page.keyboard.down('KeyC')
  await page.waitForTimeout(400)
  await page.keyboard.up('KeyC')
  await page.waitForFunction((prevMode) => (window as DiagWindow).__ww2!.cameraMode() !== prevMode, initialMode)
  const cycledMode = await page.evaluate(() => (window as DiagWindow).__ww2!.cameraMode())
  expect(cycledMode, 'KeyC did not change window.__ww2.cameraMode() -- see src/input/bindings.ts').not.toBe(
    initialMode,
  )

  const tickBeforeRest = await page.evaluate(() => (window as DiagWindow).__ww2!.tick())

  // Look around, full sweep including the 180-degree look-back (Numpad0) --
  // the most extreme camera pose the app can generate and the likeliest to
  // surface a renderer bug (round 1 review; the omission was the brief's, not
  // just this file's). `lookOffsetFromKeys` is a pure snapshot that snaps
  // back to centre the instant a key is released (src/input/lookAround.ts),
  // so proving the FIRST one took effect has to happen while it is still
  // held -- reading `look()` after the whole loop would read LOOK_CENTRE
  // regardless of whether anything worked, the same trap the KeyC check
  // above avoids for the camera mode.
  await page.keyboard.down('Numpad4')
  await page.waitForFunction(() => (window as DiagWindow).__ww2!.look().yawRad !== 0)
  const lookedYaw = await page.evaluate(() => (window as DiagWindow).__ww2!.look().yawRad)
  expect(
    lookedYaw,
    'Numpad4 did not change window.__ww2.look().yawRad -- see src/input/lookAround.ts',
  ).not.toBe(0)
  await page.waitForTimeout(400)
  await page.keyboard.up('Numpad4')

  for (const key of ['Numpad6', 'Numpad8', 'Numpad2', 'Numpad0', 'Numpad5', 'KeyC']) {
    await page.keyboard.down(key)
    await page.waitForTimeout(400)
    await page.keyboard.up(key)
  }
  for (const key of ['ArrowDown', 'ArrowLeft', 'Equal']) {
    await page.keyboard.down(key)
    await page.waitForTimeout(600)
    await page.keyboard.up(key)
  }

  // Throttle integrates its key and holds after release (controlsFromKeys,
  // src/input/keyboard.ts), so this proves the Equal hold above actually
  // reached `frame.controls` -- not just that the render loop kept ticking.
  // Round 1 review: `tick()` alone advances from `requestAnimationFrame`
  // whether or not a single key was ever delivered, so it cannot stand in
  // for this; it was the whole control-deflection phase that was unproven.
  const throttleAfter = await page.evaluate(() => (window as DiagWindow).__ww2!.controls().throttle)
  expect(throttleAfter, 'throttle stayed at 0 -- Equal did not reach frame.controls').toBeGreaterThan(0)

  // The render loop must still have been advancing throughout -- if it had
  // stalled or thrown partway through the sweep, validationErrors would be
  // trivially empty for the wrong reason (nothing ran).
  const tickAfter = await page.evaluate(() => (window as DiagWindow).__ww2!.tick())
  expect(tickAfter, 'tick did not advance during the sweep -- the render loop stalled').toBeGreaterThan(
    tickBeforeRest,
  )
}

/** The q-th percentile of `values`, nearest-rank, 0 <= q <= 1.
 *
 *  It is here because this file is where the Tier 2 suites' shared vocabulary
 *  lives, not because any particular number of callers exists -- which is
 *  also why this comment no longer counts them. It has named the wrong count
 *  twice: "two callers" (review fix round 1, m10) and then "only
 *  `terrain.spec.ts`", which was already false for `entities.spec.ts` and is
 *  now false for `deckQuals.spec.ts` as well (2026-09-19). */
export function percentile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? NaN
}

const f6f = loadAircraftSpec('f6f-hellcat')

const heightAboveGroundM = (page: Page) =>
  page.evaluate(([gearHeightM]) => {
    const d = (window as DiagWindow).__ww2!
    const groundM = d.groundHeightM()
    if (groundM === null) return null
    return d.aircraftPositionM().y - gearHeightM - groundM
  }, [f6f.gear.heightM] as const)

/** The mission log's landing entries so far; 0 without a mission. */
const landingCount = (page: Page) =>
  page.evaluate(() => ((window as DiagWindow).__ww2!.mission()?.log ?? []).filter((e) => e.kind === 'landing').length)

/** The takeoff roll from a parked spot, the rotate, and the climb just past
 *  `AIRBORNE_LATCH_M`. Ends airborne at full throttle; `landAndStop` lands.
 *  Starts parked with the title gone and terrain loaded. */
export async function hopClear(page: Page): Promise<void> {
  // -- Take off. Same roll/rotate shape `takeoff.spec.ts` already proved on
  // the default free-flight spawn; there is no aircraft-vs-aircraft
  // collision in this sim (`weapons/combat.ts`'s ray-based hit path is the
  // only one), so rolling through a wrecked parking spot is not a hazard.
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
  console.log(`hopClear: cleared the latch at ${(await heightAboveGroundM(page))?.toFixed(1)} m`)
}

/**
 * From wherever `hopClear` left the airplane: the test pilot's landing onto
 * Tacloban's runway ahead (see the body), then brakes held until `until`: the debrief dialog, or (`'stopped'`) the mission log
 * recording a NEW landing -- more landing entries than when this call began
 * (controller ruling PF9: "any landing" would return at once on a second
 * landing). The mission logs its landing when the airplane comes to rest
 * below `LANDED_SPEED_MPS`, the same moment the debrief would otherwise open.
 */
export async function landAndStop(page: Page, until: 'debrief' | 'stopped'): Promise<void> {
  const landingsBefore = await landingCount(page)

  // -- Land: the shared test pilot's landing phase (`approachControls`, the
  // game's own landing autopilot) onto the runway ahead, flown in the page
  // every frame. Until 2026-09-29 this was a timed key script measured on
  // 2026-09-24; after T1 changed the take-off it porpoised into the sea
  // (traced 2026-09-29), which is why `hopClear` hands over to the pilot.
  // `hopClear` leaves the throttle-up key held (a real Playwright keydown);
  // held against the pilot's throttle-down it cancels to no change, and the
  // airplane stays at full power down the runway (measured 2026-09-29).
  await page.keyboard.up('Equal')
  const here = await page.evaluate(() => (window as DiagWindow).__ww2!.playerFlight()!.state.position)
  const flown = await flyPass(page, landingAhead(here, 'tacloban', LANDING_AHEAD_M, groundTruthTerrainOnce()), 60, 'land')
  expect(flown.end, 'the landing did not come to rest on the runway').toBe('stopped')
  expect(
    await page.evaluate(() => (window as DiagWindow).__ww2!.impact()),
    'the touchdown was a crash, not a landing',
  ).toBeNull()

  // At rest: hold the brakes until `until` (see this function's doc comment).
  await page.keyboard.down('KeyB')
  if (until === 'debrief') await debriefDialog(page).waitFor({ timeout: 30_000 })
  else {
    await page.waitForFunction(
      (before) => ((window as DiagWindow).__ww2!.mission()?.log ?? []).filter((e) => e.kind === 'landing').length > before,
      landingsBefore,
      { timeout: 30_000 },
    )
  }
  await page.keyboard.up('KeyB')
}

/** The sink rate `diveToSea` pushes for, m/s: steep enough to reach the
 *  surface from Convoy Strike's 3,000 m start well inside its timeout. */
const DIVE_SINK_MPS = 60

/**
 * Ends a flight by flying it into the surface, and returns once the debrief
 * is open (M3 Task 8). Pitch-down is `BINDINGS.pitchDown`'s first key rather
 * than a literal, so a rebind cannot leave this holding a dead key.
 *
 * It is a closed loop on sink rate, not a held key: measured on the
 * reference GPU 2026-09-27, holding pitch-down from Convoy Strike's start
 * (3,000 m, 120 m/s) flies outside loops -- 2,960 m down to 2,140 m and back
 * up to 2,880 m, twice in 40 s -- and never reaches the ground. So the key
 * is held only while the airplane sinks slower than `DIVE_SINK_MPS`.
 *
 * A steep, fast arrival is a crash, not a ditching: `contactOutcome`
 * (src/sim/contact.ts) wants wings level, nose up, a gentle sink and
 * near-stall speed. So the debrief this produces reads "Killed".
 */
export async function diveToSea(page: Page, timeoutMs = 120_000): Promise<void> {
  const key = BINDINGS.pitchDown[0]
  const debrief = debriefDialog(page)
  const deadline = Date.now() + timeoutMs
  let held = false
  let last = await page.evaluate(() => ({ y: (window as DiagWindow).__ww2!.aircraftPositionM().y, t: performance.now() }))
  try {
    while (!(await debrief.isVisible())) {
      if (Date.now() > deadline) throw new Error(`diveToSea: no debrief after ${timeoutMs} ms, y = ${last.y.toFixed(0)} m`)
      await page.waitForTimeout(200)
      const now = await page.evaluate(() => ({ y: (window as DiagWindow).__ww2!.aircraftPositionM().y, t: performance.now() }))
      const sinkMps = ((last.y - now.y) * 1000) / Math.max(1, now.t - last.t)
      last = now
      const want = sinkMps < DIVE_SINK_MPS
      if (want !== held) {
        if (want) await page.keyboard.down(key)
        else await page.keyboard.up(key)
        held = want
      }
    }
  } finally {
    if (held) await page.keyboard.up(key)
  }
}
