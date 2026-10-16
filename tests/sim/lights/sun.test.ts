import { describe, expect, it } from 'vitest'
import { TACLOBAN_LAT_DEG, sunPosition } from '../../../src/sim/lights/sun.js'
import { sunPosition as renderSunPosition } from '../../../src/render/sky/sun.js'

/**
 * F6B Task 2: the sun moved into the sim so night perception can read its elevation. Frozen table: values
 * printed from the pre-move `src/render/sky/sun.ts` on 2026-10-15 (Leyte, day 294), so a drift in the moved
 * code fails here. The render module must still re-export the same function.
 */
const FROZEN: readonly (readonly [number, number, number])[] = [
  [0, -89.175678, 0], [3, -45.836525, 93.43657], [5.5, -9.273778, 98.877057], [6, -2.019469, 100.220148],
  [9, 40.306531, 114.222493], [12, 68.344322, 180], [15, 40.306531, 245.777507], [17.5, 5.202381, 258.276997],
  [18.5, -9.273778, 261.122943], [21, -45.836525, 266.56343], [23.5, -82.587806, 275.670387],
]
describe('sim sun (moved from render, F6B Task 2)', () => {
  it('matches the values frozen from the render module before the move', () => {
    for (const [h, el, az] of FROZEN) {
      const s = sunPosition(TACLOBAN_LAT_DEG, h)
      expect(s.elevationDeg).toBeCloseTo(el, 4)
      expect(s.azimuthDeg).toBeCloseTo(az, 4)
    }
  })
  it('is the very function the renderer uses', () => { expect(renderSunPosition).toBe(sunPosition) })
})
