import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../src/sim/content.js'
import { createState } from '../../src/sim/flight/model.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qIdentity, qFromAxisAngle } from '../../src/sim/math/quat.js'
import { holdLevelFlight, holdLevelHeading, holdPitchAngle } from '../../src/sim/autopilot.js'

// Finding 6: autopilot.ts shipped with no test of its own, covered only
// transitively through tools/testcards. These three cover the paths that
// transitive coverage did not reach.
const spec = loadAircraftSpec('f6f-hellcat')

describe('autopilot', () => {
  it('falls back to holdLevelHeading below 1 m/s, exercising the v < 1 branch and holdLevelHeading itself', () => {
    // Below 1 m/s the trim inversion in holdLevelFlight divides by a
    // vanishing dynamic pressure, so it has to bail out to the plain
    // attitude hold instead. Verified 2026-09-12: at 0.5 m/s this returns
    // holdLevelHeading's output exactly (pitch 0, roll -0, yaw 0, throttle
    // 0.7) even with a huge altitude/climb demand (target 5000 m, +20 m/s)
    // that would otherwise drive a very different command.
    const state = createState({ position: v3(0, 1000, 0), velocity: v3(0.5, 0, 0), attitude: qIdentity() })
    expect(holdLevelFlight(spec, state, 0.7, 5000, 20)).toEqual(holdLevelHeading(spec, state, 0.7))
  })

  it('commands left aileron for a right bank, and right aileron for a left bank (roll channel sign)', () => {
    // A positive rotation about body +X tips `up` toward body +Z (right), so
    // a positive bank must produce NEGATIVE (left) aileron. A sign flip in
    // the roll channel would make this assertion fail rather than silently
    // pass, because it checks direction, not just magnitude.
    const bankRad = 10 * (Math.PI / 180)
    const rightBank = createState({ position: v3(0, 0, 0), velocity: v3(100, 0, 0), attitude: qFromAxisAngle(v3(1, 0, 0), bankRad) })
    const leftBank = createState({ position: v3(0, 0, 0), velocity: v3(100, 0, 0), attitude: qFromAxisAngle(v3(1, 0, 0), -bankRad) })

    const rightBankControls = holdPitchAngle(spec, rightBank, 1, 0)
    const leftBankControls = holdPitchAngle(spec, leftBank, 1, 0)

    expect(rightBankControls.roll).toBeLessThan(0)
    expect(leftBankControls.roll).toBeGreaterThan(0)
    // ROLL_GAIN = 3 in autopilot.ts, unsaturated at this bank angle. Verified
    // 2026-09-12: -0.523598... for the 10-degree right bank.
    expect(rightBankControls.roll).toBeCloseTo(-bankRad * 3, 5)
  })

  it('saturates the commanded pitch attitude at MAX_PITCH_CMD_RAD however large the trim demand is', () => {
    // At 2 m/s the dynamic pressure is tiny, so the trim angle of attack
    // needed to carry the F6F's weight is enormous -- thousands of degrees,
    // not a real angle of attack. Without the MAX_PITCH_CMD_RAD clamp in
    // holdLevelFlight, the pitch-attitude error this drives into
    // holdPitchAngle would be so large that its own +-1 output clamp would
    // saturate `pitch` to exactly 1 regardless of the aeroplane's current
    // attitude. Starting the aeroplane already close to the 0.55 rad cap
    // (at 0.5 rad, ~28.6 degrees nose-up) distinguishes the two: if
    // MAX_PITCH_CMD_RAD is doing its job, the resulting pitch-attitude error
    // is only (0.55 - 0.5) rad, which does NOT saturate holdPitchAngle's own
    // clamp. Verified 2026-09-12: pitch reads 0.200000... here, not 1.
    const state = createState({ position: v3(0, 0, 0), velocity: v3(2, 0, 0), attitude: qFromAxisAngle(v3(0, 0, 1), 0.5) })
    const controls = holdLevelFlight(spec, state, 1, 0, 0)
    expect(controls.pitch).toBeLessThan(0.9)
    expect(controls.pitch).toBeCloseTo(0.2, 2)
  })
})
