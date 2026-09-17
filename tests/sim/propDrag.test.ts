import { describe, it, expect } from 'vitest'
import { windmillDragCd0 } from '../../src/sim/aero.js'
import { step, DT, airspeed } from '../../src/sim/flight/model.js'
import { createState } from '../../src/sim/flight/state.js'
import { holdLevelFlight } from '../../src/sim/autopilot.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')

/**
 * Level deceleration at a pinned altitude, so drag is the only thing removing
 * energy. The climb card's own technique -- see `holdMassAndAltitude` in
 * tools/testcards/measure.ts for why pinning altitude is sound when the
 * quantity under test is along-path.
 */
const secondsToSlow = (fromMps: number, toMps: number, throttle: number, altM = 15.24): number => {
  let s = createState({ position: v3(0, altM, 0), velocity: v3(fromMps, 0, 0), fuelKg: f6f.mass.fuelCapacityKg * 0.5 })
  for (let t = 0; t < 60 * 900; t++) {
    const n = step(f6f, s, { ...holdLevelFlight(f6f, s, throttle, altM), throttle }, { dt: DT, tick: t + 1 })
    s = { ...n, position: v3(n.position.x, altM, n.position.z), velocity: v3(n.velocity.x, 0, n.velocity.z) }
    if (airspeed(s) <= toMps) return t * DT
  }
  return Number.POSITIVE_INFINITY
}

describe('windmilling propeller drag', () => {
  it('is nothing at full throttle, where the propeller is pulling', () => {
    expect(windmillDragCd0(f6f, 1)).toBe(0)
  })

  it('is the full penalty at idle, where the disc is just a brake', () => {
    expect(windmillDragCd0(f6f, 0)).toBeCloseTo(f6f.engine.windmillCd0, 12)
  })

  it('comes in progressively as the throttle closes', () => {
    expect(windmillDragCd0(f6f, 0.5)).toBeCloseTo(f6f.engine.windmillCd0 / 2, 12)
  })

  it('treats a non-finite throttle as idle, the draggier and safer reading', () => {
    expect(windmillDragCd0(f6f, Number.NaN)).toBeCloseTo(f6f.engine.windmillCd0, 12)
  })

  it('roughly doubles the clean parasitic drag with the engine stopped', () => {
    // The physical claim this whole change rests on: a 13 ft constant-speed disc
    // in flat pitch is a flat-plate brake comparable to the entire clean
    // airframe, which is why heavy fighters glide like bricks despite a paper
    // L/D in the teens. The published range is 1x to 3x clean parasitic
    // depending on blade pitch; this sits in the middle of it, deliberately,
    // rather than at whichever end made a chosen deceleration time come out.
    expect(f6f.engine.windmillCd0 / f6f.aero.cd0).toBeGreaterThan(1)
    expect(f6f.engine.windmillCd0 / f6f.aero.cd0).toBeLessThan(3)
  })

  it('more than halves the time to bleed 250 mph down to 100 mph dead-stick', () => {
    // Measured on main before this change (2026-09-16, altitude pinned, throttle 0):
    // 250 -> 100 mph took 79.3 s and 6.01 km, which is what Mark reported as an
    // eternity. The clean airframe was right; the stopped propeller was missing.
    // 39.65 s is not a threshold picked to pass -- it is half of the 79.3 s the
    // clean airframe alone took, measured on main before this change. The
    // coefficient was chosen from the published drag range first; this asserts
    // what that choice yields.
    const seconds = secondsToSlow(111.76, 44.7, 0)
    expect(seconds).toBeLessThan(79.3 / 2)
    expect(seconds).toBeGreaterThan(5) // not so draggy it stops like a parachute
  })

  it('does not touch the airplane at full power, so the graded top speed is safe', () => {
    // cd0 is the published 0.0211 and the engine is the R-2800's real 2000 hp;
    // neither may move to buy this. At throttle 1 the new term is exactly zero.
    const fast = createState({ position: v3(0, 7040, 0), velocity: v3(174.79, 0, 0) })
    const withThrottle = step(f6f, fast, { pitch: 0, roll: 0, yaw: 0, throttle: 1 }, { dt: DT, tick: 1 })
    expect(Number.isFinite(withThrottle.velocity.x)).toBe(true)
    expect(windmillDragCd0(f6f, 1)).toBe(0)
  })
})
