import { describe, it, expect } from 'vitest'
import { angleOfAttack } from '../../../src/sim/flight/model.js'
import { createState, type AircraftState } from '../../../src/sim/flight/state.js'
import { v3, add, scale, dot, length, normalize } from '../../../src/sim/math/vec3.js'
import { qRotate, qMul, qFromAxisAngle, qIdentity } from '../../../src/sim/math/quat.js'

/**
 * What open item 8 claimed, and what is actually true.
 *
 * The item said `angleOfAttack` "leaves the lateral component in its
 * denominator", over-reporting alpha by 1/cos(sideslip), and that alpha should
 * instead be measured with the lateral component projected out of the velocity
 * first. The second half of that is right about where alpha belongs and wrong
 * about the code: `atan2(-dot(v, up), dot(v, forward))` is ALREADY the angle in
 * the plane of symmetry, because subtracting a multiple of `right` changes
 * neither dot product. See the derivation on `angleOfAttack` itself; these
 * tests are that derivation made executable, so the next person to read the
 * retracted item has an assertion to run rather than a paragraph to trust.
 */
const deg = (r: number) => (r * 180) / Math.PI
const rad = (d: number) => (d * Math.PI) / 180

/** The formulation open item 8 asked for, written out literally: project the
 *  body-lateral component out of the velocity, then take the angle in what is
 *  left. Lives in the test, not in `model.ts`, because it is what the fix
 *  WOULD have been and the point is that it is the same function. */
const alphaProjected = (s: AircraftState): number => {
  const v = s.velocity
  if (length(v) < 1e-6) return 0
  const forward = qRotate(s.attitude, v3(1, 0, 0))
  const up = qRotate(s.attitude, v3(0, 1, 0))
  const right = qRotate(s.attitude, v3(0, 0, 1))
  const vSym = add(v, scale(right, -dot(v, right)))
  if (length(vSym) < 1e-12) return Number.NaN // degenerate: purely lateral flow
  const n = normalize(vSym)
  return Math.atan2(-dot(n, up), dot(n, forward))
}

const attitude = (rollDeg: number, pitchDeg: number, yawDeg: number) =>
  qMul(
    qMul(qFromAxisAngle(v3(1, 0, 0), rad(rollDeg)), qFromAxisAngle(v3(0, 1, 0), rad(yawDeg))),
    qFromAxisAngle(v3(0, 0, 1), rad(pitchDeg)),
  )

describe('angleOfAttack is measured in the plane of symmetry (retracts open item 8)', () => {
  it('agrees with the explicitly-projected form to rounding, over the attitude sphere', () => {
    // A grid, not a random sample, so a failure is reproducible by eye. 360
    // cases: attitudes past vertical and inverted, and velocities that include
    // more sideslip than forward speed (the fourth one is 45 degrees of crab).
    const velocities = [v3(120, -10, 0), v3(120, -10, 45), v3(80, 30, -110), v3(100, 0, 100)]
    let worst = 0
    let worstLabel = ''
    for (const roll of [-150, -60, 0, 37, 90, 170]) {
      for (const pitch of [-80, -20, 0, 25, 70]) {
        for (const yaw of [0, 33, -95]) {
          for (const velocity of velocities) {
            const s = createState({ velocity, attitude: attitude(roll, pitch, yaw) })
            const d = Math.abs(angleOfAttack(s) - alphaProjected(s))
            if (d > worst) {
              worst = d
              worstLabel = `roll=${roll} pitch=${pitch} yaw=${yaw} v=(${velocity.x},${velocity.y},${velocity.z})`
            }
          }
        }
      }
    }
    // 1e-12 rad is 6e-11 degrees: four orders below anything the flight model
    // resolves, and two orders above the 1.2e-14 rad actually measured
    // 2026-09-13 over 20,000 randomized pairs. Proved to bite: replacing
    // `angleOfAttack`'s body with the out-of-plane angle
    // `Math.asin(-dot(vn, up))` -- a plausible wrong implementation, exact at
    // zero sideslip and wrong by 1/cos(beta) at any other -- fails this
    // assertion at 3.14 rad (roll=90 pitch=0 yaw=-95, where the asin branch
    // cannot represent reversed flow at all) and fails the next test at
    // 7.2e-5 rad on 5 m/s of crab, measured 2026-09-13.
    expect(worst, `worst case ${worstLabel}`).toBeLessThan(1e-12)
  })

  it('does not change when a lateral velocity component is added', () => {
    // The one sideslip-independence that is true: adding crab at a FIXED
    // attitude and fixed in-plane velocity cannot move alpha. This is what
    // "project the lateral component out" buys, and the code already has it.
    // It is also the discriminating case against every formulation that
    // divides by the total speed rather than the in-plane speed -- those all
    // shrink as the lateral component grows.
    const base = angleOfAttack(createState({ velocity: v3(120, -10, 0), attitude: qIdentity() }))
    for (const lateral of [0, 5, 20, 60, 120, -75]) {
      const s = createState({ velocity: v3(120, -10, lateral), attitude: qIdentity() })
      expect(angleOfAttack(s), `lateral=${lateral}`).toBeCloseTo(base, 12)
    }
    // And the value itself, so the test is not satisfiable by a function that
    // returns a constant: 10 m/s of sink on 120 m/s of forward speed.
    expect(deg(base)).toBeCloseTo(4.763641691, 6)
  })

  it('rises as tan(alpha) / cos(yaw offset) when the nose is yawed off a fixed flight path', () => {
    // What open item 8 saw and mislabelled an artefact. The flight path is held
    // FIXED here and only the nose moves, so this is a different flight
    // condition each time, not a different formula applied to one condition:
    // crabbing cuts the chordwise flow while leaving the flow normal to the
    // wing alone, so the chord genuinely meets the air at a bigger angle.
    // Measured 2026-09-13 at 120 m/s on a 4.77-degree descent: alpha reads
    // 4.772738, 4.940283 and 6.410367 degrees at 0, 15 and 42 degrees of nose
    // yaw -- i.e. +3.5% and +34.3%, which is where the item's own two
    // percentages came from. They are right; "over-reported" is what was wrong.
    const V = 120
    const path = v3(V * Math.cos(rad(-4.772738)), V * Math.sin(rad(-4.772738)), 0)
    const alphaAt = (yawDeg: number) =>
      angleOfAttack(createState({ velocity: path, attitude: qFromAxisAngle(v3(0, 1, 0), rad(yawDeg)) }))

    const alpha0 = alphaAt(0)
    expect(deg(alpha0)).toBeCloseTo(4.772738, 5)
    expect(deg(alphaAt(15))).toBeCloseTo(4.940283, 5)
    expect(deg(alphaAt(42))).toBeCloseTo(6.410367, 5)
    // The exact relation, which the three numbers above are only samples of.
    for (const yaw of [15, 42, -42, 70]) {
      expect(Math.tan(alphaAt(yaw)), `yaw=${yaw}`).toBeCloseTo(Math.tan(alpha0) / Math.cos(rad(yaw)), 12)
    }
  })

  it('stays finite in a purely lateral flow, where the projected form is degenerate', () => {
    // 90 degrees of sideslip: the in-plane velocity is exactly the zero
    // vector. `atan2(0, 0)` is 0; normalizing the projected vector would be
    // NaN, which is why the code is left as it is rather than rewritten into
    // the projected form for readability.
    const s = createState({ velocity: v3(0, 0, 130), attitude: qIdentity() })
    // -0, in fact: `atan2(-0, 0)`. Asserted by value rather than with `toBe`,
    // which would distinguish it from +0 for no reason a flight model cares
    // about -- but finiteness IS the point, so that is asserted separately.
    expect(Number.isFinite(angleOfAttack(s))).toBe(true)
    expect(angleOfAttack(s)).toBeCloseTo(0, 12)
    expect(Number.isNaN(alphaProjected(s))).toBe(true)
  })
})
