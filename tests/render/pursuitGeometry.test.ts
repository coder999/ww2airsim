import { describe, it, expect } from 'vitest'
import { qFromAxisAngle, qRotate } from '../../src/sim/math/quat.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { isBehind, type AircraftDiag } from '../e2e/pursuitGeometry.js'

/**
 * Tier 1 guard on `tests/e2e/pursuitGeometry.ts`'s `isBehind`, the single
 * piece of arithmetic Plan 7d's acceptance test (`ai-pursuit-difficulty.spec
 * .ts`) rests its entire claim on. The final whole-branch review found the
 * original inline version inverted: `atan2(dx, dz)` instead of the
 * `atan2(dx, -dz)` that `src/render/main.ts` builds `headingRad` with, and
 * `angleOff < withinDeg` (in FRONT of the nose) where "behind the tail"
 * needs `angleOff > 180 - withinDeg`. The two errors cancel only near
 * headings 0 and pi; the Plan 7 tail chase (`content/scenarios/pursuit-range.json` until
 * 2026-09-25, now `tests/fixtures/scenarios/pursuit-tail-chase.json`) spawns both
 * aircraft due east, where they compound into an exact inversion -- the test
 * passed precisely when the pursuer had the player in its gunsight, and would
 * have passed at the merge-base with none of Plan 7d's code.
 *
 * It lives in `tests/render/` rather than beside the helper because
 * `tests/e2e/` is Playwright's `testDir` (`playwright.config.ts`), so a
 * vitest file there would be collected by BOTH runners; and because the
 * convention under test is owned by `src/render/main.ts`'s `aircraft()`
 * diagnostic, which this file derives `headingRad` from the same way rather
 * than restating `pi/2` by hand. That is the point: the bug class here is a
 * geometry helper whose convention silently disagrees with its data source,
 * so the test reads the convention from the source.
 */

/** `headingRad` exactly as the `aircraft()` diagnostic reports it: build the
 *  airborne-start attitude `src/sim/scenario.ts` builds from `headingDeg`,
 *  then read it back with `src/render/main.ts`'s own formula. */
function headingRadOf(headingDeg: number): number {
  const attitude = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - (headingDeg * Math.PI) / 180)
  const forward = qRotate(attitude, v3(1, 0, 0))
  return Math.atan2(forward.x, -forward.z)
}

const at = (x: number, z: number, headingRad = 0): AircraftDiag => ({ id: 'a', x, y: 3000, z, headingRad })

describe('isBehind, the Plan 7d acceptance geometry', () => {
  it('derives the headings this scenario actually spawns, in the diagnostic\'s own convention', () => {
    // 0 = north = -Z, +pi/2 = east = +X. Asserted so the four cases below are
    // reading real spawn headings, not hand-written radians that could drift
    // from what `scenario.ts` and `main.ts` agree on.
    expect(headingRadOf(90)).toBeCloseTo(Math.PI / 2, 12) // the Plan 7 tail chase spawns both due east
    expect(headingRadOf(0)).toBeCloseTo(0, 12)
  })

  it('an east-flying pursuer has the player ahead, not behind, when the player is at +X', () => {
    const enemy = at(0, 0, headingRadOf(90))
    expect(isBehind(at(300, 0), enemy, 400, 45)).toBe(false) // 300 m off its nose
    expect(isBehind(at(-300, 0), enemy, 400, 45)).toBe(true) // 300 m off its tail
  })

  it('a north-flying pursuer has the player ahead at -Z and behind at +Z', () => {
    const enemy = at(0, 0, headingRadOf(0))
    expect(isBehind(at(0, -300), enemy, 400, 45)).toBe(false) // north is -Z
    expect(isBehind(at(0, 300), enemy, 400, 45)).toBe(true)
  })

  it('gates on range and on the cone, not on either alone', () => {
    const enemy = at(0, 0, headingRadOf(90))
    // Dead astern but out of range: the spec's claim is "got behind it AND
    // close", so distance alone must not carry it.
    expect(isBehind(at(-900, 0), enemy, 400, 45)).toBe(false)
    // In range, abeam (90 deg off the tail, well outside a 45 deg cone).
    expect(isBehind(at(0, 300), enemy, 400, 45)).toBe(false)
    // Astern and inside the cone, but offset: 300 m back, 100 m to one side
    // is ~18 deg off the tail.
    expect(isBehind(at(-300, 100), enemy, 400, 45)).toBe(true)
  })
})
