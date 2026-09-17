import { describe, it, expect } from 'vitest'
import {
  gearAfter,
  gearDragN,
  onGround,
  restOnSurface,
  supportedContact,
  rollingResistanceN,
  groundBodyRates,
  GROUND_CONTACT_TOLERANCE_M,
  MAX_SUPPORTED_SINK_MPS,
  MAX_SUPPORTED_SPEED_STALL_MULTIPLE,
  ARRIVAL_SINK_THRESHOLD_MPS,
} from '../../src/sim/ground.js'
import { createState, type AircraftState } from '../../src/sim/flight/state.js'
import { v3, length } from '../../src/sim/math/vec3.js'
import { specificEnergyAirmass } from '../../src/sim/invariants.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const DT = 1 / 60
const G = 9.80665

describe('landing gear', () => {
  it('starts up, so no existing flight gains drag it did not have', () => {
    expect(createState().gearFraction).toBe(0)
  })

  it('takes the spec travel time to come down, not one tick', () => {
    let g = 0
    for (let i = 0; i < 60 * f6f.gear.travelSeconds; i++) g = gearAfter(f6f, g, true, DT)
    expect(g).toBeCloseTo(1, 6)
  })

  it('is still on its way down halfway through the travel time', () => {
    let g = 0
    for (let i = 0; i < 30 * f6f.gear.travelSeconds; i++) g = gearAfter(f6f, g, true, DT)
    expect(g).toBeGreaterThan(0.3)
    expect(g).toBeLessThan(0.7)
  })

  it('retracts on the same travel time', () => {
    let g = 1
    for (let i = 0; i < 60 * f6f.gear.travelSeconds; i++) g = gearAfter(f6f, g, false, DT)
    expect(g).toBeCloseTo(0, 6)
  })

  it('never leaves [0, 1], whatever dt it is handed', () => {
    expect(gearAfter(f6f, 0.9, true, 100)).toBe(1)
    expect(gearAfter(f6f, 0.1, false, 100)).toBe(0)
  })

  it('holds position for a non-finite dt rather than poisoning the state', () => {
    // Every other dt consumer in this codebase guards this; a NaN reaching
    // gearFraction would reach drag and from there the integrator.
    expect(gearAfter(f6f, 0.5, true, Number.NaN)).toBe(0.5)
  })
})

describe('gear drag', () => {
  it('is nothing with the gear up', () => {
    expect(gearDragN(f6f, 0, 5000)).toBe(0)
  })

  it('scales with how far the gear has traveled', () => {
    const half = gearDragN(f6f, 0.5, 5000)
    const full = gearDragN(f6f, 1, 5000)
    expect(half).toBeCloseTo(full / 2, 9)
    expect(full).toBeGreaterThan(0)
  })

  it('scales with dynamic pressure, like every other drag term here', () => {
    expect(gearDragN(f6f, 1, 10000)).toBeCloseTo(2 * gearDragN(f6f, 1, 5000), 9)
  })
})

describe('weight on wheels', () => {
  const at = (y: number) => createState({ position: v3(0, y, 0) })

  it('is false well above the ground', () => {
    expect(onGround(at(500), 0)).toBe(false)
  })

  it('is true resting exactly on it', () => {
    expect(onGround(at(0), 0)).toBe(true)
  })

  it('is true within the contact tolerance', () => {
    expect(onGround(at(GROUND_CONTACT_TOLERANCE_M * 0.5), 0)).toBe(true)
  })

  it('is false just outside it', () => {
    expect(onGround(at(GROUND_CONTACT_TOLERANCE_M * 2), 0)).toBe(false)
  })

  it('reads a hilltop as ground, not sea level', () => {
    expect(onGround(at(1000), 1000)).toBe(true)
    expect(onGround(at(1000), 0)).toBe(false)
  })

  it('is false for a non-finite position rather than true', () => {
    // Written as a positive comparison so NaN fails it, the same posture
    // `contactOutcome` takes: a broken state must not be reported as safely
    // on the ground, where the constraint would then act on it.
    expect(onGround(at(Number.NaN), 0)).toBe(false)
  })
})

describe('the ground constraint', () => {
  it('kills the sink rate of an airplane settling onto the surface', () => {
    const s = createState({ position: v3(0, 0.1, 0), velocity: v3(50, -2, 0) })
    const r = restOnSurface(s, 0)
    expect(r.velocity.y).toBe(0)
    expect(r.velocity.x).toBe(50)
  })

  it('places it exactly on the surface', () => {
    expect(restOnSurface(createState({ position: v3(0, 0.1, 0) }), 0).position.y).toBe(0)
  })

  it('NEVER lifts an airplane that is below the surface', () => {
    // Raising it would add g*h and trip assertNoEnergyGain at idle throttle.
    // Below the surface is Plan 10's business, not this function's.
    const below = createState({ position: v3(0, -5, 0), velocity: v3(50, -2, 0) })
    expect(restOnSurface(below, 0).position.y).toBe(-5)
  })

  it('leaves a climbing airplane alone, position included (Finding 3)', () => {
    // On the take-off roll the airplane is within tolerance of the ground while
    // rotating; clamping a positive climb rate to zero would pin it to the
    // runway and it would never fly. Position must be left alone too, or the
    // airplane is held at exactly ground level while vy builds up and then
    // leaves in one fake leap once it crosses GROUND_CONTACT_TOLERANCE_M / DT
    // -- the bug this finding describes.
    const r = restOnSurface(createState({ position: v3(0, 0.1, 0), velocity: v3(60, 3, 0) }), 0)
    expect(r.velocity.y).toBe(3)
    expect(r.position.y).toBe(0.1)
  })

  describe('following rising ground (Finding 2, design doc §2 amendment)', () => {
    it('follows the surface up and slows down when there is enough speed to climb it', () => {
      const dh = 0.1
      const s = createState({ position: v3(0, -dh, 0), velocity: v3(60, 0, 0) })
      const r = restOnSurface(s, 0)
      expect(r.position.y).toBe(0)
      expect(length(r.velocity)).toBeLessThan(length(s.velocity))
      // Exact energy trade: g*dh comes off the specific kinetic energy.
      const speedBefore = length(s.velocity)
      const expectedSpeed = Math.sqrt(speedBefore * speedBefore - 2 * G * dh)
      expect(length(r.velocity)).toBeCloseTo(expectedSpeed, 9)
    })

    it('does not raise total specific energy across that step', () => {
      const dh = 0.15
      const s = createState({ position: v3(0, -dh, 0), velocity: v3(45, 0, 0) })
      const before = specificEnergyAirmass(s)
      const after = specificEnergyAirmass(restOnSurface(s, 0))
      expect(after).toBeLessThanOrEqual(before + 1e-9)
    })

    it('does not push an airplane up a rise it does not have the speed to climb, and does not confiscate its speed either', () => {
      // g*dh at the tolerance's own edge is ~2.45 J/kg, which needs about
      // 2.2 m/s of speed to pay for -- well below a rolling airplane's normal
      // speed but easily above a nearly-stopped one.
      //
      // Regression for fix-wave round 2: an earlier version zeroed velocity
      // in this branch, which -- since restOnSurface runs every tick a
      // buried airplane is here -- confiscated each tick's thrust increment
      // before it could ever accumulate toward g*dh. Measured: buried 1 cm
      // below flat ground at full throttle, speed stayed 0.0000 m/s for
      // 300 s. The state must come back completely unchanged instead, so
      // thrust applied between ticks (outside this function) can keep
      // building speed until there is enough to pay for the climb.
      const dh = GROUND_CONTACT_TOLERANCE_M
      const s = createState({ position: v3(0, -dh, 0), velocity: v3(0.5, 0, 0) })
      const r = restOnSurface(s, 0)
      expect(r).toEqual(s)
    })
  })
})

describe('supported contact (Task 5b)', () => {
  const resting = (extra: Partial<AircraftState> = {}) =>
    createState({ position: v3(0, 0, 0), velocity: v3(0, 0, 0), gearFraction: 1, ...extra })

  it('is supported with the gear down, resting, at no sink rate', () => {
    expect(supportedContact(f6f, resting(), 0)).toBe(true)
  })

  it('is NOT supported with the gear up, all else equal', () => {
    expect(supportedContact(f6f, resting({ gearFraction: 0 }), 0)).toBe(false)
  })

  it('is NOT supported arriving faster than the sink-rate limit', () => {
    const hard = resting({ velocity: v3(0, -MAX_SUPPORTED_SINK_MPS - 1, 0) })
    expect(supportedContact(f6f, hard, 0)).toBe(false)
  })

  it('is NOT supported well above the ground', () => {
    expect(supportedContact(f6f, resting({ position: v3(0, 500, 0) }), 0)).toBe(false)
  })

  it('is NOT supported for a non-finite state, the same posture contactOutcome takes', () => {
    expect(supportedContact(f6f, resting({ position: v3(0, Number.NaN, 0) }), 0)).toBe(false)
  })

  it('is NOT supported for an infinite climb rate (Finding 5)', () => {
    // +Infinity satisfies `velocity.y >= -MAX_SUPPORTED_SINK_MPS` as a bare
    // comparison, which would let a non-finite state read as safely resting.
    expect(supportedContact(f6f, resting({ velocity: v3(0, Number.POSITIVE_INFINITY, 0) }), 0)).toBe(false)
  })

  it('is NOT supported for a fast, meaningfully descending arrival, even with a gentle sink (Finding 4)', () => {
    const capMps = MAX_SUPPORTED_SPEED_STALL_MULTIPLE * f6f.reference.stallSpeedMps
    // Clearly past ARRIVAL_SINK_THRESHOLD_MPS (a "gentle" sink, not the
    // MAX_SUPPORTED_SINK_MPS hard limit), so this is an arrival, not a roll.
    const fast = resting({ velocity: v3(capMps + 10, -0.5, 0) })
    expect(supportedContact(f6f, fast, 0)).toBe(false)
  })

  it('is supported just under the speed cap while descending', () => {
    const capMps = MAX_SUPPORTED_SPEED_STALL_MULTIPLE * f6f.reference.stallSpeedMps
    const underCap = resting({ velocity: v3(capMps - 1, -0.5, 0) })
    expect(supportedContact(f6f, underCap, 0)).toBe(true)
  })

  describe('the speed cap only applies to a genuine arrival (fix-wave round 2, New Important 1)', () => {
    it('stays supported at high speed while rolling level -- a normal take-off roll', () => {
      // Without gating on descending, crossing the speed cap mid-roll on flat
      // ground with vy = 0 read as unsupported and `advance` recorded the
      // airplane destroyed, at 70.13 m/s with nothing wrong.
      const capMps = MAX_SUPPORTED_SPEED_STALL_MULTIPLE * f6f.reference.stallSpeedMps
      const rolling = resting({ velocity: v3(capMps + 50, 0, 0) })
      expect(supportedContact(f6f, rolling, 0)).toBe(true)
    })

    it('stays supported at high speed within the arrival sink threshold (floating-point noise)', () => {
      const capMps = MAX_SUPPORTED_SPEED_STALL_MULTIPLE * f6f.reference.stallSpeedMps
      const noisy = resting({ velocity: v3(capMps + 50, -ARRIVAL_SINK_THRESHOLD_MPS * 0.5, 0) })
      expect(supportedContact(f6f, noisy, 0)).toBe(true)
    })

    it('is NOT supported once past the arrival sink threshold, at the same speed', () => {
      const capMps = MAX_SUPPORTED_SPEED_STALL_MULTIPLE * f6f.reference.stallSpeedMps
      const descending = resting({ velocity: v3(capMps + 50, -ARRIVAL_SINK_THRESHOLD_MPS * 2, 0) })
      expect(supportedContact(f6f, descending, 0)).toBe(false)
    })
  })
})

describe('rolling resistance', () => {
  it('opposes the roll even with the brakes off', () => {
    expect(rollingResistanceN(f6f, 5600, 0)).toBeGreaterThan(0)
  })

  it('grows with braking', () => {
    expect(rollingResistanceN(f6f, 5600, 1)).toBeGreaterThan(rollingResistanceN(f6f, 5600, 0))
  })

  it('scales with weight, because it is a friction coefficient times weight', () => {
    expect(rollingResistanceN(f6f, 11200, 0)).toBeCloseTo(2 * rollingResistanceN(f6f, 5600, 0), 6)
  })

  it('treats a missing or non-finite brake input as brakes off', () => {
    expect(rollingResistanceN(f6f, 5600, undefined)).toBe(rollingResistanceN(f6f, 5600, 0))
    expect(rollingResistanceN(f6f, 5600, Number.NaN)).toBe(rollingResistanceN(f6f, 5600, 0))
  })
})

const airRates = v3(1.2, 0.4, 0.8) // roll, yaw, pitch -- arbitrary nonzero
const rolling = (speed: number) => createState({ position: v3(0, 0, 0), velocity: v3(speed, 0, 0) })
const stick = { pitch: 1, roll: 1, yaw: 1, throttle: 1 }

describe('the ground control regime', () => {
  it('allows NO roll at all, however hard the stick is held', () => {
    // Not reduced -- zero. The gear holds the airframe; the ailerons move and
    // the airplane does not. This is the case that makes an airplane barrel-roll
    // down the runway if it is got wrong.
    expect(groundBodyRates(f6f, rolling(20), stick, airRates).x).toBe(0)
  })

  it('allows no pitch below the speed the tail can be lifted at', () => {
    expect(groundBodyRates(f6f, rolling(1), stick, airRates).z).toBe(0)
  })

  it('allows the full commanded pitch rate once the tail is up', () => {
    const fast = rolling(f6f.gear.tailUpSpeedMps * 1.5)
    expect(groundBodyRates(f6f, fast, stick, airRates).z).toBeCloseTo(airRates.z, 9)
  })

  it('still yaws when stopped, because that is the tailwheel and not the rudder', () => {
    expect(Math.abs(groundBodyRates(f6f, rolling(0), stick, airRates).y)).toBeGreaterThan(0)
  })

  it('yaws the way the pilot asked', () => {
    const right = groundBodyRates(f6f, rolling(5), { ...stick, yaw: 1 }, airRates).y
    const left = groundBodyRates(f6f, rolling(5), { ...stick, yaw: -1 }, airRates).y
    expect(Math.sign(right)).toBe(-Math.sign(left))
  })
})
