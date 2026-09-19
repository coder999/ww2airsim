import { expect, type Locator, type Page } from '@playwright/test'
import type { Ww2Diagnostics } from '../../src/render/diagnostics.js'
import { SPAWN_PARAMS } from '../../src/render/spawn.js'

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

export async function waitForTerrain(page: Page): Promise<void> {
  await page.waitForFunction(() => ((window as DiagWindow).__ww2?.groundHeightM() ?? null) !== null, undefined, {
    timeout: 30_000,
  })
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
  // src/input/keyboard.ts), so this proves the ShiftLeft hold above actually
  // reached `frame.controls` -- not just that the render loop kept ticking.
  // Round 1 review: `tick()` alone advances from `requestAnimationFrame`
  // whether or not a single key was ever delivered, so it cannot stand in
  // for this; it was the whole control-deflection phase that was unproven.
  const throttleAfter = await page.evaluate(() => (window as DiagWindow).__ww2!.controls().throttle)
  expect(throttleAfter, 'throttle stayed at 0 -- ShiftLeft did not reach frame.controls').toBeGreaterThan(0)

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
