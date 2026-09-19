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
  lateralGripAfter,
  effectiveStallSpeedMps,
} from '../../src/sim/ground.js'
import { createState, type AircraftState } from '../../src/sim/flight/state.js'
import { step } from '../../src/sim/flight/model.js'
import type { SimContext } from '../../src/sim/loop.js'
import { createTerrainField, type TerrainField } from '../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../src/sim/world/schema.js'
import { v3, length, ZERO } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import { specificEnergyAirmass } from '../../src/sim/invariants.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const DT = 1 / 60
const G = 9.80665
/** The airplane's body origin sits this far above the wheels' contact point
 *  (Task 15) -- every fixture below that means "resting on the ground" has
 *  to say `groundHeightM + H`, not `groundHeightM`, or it is testing a state
 *  that is `H` metres underground. */
const H = f6f.gear.heightM

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
    expect(onGround(f6f, at(500), 0)).toBe(false)
  })

  it('is true resting exactly on it', () => {
    // "On it" means the wheels, at `groundHeightM + H` -- not `position.y ===
    // groundHeightM`, which is `H` metres of body origin buried underground
    // (Task 15).
    expect(onGround(f6f, at(H), 0)).toBe(true)
  })

  it('is true within the contact tolerance', () => {
    expect(onGround(f6f, at(H + GROUND_CONTACT_TOLERANCE_M * 0.5), 0)).toBe(true)
  })

  it('is false just outside it', () => {
    expect(onGround(f6f, at(H + GROUND_CONTACT_TOLERANCE_M * 2), 0)).toBe(false)
  })

  it('reads a hilltop as ground, not sea level', () => {
    expect(onGround(f6f, at(1000 + H), 1000)).toBe(true)
    expect(onGround(f6f, at(1000 + H), 0)).toBe(false)
  })

  it('is false for a non-finite position rather than true', () => {
    // Written as a positive comparison so NaN fails it, the same posture
    // `contactOutcome` takes: a broken state must not be reported as safely
    // on the ground, where the constraint would then act on it.
    expect(onGround(f6f, at(Number.NaN), 0)).toBe(false)
  })
})

describe('the ground constraint', () => {
  it('kills the sink rate of an airplane settling onto the surface', () => {
    const s = createState({ position: v3(0, H + 0.1, 0), velocity: v3(50, -2, 0) })
    const r = restOnSurface(f6f, s, 0)
    expect(r.velocity.y).toBe(0)
    expect(r.velocity.x).toBe(50)
  })

  it('places it exactly on the surface', () => {
    // "The surface" is the wheels' contact point, `groundHeightM + H`, not
    // `groundHeightM` itself (Task 15).
    expect(restOnSurface(f6f, createState({ position: v3(0, H + 0.1, 0) }), 0).position.y).toBe(H)
  })

  it('NEVER lifts an airplane that is below the surface', () => {
    // Raising it would add g*h and trip assertNoEnergyGain at idle throttle.
    // Below the surface is Plan 10's business, not this function's.
    const below = createState({ position: v3(0, -5, 0), velocity: v3(50, -2, 0) })
    expect(restOnSurface(f6f, below, 0).position.y).toBe(-5)
  })

  it('leaves a climbing airplane alone, position included (Finding 3)', () => {
    // On the take-off roll the airplane is within tolerance of the ground while
    // rotating; clamping a positive climb rate to zero would pin it to the
    // runway and it would never fly. Position must be left alone too, or the
    // airplane is held at exactly ground level while vy builds up and then
    // leaves in one fake leap once it crosses GROUND_CONTACT_TOLERANCE_M / DT
    // -- the bug this finding describes.
    const r = restOnSurface(f6f, createState({ position: v3(0, H + 0.1, 0), velocity: v3(60, 3, 0) }), 0)
    expect(r.velocity.y).toBe(3)
    expect(r.position.y).toBe(H + 0.1)
  })

  describe('following rising ground (Finding 2, design doc §2 amendment)', () => {
    it('follows the surface up and slows down when there is enough speed to climb it', () => {
      const dh = 0.1
      const s = createState({ position: v3(0, H - dh, 0), velocity: v3(60, 0, 0) })
      const r = restOnSurface(f6f, s, 0)
      expect(r.position.y).toBe(H)
      expect(length(r.velocity)).toBeLessThan(length(s.velocity))
      // Exact energy trade: g*dh comes off the specific kinetic energy.
      const speedBefore = length(s.velocity)
      const expectedSpeed = Math.sqrt(speedBefore * speedBefore - 2 * G * dh)
      expect(length(r.velocity)).toBeCloseTo(expectedSpeed, 9)
    })

    it('does not raise total specific energy across that step', () => {
      const dh = 0.15
      const s = createState({ position: v3(0, H - dh, 0), velocity: v3(45, 0, 0) })
      const before = specificEnergyAirmass(s)
      const after = specificEnergyAirmass(restOnSurface(f6f, s, 0))
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
      const s = createState({ position: v3(0, H - dh, 0), velocity: v3(0.5, 0, 0) })
      const r = restOnSurface(f6f, s, 0)
      expect(r).toEqual(s)
    })
  })
})

describe('supported contact (Task 5b)', () => {
  // A LAND height, not `0` (Task 16): `surfaceAt` (src/sim/contact.ts) reads
  // `groundHeightM <= SEA_LEVEL_M` (0) as water, and `supportedContact` now
  // requires land -- so `0` here would make every "supported" case in this
  // block false for the wrong reason (water, not whatever the test is
  // actually isolating). `LAND_M` is comfortably above sea level and
  // otherwise arbitrary.
  const LAND_M = 1
  // Position `LAND_M + H`, not `H` (Task 15): the body origin of an airplane
  // actually resting on the ground sits `H` metres above the ground itself
  // (`LAND_M` here), not above sea level.
  const resting = (extra: Partial<AircraftState> = {}) =>
    createState({ position: v3(0, LAND_M + H, 0), velocity: v3(0, 0, 0), gearFraction: 1, ...extra })

  it('is supported with the gear down, resting, at no sink rate', () => {
    expect(supportedContact(f6f, resting(), LAND_M)).toBe(true)
  })

  it('is NOT supported with the gear up, all else equal', () => {
    expect(supportedContact(f6f, resting({ gearFraction: 0 }), LAND_M)).toBe(false)
  })

  it('is NOT supported arriving faster than the sink-rate limit', () => {
    const hard = resting({ velocity: v3(0, -MAX_SUPPORTED_SINK_MPS - 1, 0) })
    expect(supportedContact(f6f, hard, LAND_M)).toBe(false)
  })

  it('is NOT supported well above the ground', () => {
    expect(supportedContact(f6f, resting({ position: v3(0, 500, 0) }), LAND_M)).toBe(false)
  })

  it('is NOT supported for a non-finite state, the same posture contactOutcome takes', () => {
    expect(supportedContact(f6f, resting({ position: v3(0, Number.NaN, 0) }), LAND_M)).toBe(false)
  })

  it('is NOT supported for an infinite climb rate (Finding 5)', () => {
    // +Infinity satisfies `velocity.y >= -MAX_SUPPORTED_SINK_MPS` as a bare
    // comparison, which would let a non-finite state read as safely resting.
    expect(supportedContact(f6f, resting({ velocity: v3(0, Number.POSITIVE_INFINITY, 0) }), LAND_M)).toBe(false)
  })

  it('is NOT supported for a fast, meaningfully descending arrival, even with a gentle sink (Finding 4)', () => {
    const capMps = MAX_SUPPORTED_SPEED_STALL_MULTIPLE * f6f.reference.stallSpeedMps
    // Clearly past ARRIVAL_SINK_THRESHOLD_MPS (a "gentle" sink, not the
    // MAX_SUPPORTED_SINK_MPS hard limit), so this is an arrival, not a roll.
    const fast = resting({ velocity: v3(capMps + 10, -0.5, 0) })
    expect(supportedContact(f6f, fast, LAND_M)).toBe(false)
  })

  it('is supported just under the speed cap while descending', () => {
    const capMps = MAX_SUPPORTED_SPEED_STALL_MULTIPLE * f6f.reference.stallSpeedMps
    const underCap = resting({ velocity: v3(capMps - 1, -0.5, 0) })
    expect(supportedContact(f6f, underCap, LAND_M)).toBe(true)
  })

  describe('the speed cap only applies to a genuine arrival (fix-wave round 2, New Important 1)', () => {
    it('stays supported at high speed while rolling level -- a normal take-off roll', () => {
      // Without gating on descending, crossing the speed cap mid-roll on flat
      // ground with vy = 0 read as unsupported and `advance` recorded the
      // airplane destroyed, at 70.13 m/s with nothing wrong.
      const capMps = MAX_SUPPORTED_SPEED_STALL_MULTIPLE * f6f.reference.stallSpeedMps
      const rolling = resting({ velocity: v3(capMps + 50, 0, 0) })
      expect(supportedContact(f6f, rolling, LAND_M)).toBe(true)
    })

    it('stays supported at high speed within the arrival sink threshold (floating-point noise)', () => {
      const capMps = MAX_SUPPORTED_SPEED_STALL_MULTIPLE * f6f.reference.stallSpeedMps
      const noisy = resting({ velocity: v3(capMps + 50, -ARRIVAL_SINK_THRESHOLD_MPS * 0.5, 0) })
      expect(supportedContact(f6f, noisy, LAND_M)).toBe(true)
    })

    it('is NOT supported once past the arrival sink threshold, at the same speed', () => {
      const capMps = MAX_SUPPORTED_SPEED_STALL_MULTIPLE * f6f.reference.stallSpeedMps
      const descending = resting({ velocity: v3(capMps + 50, -ARRIVAL_SINK_THRESHOLD_MPS * 2, 0) })
      expect(supportedContact(f6f, descending, LAND_M)).toBe(false)
    })
  })

  describe('requires land (Task 16, Mark drove off the runway onto the ocean)', () => {
    it('is NOT supported resting gently at sea level, all else identical to the supported case above', () => {
      // Every other gate here is about the AIRPLANE (gear, sink, speed), not
      // what it is standing on -- before this fix, a gear-down airplane
      // resting gently at or below SEA_LEVEL_M satisfied all of them.
      const atSea = createState({ position: v3(0, H, 0), velocity: v3(0, 0, 0), gearFraction: 1 })
      expect(supportedContact(f6f, atSea, 0)).toBe(false)
    })

    it('is NOT supported for any groundHeightM at or below SEA_LEVEL_M, however gently it arrives', () => {
      const belowSea = createState({ position: v3(0, -5 + H, 0), velocity: v3(0, 0, 0), gearFraction: 1 })
      expect(supportedContact(f6f, belowSea, -5)).toBe(false)
    })

    it('is supported the instant groundHeightM crosses above sea level, all else equal (boundary check)', () => {
      const justAboveSea = resting()
      expect(supportedContact(f6f, justAboveSea, LAND_M)).toBe(true)
      // And confirm the boundary is exactly `surfaceAt`'s own: exactly at
      // SEA_LEVEL_M is still water, not land.
      const atSeaLevelExactly = createState({ position: v3(0, H, 0), velocity: v3(0, 0, 0), gearFraction: 1 })
      expect(supportedContact(f6f, atSeaLevelExactly, 0)).toBe(false)
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

  it('treats a non-finite ground speed as tail-down, not tail-up (fix round 1, Minor 3)', () => {
    // +Infinity satisfies `groundSpeed >= tailUpSpeedMps` as a bare
    // comparison, which would buy full pitch authority for a broken state --
    // the least conservative of the two outcomes.
    const infiniteSpeed = createState({ position: v3(0, 0, 0), velocity: v3(Number.POSITIVE_INFINITY, 0, 0) })
    expect(groundBodyRates(f6f, infiniteSpeed, stick, airRates).z).toBe(0)
    const nanSpeed = createState({ position: v3(0, 0, 0), velocity: v3(Number.NaN, 0, 0) })
    expect(groundBodyRates(f6f, nanSpeed, stick, airRates).z).toBe(0)
  })

  describe('yaw: tailwheel and rudder, blended by speed (fix round 1, Important 1)', () => {
    // Isolate the tailwheel term from the arbitrary shared `airRates` fixture
    // by zeroing its yaw component -- these tests are about the tailwheel
    // specifically, not the sum.
    const noRudder = v3(airRates.x, 0, airRates.z)

    it('still yaws when stopped, because that is the tailwheel and not the rudder', () => {
      expect(Math.abs(groundBodyRates(f6f, rolling(0), stick, noRudder).y)).toBeGreaterThan(0)
    })

    it('yaws the way the pilot asked', () => {
      const right = groundBodyRates(f6f, rolling(5), { ...stick, yaw: 1 }, noRudder).y
      const left = groundBodyRates(f6f, rolling(5), { ...stick, yaw: -1 }, noRudder).y
      expect(Math.sign(right)).toBe(-Math.sign(left))
    })

    it('is at full authority at rest, summed with whatever the rudder/weathercock term already commands', () => {
      const tailUp = f6f.gear.tailwheelYawRateDegPerSec * (Math.PI / 180)
      // yaw: 1 negates, matching `ratesFromDynamicPressure`'s own convention.
      const expected = -tailUp + airRates.y
      expect(groundBodyRates(f6f, rolling(0), stick, airRates).y).toBeCloseTo(expected, 9)
    })

    it('fades to zero at tailUpSpeedMps, leaving only the rudder/weathercock term', () => {
      const atTailUp = rolling(f6f.gear.tailUpSpeedMps)
      expect(groundBodyRates(f6f, atTailUp, stick, airRates).y).toBeCloseTo(airRates.y, 9)
    })

    it('is continuous across the speed the tail lifts -- not the order-of-magnitude jump a switched (not summed) term produced', () => {
      const justBelow = groundBodyRates(f6f, rolling(f6f.gear.tailUpSpeedMps - 0.01), stick, airRates).y
      const justAbove = groundBodyRates(f6f, rolling(f6f.gear.tailUpSpeedMps + 0.01), stick, airRates).y
      // The fade itself moves only a hair over this tiny speed step; this
      // bound is far tighter than the 10x jump fix round 1 measured (20.00
      // deg/s on the runway to 1.95 deg/s the next tick) and still comfortably
      // clears floating-point noise.
      expect(Math.abs(justAbove - justBelow)).toBeLessThan(0.01)
    })

    it('treats a non-finite ground speed as full tailwheel authority, not zero (fix round 1, Minor 3)', () => {
      // Symmetric with the pitch guard above: a broken state stays pinned to
      // the tail-down case on every axis, never granted new authority.
      const infiniteSpeed = createState({ position: v3(0, 0, 0), velocity: v3(Number.POSITIVE_INFINITY, 0, 0) })
      const tailUp = f6f.gear.tailwheelYawRateDegPerSec * (Math.PI / 180)
      expect(groundBodyRates(f6f, infiniteSpeed, stick, noRudder).y).toBeCloseTo(-tailUp, 9)
    })
  })
})

describe('step(): ground consumers are gated on the gear being down (fix round 1, Important 2)', () => {
  // A flat field at sea level, the same shape `tests/sim/terrainContact.test.ts`
  // builds its plateau with -- only flat here because the point is gear
  // gating, not terrain following.
  const header = parseTerrainHeader({
    centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000,
    finestSamples: 8193, levels: 13, encoding: 'int16-decimetres',
  })
  // `.fill(10)`, not `.fill(0)` (Task 16): decimetre encoding, so this is a
  // flat 1.0 m field -- LAND. `supportedContact` (and, as of Task 16, rolling
  // resistance and the ground control regime too) now requires land, and
  // `SEA_LEVEL_M` (0) reads as water, which would make every gear-down test
  // below fail for a reason unrelated to what it is actually testing.
  const LAND_M = 1
  const flat = createTerrainField(header, 12, new Int16Array(9).fill(LAND_M * 10))
  const ctx = (terrain: TerrainField | null, tick = 0): SimContext => ({ dt: DT, tick, terrain })

  it('does not steer with a retracted tailwheel or charge rolling friction to a belly', () => {
    // Design §3: the gear-down requirement belongs to these two consumers, not
    // to `onGround` itself. With the gear fully retracted, the WHEEL-dependent
    // branches of `step` must all be no-ops: the ground reaction force and
    // `restOnSurface` are gated on `supportedContact` (which requires
    // `GEAR_DOWN_FRACTION`), and rolling friction and the ground rate regime
    // are too.
    //
    // **This used to assert whole-state identity against a null terrain, and
    // Plan 11b made that claim false for a good reason.** Ground effect is a
    // terrain-dependent branch that is deliberately GEAR-AGNOSTIC -- it is
    // about the wing's proximity to the surface, and a belly-landing airplane
    // gets it just as much as one on its wheels. So the two mechanisms are now
    // asserted separately: no steering here, and identity only out of ground
    // effect below, where the original claim still holds exactly.
    const rollingGearUp = createState({ position: v3(0, LAND_M + 0.5, 0), velocity: v3(20, 0, 0), gearFraction: 0 })
    const controls = { pitch: 0, roll: 0, yaw: 1, throttle: 0, brake: 1 }
    const withTerrain = step(f6f, rollingGearUp, controls, ctx(flat))
    const withoutTerrain = step(f6f, rollingGearUp, controls, ctx(null))
    // Steering is rate-commanded, so the tailwheel not being down shows up
    // here -- and ground effect cannot touch it, because it only scales drag.
    expect(withTerrain.bodyRates).toEqual(withoutTerrain.bodyRates)
    expect(withTerrain.attitude).toEqual(withoutTerrain.attitude)
  })

  it('applies ground effect to a gear-up airplane, because it is about the wing not the wheels', () => {
    // The exception the test above documents, asserted rather than implied.
    const lowGearUp = createState({ position: v3(0, LAND_M + 0.5, 0), velocity: v3(60, 0, 0), gearFraction: 0 })
    const controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: 0 }
    const low = step(f6f, lowGearUp, controls, ctx(flat))
    const noTerrain = step(f6f, lowGearUp, controls, ctx(null))
    // Less induced drag near the surface means it decelerates LESS.
    expect(low.velocity.x).toBeGreaterThan(noTerrain.velocity.x)
  })

  it('steps indistinguishably from no terrain once the wing is clear of ground effect', () => {
    // **Not exact equality, and the reason is worth knowing**: McCormick's
    // phi approaches 1 only asymptotically -- at 40 wingspans it is 0.9999976,
    // never 1 -- so a step with any terrain present can never be bit-identical
    // to one without. What can be asserted is that the difference is far below
    // anything that could matter, which bounds the exception the two tests
    // above document rather than leaving it open-ended.
    const highGearUp = createState({
      position: v3(0, LAND_M + 40 * f6f.geometry.wingSpanM, 0),
      velocity: v3(60, 0, 0),
      gearFraction: 0,
    })
    const controls = { pitch: 0, roll: 0, yaw: 1, throttle: 0, brake: 1 }
    const withTerrain = step(f6f, highGearUp, controls, ctx(flat))
    const withoutTerrain = step(f6f, highGearUp, controls, ctx(null))
    expect(withTerrain.bodyRates).toEqual(withoutTerrain.bodyRates)
    expect(withTerrain.velocity.x - withoutTerrain.velocity.x).toBeLessThan(1e-6)
    expect(withTerrain.position.y - withoutTerrain.position.y).toBeLessThan(1e-6)
  })

  it('does steer and does drag once the gear is down, for contrast', () => {
    // Position `LAND_M + H`, not `H` (Task 15/16): with the gear down this
    // airplane has to actually be resting on `flat`'s ground (height
    // `LAND_M`, and land, not water) for the terrain-dependent branches to
    // fire at all.
    const rollingGearDown = createState({ position: v3(0, LAND_M + H, 0), velocity: v3(20, 0, 0), gearFraction: 1 })
    const controls = { pitch: 0, roll: 0, yaw: 1, throttle: 0, brake: 1 }
    const withTerrain = step(f6f, rollingGearDown, controls, ctx(flat))
    const withoutTerrain = step(f6f, rollingGearDown, controls, ctx(null))
    expect(withTerrain).not.toEqual(withoutTerrain)
  })

  it('brings a braking ground roll to rest without buzzing across zero (fix round 1, Minor 4)', () => {
    // Regression for the unclamped-force bug: braking from 5 m/s and
    // holding, an earlier revision had `vx` oscillate between -0.0353 and
    // +0.0300 m/s forever instead of settling, because the resistance force
    // below `resistanceN * dt / m` overshot zero and reversed the track
    // every tick.
    // Position `LAND_M + H`, not `H` (Task 15/16) -- same reason as the test
    // above: this has to start resting on `flat`'s (land) ground for rolling
    // resistance to apply at all.
    let s = createState({ position: v3(0, LAND_M + H, 0), velocity: v3(5, 0, 0), gearFraction: 1 })
    const controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: 1 }
    for (let i = 0; i < 300; i++) s = step(f6f, s, controls, ctx(flat, i))
    expect(Math.abs(s.velocity.x)).toBeLessThan(0.01)
    const settledVx = s.velocity.x
    s = step(f6f, s, controls, ctx(flat, 300))
    // Settled, not buzzing to the opposite sign every tick.
    expect(Math.abs(s.velocity.x - settledVx)).toBeLessThan(0.01)
  })
})

/**
 * The wheels resist going sideways.
 *
 * 11a measured a taxi turn reaching **113.6 degrees of sideslip** because
 * nothing made the airplane travel where its wheels pointed, and its handoff
 * rejected the cheap fix and said why: restoring the fin's weathercock term
 * models the wrong SIGN of the right effect, since a real taildragger is
 * directionally unstable on the ground and the term would fight the tailwheel.
 *
 * A first-order DECAY rather than outright removal. Removing the sideways
 * component would put the airplane on rails and make a ground loop
 * impossible -- and a ground loop is the characteristic taildragger hazard,
 * not an edge case.
 */
describe('lateral tire grip', () => {
  /** Nose pointing +z (north), which is the Tacloban strip's axis. */
  const rollingNorth = qFromAxisAngle(v3(0, 1, 0), -Math.PI / 2)

  it('leaves a roll straight down the wheels alone', () => {
    const s = createState({ velocity: v3(0, 0, 40), attitude: rollingNorth })
    const after = lateralGripAfter(f6f, s, DT)
    expect(after.z).toBeCloseTo(40, 9)
    expect(after.x).toBeCloseTo(0, 9)
  })

  it('bleeds a sideways component away on the specified time constant', () => {
    const s = createState({ velocity: v3(10, 0, 40), attitude: rollingNorth })
    let v = s.velocity
    for (let i = 0; i < 60 * f6f.gear.lateralGripSeconds; i++) {
      v = lateralGripAfter(f6f, { ...s, velocity: v }, DT)
    }
    // One time constant: about 1/e of the sideways speed is left.
    expect(v.x).toBeCloseTo(10 / Math.E, 1)
    // The along-track component is untouched by it.
    expect(v.z).toBeCloseTo(40, 6)
  })

  it('never gains speed, which is what keeps the energy invariant structurally true', () => {
    for (const vel of [v3(10, 0, 40), v3(-30, 0, 5), v3(0, -3, 0), v3(25, 2, -25), v3(40, 0, 0)]) {
      const s = createState({ velocity: vel, attitude: rollingNorth })
      expect(length(lateralGripAfter(f6f, s, DT))).toBeLessThanOrEqual(length(vel) + 1e-9)
    }
  })

  it('leaves the vertical component completely alone', () => {
    // It is a TIRE force. Sink and climb are the ground constraint's business.
    const s = createState({ velocity: v3(10, -2.5, 40), attitude: rollingNorth })
    expect(lateralGripAfter(f6f, s, DT).y).toBe(-2.5)
  })

  it('still permits a ground loop rather than putting the airplane on rails', () => {
    // A rail would zero the sideways component in one step. After a single
    // tick most of a big skid must survive, or a mishandled touchdown cannot
    // swap ends and the characteristic taildragger hazard stops existing.
    const s = createState({ velocity: v3(30, 0, 30), attitude: rollingNorth })
    expect(lateralGripAfter(f6f, s, DT).x).toBeGreaterThan(30 * 0.9)
  })

  it('holds the velocity unchanged for a non-finite step or a vertical nose', () => {
    const s = createState({ velocity: v3(10, 0, 40), attitude: rollingNorth })
    expect(lateralGripAfter(f6f, s, Number.NaN)).toEqual(s.velocity)
    expect(lateralGripAfter(f6f, s, 0)).toEqual(s.velocity)
    // Nose straight up: no rolling direction exists to resolve against, so the
    // honest answer is to change nothing rather than to pick an axis.
    const noseUp = createState({ velocity: v3(10, 0, 40), attitude: qFromAxisAngle(v3(0, 0, 1), Math.PI / 2) })
    expect(lateralGripAfter(f6f, noseUp, DT)).toEqual(noseUp.velocity)
  })
})

/**
 * The speed cap in `supportedContact` is a MULTIPLE of the stall speed, and
 * Plan 11b lowered the effective stall speed 34.5% with the flaps out. **A
 * constant expressed as a multiple of a number this plan changed has already
 * changed**, whether or not anyone edited it -- so which stall speed it
 * multiplies has to be decided rather than inherited.
 *
 * It now multiplies the CONFIGURATION'S stall speed, interpolated between the
 * two sourced figures. Both come from the same Patuxent table, so this is not
 * an invented number: it is the one the airplane actually stalls at in the
 * configuration it is in.
 */
describe('effectiveStallSpeedMps', () => {
  it('is the clean figure with the flaps up and the landing figure with them down', () => {
    expect(effectiveStallSpeedMps(f6f, 0)).toBeCloseTo(f6f.reference.stallSpeedMps, 9)
    expect(effectiveStallSpeedMps(f6f, 1)).toBeCloseTo(f6f.reference.stallSpeedFlapMps, 9)
  })

  it('interpolates across the travel, because the flaps spend seconds in between', () => {
    const half = effectiveStallSpeedMps(f6f, 0.5)
    expect(half).toBeLessThan(f6f.reference.stallSpeedMps)
    expect(half).toBeGreaterThan(f6f.reference.stallSpeedFlapMps)
  })

  it('reads a non-finite fraction as clean, matching the rest of the model', () => {
    // `flapClIncrement` already treats a NaN fraction as retracted, so this
    // agrees with it rather than inventing a second reading of "unknown". The
    // whole model saying the same thing about a broken flap fraction matters
    // more here than which end is nominally safer.
    expect(effectiveStallSpeedMps(f6f, Number.NaN)).toBeCloseTo(f6f.reference.stallSpeedMps, 9)
  })
})

describe('the landing gates, tuned against a flown approach (Plan 11b Task 11)', () => {
  const H = f6f.gear.heightM
  const arriving = (sinkMps: number, speedMps: number, flapFraction = 1) =>
    createState({
      position: v3(0, 10 + H, 0),
      velocity: v3(0, -sinkMps, speedMps),
      attitude: qFromAxisAngle(v3(0, 1, 0), -Math.PI / 2),
      gearFraction: 1,
      flapFraction,
    })

  it('accepts the arrival a flown approach actually produces', () => {
    // 1.47 m/s at 38.4 m/s, measured in tests/sim/landing.test.ts. A gate that
    // rejected a competently flown approach would be the defect.
    expect(supportedContact(f6f, arriving(1.47, 38.4), 10)).toBe(true)
  })

  it('still rejects an arrival nobody would call a landing', () => {
    // A gate that accepts everything is worse than no gate, for the reason 11a
    // recorded when its soak assertions shipped covering zero ticks.
    expect(supportedContact(f6f, arriving(25, 38.4), 10)).toBe(false)
  })

  it('scales the speed cap to the FLAPPED stall when the flaps are out', () => {
    // With flaps the airplane stalls at 37.77 m/s, so the cap is 1.6 * that =
    // 60.4 m/s; clean it is 1.6 * 43.81 = 70.1. A descending arrival BETWEEN
    // those two is the one case that distinguishes the two readings, and it
    // has to come out differently in the two configurations or the change did
    // nothing.
    const flappedCap = MAX_SUPPORTED_SPEED_STALL_MULTIPLE * f6f.reference.stallSpeedFlapMps
    const cleanCap = MAX_SUPPORTED_SPEED_STALL_MULTIPLE * f6f.reference.stallSpeedMps
    const between = (flappedCap + cleanCap) / 2
    expect(between).toBeGreaterThan(flappedCap)
    expect(between).toBeLessThan(cleanCap)
    // Flaps out: above the configuration's cap, so this is an arrival too fast
    // to be a landing.
    expect(supportedContact(f6f, arriving(1.5, between, 1), 10)).toBe(false)
    // Clean: inside it, because a clean wing genuinely needs more speed to fly.
    expect(supportedContact(f6f, arriving(1.5, between, 0), 10)).toBe(true)
  })
})

describe("Mark's 120 mph touchdown limit (2026-09-17)", () => {
  const MPH = 0.44704
  const H = f6f.gear.heightM
  const arrivingAt = (mph: number) =>
    createState({
      position: v3(0, 10 + H, 0),
      velocity: v3(0, -1.5, mph * MPH),
      attitude: qFromAxisAngle(v3(0, 1, 0), -Math.PI / 2),
      gearFraction: 1,
      flapFraction: 1,
    })

  it('accepts a touchdown just under 120 mph and rejects one just over, with the flaps out', () => {
    // Mark's requirement, stated as a speed. It is stored as a multiple of the
    // stall speed so the rule generalises to other aircraft, which means this
    // test is what pins it to the figure he actually asked for.
    expect(supportedContact(f6f, arrivingAt(119), 10)).toBe(true)
    expect(supportedContact(f6f, arrivingAt(121), 10)).toBe(false)
  })

  it('leaves a flown approach well inside it', () => {
    // 85.9 mph, measured in tests/sim/landing.test.ts.
    expect(supportedContact(f6f, arrivingAt(85.9), 10)).toBe(true)
  })
})

describe('a moving surface (Plan 8)', () => {
  const DECK_M = 17
  const shipV = v3(7.717, 0, 0)
  const parkedOnDeck = createState({ position: v3(0, DECK_M + H, 0), velocity: shipV, gearFraction: 1 })

  it('supportedContact judges sink and speed RELATIVE to the surface and accepts a deck', () => {
    expect(supportedContact(f6f, parkedOnDeck, DECK_M, 'deck', shipV)).toBe(true)
    // The same airplane judged against a still surface is moving at 7.7 m/s but still supported (below every gate).
    expect(supportedContact(f6f, parkedOnDeck, DECK_M, 'land')).toBe(true)
    // Water is never a supported contact, deck or not.
    expect(supportedContact(f6f, parkedOnDeck, DECK_M, 'water', shipV)).toBe(false)
    // A deck arrival at exactly the ship's speed plus 1.5 x stall is too fast; at the ship's speed plus 1.3 x stall it is not.
    const stall = effectiveStallSpeedMps(f6f, 0)
    const fast = createState({ position: v3(0, DECK_M + H, 0), velocity: v3(7.717 + 1.5 * stall, -1, 0), gearFraction: 1 })
    const ok = createState({ position: v3(0, DECK_M + H, 0), velocity: v3(7.717 + 1.3 * stall, -1, 0), gearFraction: 1 })
    expect(supportedContact(f6f, fast, DECK_M, 'deck', shipV)).toBe(false)
    expect(supportedContact(f6f, ok, DECK_M, 'deck', shipV)).toBe(true)
  })

  it('restOnSurface stops the sink but keeps the surface velocity: a parked airplane sails with the ship', () => {
    // `+ 0.1` (above the resting height), not `- 0.1`: the brief's fixture used
    // `- 0.1`, which is BELOW the resting height and lands in restOnSurface's
    // rising-ground/climb-cost branch, needing ~1.4 m/s of relative speed to
    // pay for a 0.1 m climb (sqrt(2 * 9.80665 * 0.1)) -- more than this
    // fixture's 0.5 m/s sink supplies, so it would correctly return the state
    // unchanged rather than clamped. `+ 0.1` matches the sibling pre-Plan-8
    // test ("kills the sink rate...", above) and lands in the "sinking or
    // level" branch, which needs no energy payment -- the branch this test's
    // own title and expected output actually describe.
    const sinking = createState({ position: v3(0, DECK_M + H + 0.1, 0), velocity: v3(7.717, -0.5, 0), gearFraction: 1 })
    const rested = restOnSurface(f6f, sinking, DECK_M, shipV)
    expect(rested.position.y).toBe(DECK_M + H)
    expect(rested.velocity).toEqual(v3(7.717, 0, 0))
  })

  it('the zero-velocity default is the old function exactly', () => {
    const s = createState({ position: v3(0, 1 + H - 0.1, 0), velocity: v3(30, -0.5, 0), gearFraction: 1 })
    expect(restOnSurface(f6f, s, 1, ZERO)).toEqual(restOnSurface(f6f, s, 1))
    expect(lateralGripAfter(f6f, s, DT, ZERO)).toEqual(lateralGripAfter(f6f, s, DT))
    expect(groundBodyRates(f6f, s, { pitch: 0, roll: 0, yaw: 0.5, throttle: 0 }, v3(0, 0, 0), ZERO))
      .toEqual(groundBodyRates(f6f, s, { pitch: 0, roll: 0, yaw: 0.5, throttle: 0 }, v3(0, 0, 0)))
  })

  it('tire grip damps the velocity ACROSS the nose relative to the deck, not relative to the world', () => {
    // Nose north, ship moving east at 7.7: relative to the deck the airplane is still, so grip changes nothing.
    const still = createState({ position: v3(0, DECK_M + H, 0), velocity: shipV, attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2), gearFraction: 1 })
    expect(lateralGripAfter(f6f, still, DT, shipV)).toEqual(shipV)
  })
})
