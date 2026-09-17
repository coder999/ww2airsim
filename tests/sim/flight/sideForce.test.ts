import { describe, it, expect } from 'vitest'
import { step, DT } from '../../../src/sim/flight/model.js'
import { createState, type AircraftState } from '../../../src/sim/flight/state.js'
import { v3, normalize, dot, length } from '../../../src/sim/math/vec3.js'
import { qRotate, qIdentity } from '../../../src/sim/math/quat.js'
import { specificEnergyAirmass } from '../../../src/sim/invariants.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

/**
 * What the side force is FOR, asserted end to end rather than as a coefficient.
 *
 * Mark reported 2026-09-17, flying an approach: holding rudder swings the nose
 * 15-20 degrees off centre and then the heading stops changing. The nose
 * behaviour was correct and designed -- sideslip builds until the weathercock's
 * restoring yaw rate cancels the rudder's commanded one, an equilibrium at
 * `maxYawRateDegPerSec * weathercockSeconds` = 22.5 degrees, independent of
 * speed because both terms carry the same authority factor.
 *
 * The bug was that the FLIGHT PATH never followed: the model had no lateral
 * aerodynamic force at all, so nothing converted sideslip into a sideways push
 * and the airplane crabbed forever, flying dead straight. Measured before this
 * term existed: 0.0 degrees of track change in 30 s of full rudder.
 */
describe('sustained rudder turns the airplane, not just its nose', () => {
  const spec = loadAircraftSpec('f6f-hellcat')
  const deg = (r: number) => (r * 180) / Math.PI
  const headingDeg = (s: AircraftState) => {
    const f = qRotate(s.attitude, v3(1, 0, 0))
    return deg(Math.atan2(f.z, f.x))
  }
  const trackDeg = (s: AircraftState) => deg(Math.atan2(s.velocity.z, s.velocity.x))
  const slipDeg = (s: AircraftState) => {
    const v = length(s.velocity)
    if (v < 1e-6) return 0
    return deg(Math.asin(Math.max(-1, Math.min(1, dot(normalize(s.velocity), qRotate(s.attitude, v3(0, 0, 1)))))))
  }
  const flyRudder = (seconds: number, yaw = 1) => {
    let s = createState({ position: v3(0, 600, 0), velocity: v3(50, 0, 0), attitude: qIdentity() })
    for (let i = 0; i < Math.round(seconds / DT); i++) {
      s = step(spec, s, { pitch: 0, roll: 0, yaw, throttle: 0.5 }, { dt: DT, tick: i + 1 })
    }
    return s
  }

  it('keeps turning the flight path for as long as the rudder is held', () => {
    // The whole point. Measured 2026-09-17 at the shipped cySlopePerRad of
    // 0.10: heading 45.1 deg and TRACK 25.1 deg after 30 s. Before the term
    // existed the track did not move at all, so any positive number here is
    // the behaviour Mark asked for; the floor is set well below the measured
    // value because the coefficient is expected to be retuned upward.
    const after30 = flyRudder(30)
    expect(trackDeg(after30)).toBeGreaterThan(15)
    expect(headingDeg(after30)).toBeGreaterThan(trackDeg(after30))
  })

  it('does not stall out after the nose reaches its sideslip equilibrium', () => {
    // The specific thing that was wrong: the nose settled and everything
    // stopped. Now the track is still moving at 30 s as much as it was at 10,
    // because heading and track rotate together once the slip settles.
    const t10 = trackDeg(flyRudder(10))
    const t20 = trackDeg(flyRudder(20))
    const t30 = trackDeg(flyRudder(30))
    expect(t20 - t10).toBeGreaterThan(5)
    expect(t30 - t20).toBeGreaterThan(5)
  })

  it('settles the sideslip rather than winding it up forever', () => {
    // Measured: about -15 degrees and holding, which is what Mark saw and
    // described. A term that kept increasing the slip would be a sign error.
    expect(Math.abs(slipDeg(flyRudder(20)))).toBeLessThan(25)
    expect(Math.abs(slipDeg(flyRudder(30)))).toBeLessThan(25)
  })

  it('works both ways round', () => {
    expect(trackDeg(flyRudder(20, 1))).toBeGreaterThan(0)
    expect(trackDeg(flyRudder(20, -1))).toBeLessThan(0)
  })

  it('never adds specific energy, which is what makes it safe to add at all', () => {
    // It opposes the sideways motion that creates it, so it can only remove
    // energy. `assertNoEnergyGain` covers the throttle-idle case across the
    // whole suite; this is the same claim for the term in isolation, at idle.
    let s = createState({ position: v3(0, 600, 0), velocity: v3(50, 0, 0), attitude: qIdentity() })
    let previous = specificEnergyAirmass(s)
    for (let i = 0; i < Math.round(20 / DT); i++) {
      s = step(spec, s, { pitch: 0, roll: 0, yaw: 1, throttle: 0 }, { dt: DT, tick: i + 1 })
      const now = specificEnergyAirmass(s)
      expect(now).toBeLessThanOrEqual(previous + 1e-6)
      previous = now
    }
  })
})
