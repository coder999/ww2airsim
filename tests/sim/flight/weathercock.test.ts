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
    //
    // RE-MEASURED AGAIN 2026-09-17 when `cySlopePerRad` went from 0.10 to
    // 0.90, the same mechanism carried further: the more side force, the more
    // of the slip the track removes and the less the nose has to swing. Hands
    // off from 10 degrees at 120 m/s, nose swing after 10 s:
    //
    // | cySlopePerRad | nose swing | slip left |
    // | --- | --- | --- |
    // | 0.10 | 9.19 deg | 0.007 deg |
    // | 0.50 | 7.32 deg | 0.001 deg |
    // | 0.90 | 6.08 deg | 0.000 deg |
    // | 1.00 | 5.84 deg | 0.000 deg |
    // | 2.00 (shipped) | 4.16 deg | 0.000 deg |
    //
    // The floor is 3: a degree under the shipped 4.16, as the old 5 sat a
    // degree under 5.84, and still three degrees above the 0.00 the ruling was
    // written against. 2.00 is Mark's number: he flew 0.90 on 2026-09-17,
    // liked the lateral movement, asked for 1.0, then asked for ~90% heading
    // retention after a rudder release and chose 2.0 from a measured grid
    // (88%). Twice the top of the published range, on purpose -- this is an
    // arcade rudder, and the content file's note carries the trade.
    const start = crabbed(10)
    const heading = (s: AircraftState) => {
      const f = qRotate(s.attitude, v3(1, 0, 0))
      return deg(Math.atan2(f.z, f.x))
    }
    const after = run(start, 10)
    expect(heading(start)).toBeCloseTo(0, 6)
    expect(heading(after)).toBeGreaterThan(3)
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
    // And not instantly. This used to be a floor on how much slip the fin was
    // allowed to leave after one tau -- half the fin-alone figure, then a
    // quarter -- which was really an assertion that the side force stays
    // weaker than the fin. Measured 2026-09-17, slip after one tau from 10
    // degrees: 3.348 at cySlopePerRad 0.10, 2.525 at 0.50, 1.903 at 0.90,
    // 1.773 at 1.00, 0.872 at the shipped 2.00. At 2.00 the side force is
    // removing slip twice as fast as the fin, which is what Mark chose (he
    // asked for ~90% heading retention after a rudder release), so a share
    // floor is the wrong assertion. What "still a time constant, not a snap"
    // actually means is checked directly instead: the slip decays
    // MONOTONICALLY through the first tau (sampled every quarter second --
    // measured at 2.00: 6.66, 4.43, 2.95, 1.97, 1.31, 0.87) and is still
    // positive at the end of it (no overshoot; the both-ways case below
    // covers the longer run).
    let previous = s0
    for (let i = 1; i <= 6; i++) {
      const at = deg(slipRad(run(crabbed(s0), (tau * i) / 6)))
      expect(at, `slip at ${i}/6 tau`).toBeLessThan(previous)
      expect(at, `slip at ${i}/6 tau`).toBeGreaterThan(0)
      previous = at
    }
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
