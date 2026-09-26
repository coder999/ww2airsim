import { expect, type Locator, type Page } from '@playwright/test'
import type { Ww2Diagnostics } from '../../src/render/diagnostics.js'
import { SPAWN_PARAMS } from '../../src/render/spawn.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { AIRBORNE_LATCH_M } from '../../src/sim/landing.js'

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
 * Presses New game on the title screen (2026-09-19), which holds the world
 * until it is pressed. `waitForTerrain` calls this, so every spec goes
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
export async function startGame(page: Page, options: { readonly loadout?: string } = {}): Promise<void> {
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

  // Two sequential forms (titleScreen.ts): New game only advances from the
  // roster to Sortie Orders, and Launch starts the flight. The mission and
  // loadout defaults are already selected on Form 2, so a bare Launch is the
  // production default; `loadout` picks an Armament row first.
  await newGame.click()
  if (options.loadout !== undefined) {
    await title.getByRole('radiogroup', { name: 'Loadout' }).getByRole('radio', { name: options.loadout }).check()
  }
  await title.getByRole('button', { name: 'Launch' }).click()
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

/**
 * Rotates off a gunnery-range parking spot, hops just clear of the airborne
 * latch, and settles back down to a real physics landing, ending with the
 * debrief dialog visible. Extracted from `meta-game.spec.ts` (Plan 9 Task 8)
 * in Plan-loading-dossier Task 9 so `dossier.spec.ts` can reuse the same
 * measured hop rather than a second, independently-drifting copy.
 *
 * Starts parked on a strip with the title gone and terrain loaded; the
 * caller is responsible for getting there (`waitForScenario` + the
 * `groundHeightM`/`supportedContact` polls).
 */
export async function hopAndLand(page: Page): Promise<void> {
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
  console.log(`hopAndLand: cleared the latch at ${(await heightAboveGroundM(page))?.toFixed(1)} m`)

  // -- Land. `nextLandingTracking` only needs the wheels to come back down
  // gently (below `MAX_SUPPORTED_SINK_MPS`), not a stabilized approach, so
  // this is a short, controlled descent rather than a circuit:
  //
  // 1. Throttle to idle and a brief nose-down pulse (ArrowUp = pitchDown) --
  //    measured live on the reference GPU (Task 8, 2026-09-24): a plain
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
  console.log('hopAndLand: back on the wheels, not a crash')

  // Stop: cut the throttle the rest of the way (`KeyM`, one press to zero)
  // and hold the brakes until the debrief actually appears.
  await page.keyboard.press('KeyM')
  await page.keyboard.down('KeyB')
  await debriefDialog(page).waitFor({ timeout: 30_000 })
  await page.keyboard.up('KeyB')
}
