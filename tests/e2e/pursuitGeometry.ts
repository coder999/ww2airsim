/**
 * The one piece of arithmetic `ai-pursuit-difficulty.spec.ts` rests its whole
 * acceptance claim on, split out of that spec so a Tier 1 test can call it
 * directly (`tests/render/pursuitGeometry.test.ts` -- it cannot live in this
 * directory, which is Playwright's `testDir`, or both runners would collect
 * it). Deliberately importless and pure: no Playwright, no `src/`, four
 * numbers in and a boolean out.
 *
 * It is split out because the original in-spec copy was geometrically
 * INVERTED and nothing could see it (final whole-branch review, Critical 1):
 * it used `atan2(dx, dz)` -- a bearing convention `headingRad` does not use --
 * and then tested alignment WITH the nose rather than opposition to it. On
 * `pursuit-range`'s due-east geometry those two errors compounded into an
 * exact inversion, so the test passed precisely when the pursuer had the
 * player on its gunsight. Typecheck, lint and every other test were blind to
 * it; only a mechanical assertion on this function can see it, which is what
 * the Tier 1 test now makes.
 */

/** One entry of `window.__ww2.aircraft()` (`src/render/diagnostics.ts`). */
export type AircraftDiag = {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly z: number
  readonly headingRad: number
}

/** True when `player` is within `withinDeg` of directly behind `enemy`'s
 *  tail and inside `withinM` -- an approximation of "got behind it" using
 *  only the horizontal heading diagnostics already exposes (no full 3D
 *  attitude is available from `aircraft()`), which is the geometry this
 *  scenario's own combat plane is flown in. */
export function isBehind(player: AircraftDiag, enemy: AircraftDiag, withinM: number, withinDeg: number): boolean {
  const dx = player.x - enemy.x, dz = player.z - enemy.z
  const rangeM = Math.hypot(dx, dz, player.y - enemy.y)
  if (rangeM > withinM) return false
  // Same convention `src/render/main.ts:723` builds `headingRad` in:
  // `atan2(forward.x, -forward.z)`, i.e. 0 = north = -Z, +pi/2 = east = +X.
  // The `z` sign is not optional -- `atan2(dx, dz) === pi - atan2(dx, -dz)`
  // reflects the bearing, which cancels against the front/back error below
  // only for headings near 0 or pi.
  const bearingToPlayer = Math.atan2(dx, -dz)
  const angleOff = Math.abs(
    Math.atan2(Math.sin(bearingToPlayer - enemy.headingRad), Math.cos(bearingToPlayer - enemy.headingRad)),
  )
  // BEHIND the tail = opposite the nose, so this must be NEAR 180 degrees.
  // `< withinDeg` would be "in front of it", i.e. the tail-chase gun geometry
  // this plan exists to let the player ESCAPE.
  return (angleOff * 180) / Math.PI > 180 - withinDeg
}
