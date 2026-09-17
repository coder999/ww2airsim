import { describe, it, expect } from 'vitest'
import { step, DT } from '../../../src/sim/flight/model.js'
import { createState, type AircraftState } from '../../../src/sim/flight/state.js'
import { v3, length, normalize, dot } from '../../../src/sim/math/vec3.js'
import { qRotate, qIdentity } from '../../../src/sim/math/quat.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

describe('weathercock stability', () => {
  const spec = loadAircraftSpec('f6f-hellcat')
  const NEUTRAL = { roll: 0, pitch: 0, yaw: 0, throttle: 0.7 }
  const deg = (r: number) => (r * 180) / Math.PI
  const rad = (d: number) => (d * Math.PI) / 180

  /** Sideslip: positive when the airflow comes from the right of the nose. */
  const slipRad = (s: AircraftState): number => {
    const v = length(s.velocity)
    if (v < 1e-6) return 0
    return Math.asin(
      Math.max(-1, Math.min(1, dot(normalize(s.velocity), qRotate(s.attitude, v3(0, 0, 1))))),
    )
  }
  const crabbed = (slipDeg: number, speed = 120): AircraftState =>
    createState({
      position: v3(0, 600, 0),
      velocity: v3(speed * Math.cos(rad(slipDeg)), 0, speed * Math.sin(rad(slipDeg))),
      attitude: qIdentity(),
    })
  const run = (s: AircraftState, seconds: number, c = NEUTRAL): AircraftState => {
    let out = s
    for (let i = 0; i < Math.round(seconds / DT); i++) out = step(spec, out, c, { dt: DT, tick: i + 1 })
    return out
  }

  it('swings the NOSE into the wind, rather than waiting for the track to catch up', () => {
    // The distinction that matters, and the one the old model failed. Before
    // this, hands off at 120 m/s from 10 degrees of sideslip, the nose heading
    // did not move by a hundredth of a degree in a full minute -- the slip
    // decayed only because thrust has a lateral component while crabbed, which
    // curves the TRACK. A fin turns the airplane; it does not steer it.
    //
    // RE-MEASURED 2026-09-17, and the threshold moved for a legitimate reason
    // rather than a regression. `sideForceN` added the lateral aerodynamic
    // force the model never had, so the slip is now removed by BOTH mechanisms
    // -- the fin swinging the nose and the side force bending the track -- and
    // the nose therefore has less distance to travel before the slip is gone.
    // Hands off from 10 degrees: the heading swings **7.47 degrees** where it
    // used to swing more than 8, and the slip ends at 0.002 degrees.
    //
    // **The ruling this case exists to protect is intact.** It says the nose
    // must move rather than sit still waiting for the track, and 7.47 degrees
    // against the old model's 0.00 is that ruling holding. It never said the
    // track must not curve; both happen in a real airplane, and having only
    // the track was the bug, not having both.
    const start = crabbed(10)
    const heading = (s: AircraftState) => {
      const f = qRotate(s.attitude, v3(1, 0, 0))
      return deg(Math.atan2(f.z, f.x))
    }
    const after = run(start, 10)
    expect(heading(start)).toBeCloseTo(0, 6)
    expect(heading(after)).toBeGreaterThan(7)
    expect(Math.abs(deg(slipRad(after)))).toBeLessThan(0.5)
  })

  it('decays sideslip at least as fast as the time constant the content declares', () => {
    // **This case changed meaning on 2026-09-17, and the rename says so.**
    // `weathercockSeconds` used to describe the decay of the whole sideslip,
    // because the fin was the only thing removing it. `sideForceN` added the
    // lateral aerodynamic force the model never had, so the track now bends
    // toward the nose as well and the slip goes faster than the declared
    // constant: measured 2.588 degrees after one tau from 10, against the
    // 3.679 that 10/e predicts.
    //
    // So the constant now describes the FIN's half only, and the assertion is
    // a bound rather than a band. Asserting the old band would be asserting
    // that the side force does not exist.
    const tau = spec.rates.weathercockSeconds
    const s0 = 10
    const after = run(crabbed(s0), tau)
    expect(deg(slipRad(after))).toBeLessThan(s0 / Math.E)
    // And not instantly, which would mean the decay is no longer a time
    // constant at all: still more than half of what the fin alone would leave.
    expect(deg(slipRad(after))).toBeGreaterThan((s0 / Math.E) * 0.5)
  })

  it('works both ways round, and does not overshoot into the opposite slip', () => {
    for (const sign of [1, -1]) {
      const after = run(crabbed(12 * sign), 8)
      expect(Math.abs(deg(slipRad(after)))).toBeLessThan(0.5)
      // A sign error would drive the slip away instead of toward zero, and an
      // overshoot would show as slip of the opposite sign.
      expect(Math.sign(deg(slipRad(after))) === -sign && Math.abs(deg(slipRad(after))) > 0.4).toBe(false)
    }
  })

  it('does nothing at all when the airplane is already aligned', () => {
    // A weathercock term that fires on zero sideslip would yaw a coordinated
    // airplane off its heading for no reason.
    const straight = createState({ position: v3(0, 600, 0), velocity: v3(120, 0, 0) })
    const after = run(straight, 5)
    expect(Math.abs(deg(slipRad(after)))).toBeLessThan(0.02)
    const f = qRotate(after.attitude, v3(1, 0, 0))
    expect(deg(Math.atan2(f.z, f.x))).toBeCloseTo(0, 3)
  })

  it('goes mushy with the rest of the controls near the stall', () => {
    // It is scaled by the same dynamic-pressure authority as every commanded
    // rate, so a fin at 30 m/s must be markedly weaker than one at 180.
    const slow = deg(slipRad(run(crabbed(10, 30), 1)))
    const fast = deg(slipRad(run(crabbed(10, 180), 1)))
    expect(slow).toBeGreaterThan(fast)
  })

  it('cannot yaw faster than full rudder could', () => {
    // Saturated at the fin's own commanded maximum, so a violent entry cannot
    // snap the nose round faster than the airplane can physically yaw.
    const violent = run(crabbed(60, 200), DT)
    const maxRad = spec.rates.maxYawRateDegPerSec * (Math.PI / 180)
    expect(Math.abs(violent.bodyRates.y)).toBeLessThanOrEqual(maxRad * 1.0001)
  })

  it('stays finite from a standstill, where sideslip is undefined', () => {
    const still = createState({ position: v3(0, 600, 0), velocity: v3(0, 0, 0) })
    const after = run(still, 0.5)
    expect(Number.isFinite(after.bodyRates.y)).toBe(true)
    expect(Number.isFinite(after.attitude.w)).toBe(true)
  })
})
