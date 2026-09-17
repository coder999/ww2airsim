import { describe, it, expect } from 'vitest'
import { flapAfter } from '../../src/sim/flaps.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')

/**
 * Flaps, as state and as a command. Deliberately `gearAfter`'s twin rather
 * than a shared generic actuator: two call sites do not justify the
 * abstraction, and the gear's own doc comment carries the `undefined`-means-
 * hold rule this follows.
 */
describe('flapAfter', () => {
  it('takes the specified time to travel fully down', () => {
    let f = 0
    for (let i = 0; i < 60 * f6f.flap.travelSeconds; i++) f = flapAfter(f6f, f, true, 1 / 60)
    expect(f).toBeCloseTo(1, 6)
  })

  it('takes the same time to come back up', () => {
    let f = 1
    for (let i = 0; i < 60 * f6f.flap.travelSeconds; i++) f = flapAfter(f6f, f, false, 1 / 60)
    expect(f).toBeCloseTo(0, 6)
  })

  it('holds position when the pilot says nothing', () => {
    // `undefined` is "no command this step", and a flap lever stays where it
    // is left -- the same rule `gearAfter` documents for the gear.
    expect(flapAfter(f6f, 0.42, undefined, 1 / 60)).toBe(0.42)
  })

  it('clamps at both ends rather than running past them', () => {
    expect(flapAfter(f6f, 1, true, 10)).toBe(1)
    expect(flapAfter(f6f, 0, false, 10)).toBe(0)
  })

  it('holds position on a non-finite step instead of moving by NaN', () => {
    // A non-finite dt reaching the travel would put a NaN on the state and
    // from there into the lift curve and the integrator -- master spec section
    // 9's named hazard. `gearAfter` guards the same way for the same reason.
    expect(flapAfter(f6f, 0.5, true, NaN)).toBe(0.5)
    expect(flapAfter(f6f, 0.5, true, Infinity)).toBe(0.5)
    expect(flapAfter(f6f, 0.5, true, -1)).toBe(0.5)
  })
})
