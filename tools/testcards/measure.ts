import { v3 } from '../../src/sim/math/vec3.js'
import { qIdentity } from '../../src/sim/math/quat.js'
import {
  createState,
  airspeed,
  isStalled,
  DT,
  type AircraftState,
  type Controls,
} from '../../src/sim/flight/model.js'
import { stepChecked } from '../../src/sim/invariants.js'
import { holdPitchAngle, holdLevelFlight, bankAngleRad } from '../../src/sim/autopilot.js'
import type { AircraftSpec } from '../../src/sim/flight/schema.js'

const DEG = Math.PI / 180

/**
 * Disposable load that puts the aeroplane on the scales at exactly
 * `reference.testMassKg`.
 *
 * Ruling R31: every figure in the reference block was measured at one stated
 * gross weight, so a harness that spawns at any other weight is not measuring
 * the same aeroplane. `step()` computes mass as `mass.emptyKg + state.fuelKg`
 * and has no separate payload term, so `fuelKg` has to carry the pilot, oil,
 * ammunition and pylon as well as the fuel -- it is over `mass.fuelCapacityKg`
 * on purpose and is not a fuel state any mission would start from.
 */
function disposableLoadKg(spec: AircraftSpec): number {
  const kg = spec.reference.testMassKg - spec.mass.emptyKg
  if (!(kg > 0)) {
    throw new Error(
      `reference.testMassKg (${spec.reference.testMassKg} kg) is not above mass.emptyKg ` +
        `(${spec.mass.emptyKg} kg) for "${spec.id}": there is no loading that reaches the trial weight`,
    )
  }
  return kg
}

const spawn = (spec: AircraftSpec, altitudeM: number, speedMps: number): AircraftState =>
  createState({
    position: v3(0, altitudeM, 0),
    velocity: v3(speedMps, 0, 0),
    attitude: qIdentity(),
    fuelKg: disposableLoadKg(spec),
  })

/** Hold the weight at the trial weight. The reference figures are all quoted at
 *  one weight, so the measurement is taken at one weight. Measured 2026-09-12
 *  at propEfficiency 0.75, testMassKg 5633.62: a variant of the top-speed card
 *  with this pin removed left the aeroplane to burn fuel freely, and it took
 *  436 s (not the shipped card's 421 s -- burning fuel changes qRef as it goes,
 *  so the mass-drifting variant converges on a different schedule) to lose
 *  36.6 kg, 0.65% of gross weight, worth 0.11 m/s on the reading (172.56 m/s
 *  drifting, 172.46 m/s held). Small, but it is free to remove and it would
 *  not stay small for a longer card. */
const holdMass = (spec: AircraftSpec, s: AircraftState): AircraftState =>
  s.fuelKg === disposableLoadKg(spec) ? s : { ...s, fuelKg: disposableLoadKg(spec) }

/**
 * Hold weight and altitude, for the climb card only.
 *
 * Pinning `position.y` while leaving `velocity` untouched is sound for a climb
 * and unsound for level flight, which is why only the climb card does it.
 * Position enters the physics solely through density and the engine's power
 * curve, so pinning it fixes the altitude the measurement is *about*; and the
 * energy it deletes each step is exactly the potential energy a steady climb is
 * depositing, so the along-path balance T - D - W sin(gamma) = 0 that sets the
 * climb rate is untouched. Both halves of that are measured, not asserted --
 * all figures below measured 2026-09-12 at propEfficiency 0.75, testMassKg
 * 5633.62, and will need re-checking against any change to either:
 *
 *  - Climb, pinned vs free. At the best-rate attitude (24 degrees) the pinned
 *    mean vertical velocity is 15.775 m/s and letting the same settled state
 *    climb freely for 10 s gives 15.731 m/s, a 0.28% difference.
 *  - Level flight, pinned vs regulated. The top-speed card reads 172.46 m/s
 *    regulating the flight path and 182.34 m/s pinning the altitude under a
 *    pitch-attitude-level hold -- 5.7% fabricated, because with the attitude
 *    level and lift a little short of weight the aeroplane settles into a
 *    permanent shallow descent whose altitude loss is being handed back.
 */
const holdMassAndAltitude = (
  spec: AircraftSpec,
  s: AircraftState,
  altitudeM: number,
): AircraftState => ({
  ...s,
  position: v3(s.position.x, altitudeM, s.position.z),
  fuelKg: disposableLoadKg(spec),
})

/** Airspeed gain over the last second, m/s, below which the run is called
 *  converged. Acceleration decays exponentially toward the asymptote, so this
 *  always stops short, and how short is worth knowing rather than guessing:
 *  measured 2026-09-12 at propEfficiency 0.75, testMassKg 5633.62, 0.01 stops
 *  at 171.93 m/s after 284 s, 0.001 at 172.46 m/s after 421 s, and 0.0001 at
 *  172.51 m/s after 557 s. 0.01 would cost 0.34% of the figure -- a quarter of
 *  the model's whole error on this card -- purely as measurement slack, so
 *  this is the tighter cutoff, which lands 0.05 m/s off the asymptote. */
const TOP_SPEED_SETTLED_MPS = 0.001

/**
 * Full throttle, flight path held level at `altitudeM`, run until airspeed
 * stops rising. Returns true airspeed in m/s.
 */
const TOP_SPEED_MAX_S = 900

export function measureTopSpeed(spec: AircraftSpec, altitudeM: number): number {
  let s = spawn(spec, altitudeM, spec.rates.rateRefSpeedMps)
  let prev = 0
  for (let i = 0; i < 60 * TOP_SPEED_MAX_S; i++) {
    s = holdMass(spec, stepChecked(spec, s, holdLevelFlight(spec, s, 1, altitudeM), DT))
    if (i % 60 === 0) {
      const v = airspeed(s)
      if (i > 600 && Math.abs(v - prev) < TOP_SPEED_SETTLED_MPS) return v
      prev = v
    }
  }
  // Important 2: a harness whose job is trustworthy measurement must not
  // answer a run that never converged with a plausible-looking number.
  throw new Error(
    `measureTopSpeed for "${spec.id}" at altitude ${altitudeM} m did not converge within ` +
      `${TOP_SPEED_MAX_S} s of simulated time (airspeed still ${airspeed(s).toFixed(3)} m/s, ` +
      `last 1 s reading ${prev.toFixed(3)} m/s)`,
  )
}

/** Pitch attitudes swept for best rate of climb, degrees. The best-rate
 *  attitude is the climb angle PLUS the angle of attack that trims at climb
 *  speed, so the sweep has to run well past any plausible flight-path angle:
 *  measured 2026-09-12 at propEfficiency 0.75, testMassKg 5633.62, the F6F
 *  card peaks at 24 degrees of attitude, which is 15.8 m/s of climb at 58 m/s
 *  -- a flight-path angle of only 15.8 degrees. Past 32 degrees the aeroplane
 *  departs and reads about -45 m/s, which is harmless because the sweep takes
 *  the maximum, but it is why the sweep does not simply run to 90. */
const CLIMB_SWEEP_MAX_DEG = 40
const CLIMB_SWEEP_STEP_DEG = 2
/** Long enough for airspeed to settle at the commanded attitude: the aeroplane
 *  is spawned at the rate-reference speed and has to decelerate ~45 m/s at well
 *  under 1 m/s^2. */
const CLIMB_SETTLE_S = 120
/** Window over which the settled climb rate is averaged, seconds -- shorter
 *  than the brief's 10 s, and that is a measured choice rather than an
 *  unexplained shortcut: by the time `CLIMB_SETTLE_S` has run, `velocity.y`
 *  has already stopped moving, so a longer sample window buys precision the
 *  settled state does not need. Measured 2026-09-12 at propEfficiency 0.75,
 *  testMassKg 5633.62, at the best-rate (24-degree) attitude: a 1 s window
 *  reads 15.775237 m/s and a 10 s window reads 15.775141 m/s -- a 0.0006%
 *  difference, an order of magnitude below anything this card's tolerance
 *  could resolve. */
const CLIMB_SAMPLE_S = 1

/**
 * Full throttle, best rate of climb approximated by sweeping the commanded
 * pitch attitude and taking the best settled climb rate. Returns m/s.
 */
export function measureClimbRate(spec: AircraftSpec, altitudeM: number): number {
  let best = -Infinity
  for (let angleDeg = 0; angleDeg <= CLIMB_SWEEP_MAX_DEG; angleDeg += CLIMB_SWEEP_STEP_DEG) {
    const angle = angleDeg * DEG
    let s = spawn(spec, altitudeM, spec.rates.rateRefSpeedMps)
    for (let i = 0; i < 60 * CLIMB_SETTLE_S; i++) {
      s = holdMassAndAltitude(spec, stepChecked(spec, s, holdPitchAngle(spec, s, 1, angle), DT), altitudeM)
    }
    // Mean vertical velocity, not a position difference: position is pinned.
    let sum = 0
    for (let i = 0; i < 60 * CLIMB_SAMPLE_S; i++) {
      s = holdMassAndAltitude(spec, stepChecked(spec, s, holdPitchAngle(spec, s, 1, angle), DT), altitudeM)
      sum += s.velocity.y
    }
    const rate = sum / (60 * CLIMB_SAMPLE_S)
    if (rate > best) best = rate
  }
  return best
}

/**
 * Idle throttle, flight path held level until the wing stalls; report the
 * airspeed at that moment. This is a 1-g stall: the autopilot demands level
 * flight all the way down, so the angle of attack rises as the speed decays
 * and `isStalled` fires when the wing can no longer carry the weight.
 */
const STALL_MAX_S = 300

export function measureStallSpeed(spec: AircraftSpec, altitudeM: number): number {
  let s = spawn(spec, altitudeM, spec.rates.rateRefSpeedMps)
  for (let i = 0; i < 60 * STALL_MAX_S; i++) {
    s = holdMass(spec, stepChecked(spec, s, holdLevelFlight(spec, s, 0, altitudeM), DT))
    if (isStalled(spec, s)) return airspeed(s)
  }
  // Important 2: a wing that never stalls within the run is not evidence of a
  // stall speed of "whatever the airspeed happened to be" -- it means the
  // decelerating glide never got there, and that has to be loud.
  throw new Error(
    `measureStallSpeed for "${spec.id}" at altitude ${altitudeM} m never stalled within ` +
      `${STALL_MAX_S} s of simulated time (airspeed ${airspeed(s).toFixed(3)} m/s at that point)`,
  )
}

/**
 * Full aileron at a fixed speed; report degrees per second of roll.
 *
 * Speed and altitude are pinned between steps so this measures roll authority
 * rather than the spiral a real full-aileron input turns into within a second
 * -- but ATTITUDE is left alone, and the roll rate is read back out of it by
 * integrating the bank angle (`bankAngleRad`, shared with `autopilot.ts`)
 * across the run, not by summing the commanded `bodyRates.x` directly.
 *
 * Important 1: summing `bodyRates.x` measures nothing. At this card's exact
 * spawn condition (103 m/s at altitude 0, which is also `rates.rateRefSpeedMps`
 * and sea level) the authority term in `ratesFromDynamicPressure` is exactly
 * q/qRef = 1.0 by construction, so `bodyRates.x` is exactly
 * `maxRollRateDegPerSec * DEG` on every step regardless of whether the
 * quaternion integration, the authority scaling, or the body-axis convention
 * is even correct -- the card would read 80.000 deg/s even if
 * `qIntegrateBodyRates` were a no-op. Reading the bank angle back out of
 * `next.attitude` instead means the card fails if any of those three break.
 * Per-step deltas are summed rather than differencing start and end bank
 * directly so a run that ever exceeded +-180 degrees of bank would not wrap
 * silently; at this card's speed and duration (at most ~90 degrees of total
 * bank) the two are numerically the same.
 */
export function measureRollRate(spec: AircraftSpec, altitudeM: number, speedMps: number): number {
  let s = spawn(spec, altitudeM, speedMps)
  const controls: Controls = { pitch: 0, roll: 1, yaw: 0, throttle: 0.8 }
  const SECONDS = 1
  let totalRad = 0
  let prevBank = bankAngleRad(s)
  for (let i = 0; i < 60 * SECONDS; i++) {
    const next = stepChecked(spec, s, controls, DT)
    s = { ...next, velocity: v3(speedMps, 0, 0), position: v3(0, altitudeM, 0) }
    const bank = bankAngleRad(s)
    totalRad += bank - prevBank
    prevBank = bank
  }
  return (totalRad / SECONDS) * (180 / Math.PI)
}

/**
 * Ground-roll distance from a standstill to a stated lift-off speed, metres.
 * Controls held at zero (level, no aileron, no rudder) and full throttle, so
 * the commanded body rates are all zero and the attitude never leaves level --
 * no autopilot is needed to hold it there. Altitude and vertical velocity are
 * pinned to zero every step to stand in for "wheels still on the runway",
 * because the model has no ground-reaction / undercarriage force of its own.
 *
 * NOT a like-for-like measurement against a full-flaps trial figure: the
 * model has no flaps, no rolling friction and no ground effect. All three
 * push a simulated roll shorter than a flapped, friction-and-effect trial
 * roll would be -- see the take-off card in f6f.test.ts for the tolerance
 * this is graded at and the number that tolerance is built from.
 */
const TAKEOFF_MAX_S = 60

export function measureTakeoffRun(spec: AircraftSpec, liftoffSpeedMps: number): number {
  let s = spawn(spec, 0, 0)
  const controls: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 1 }
  for (let i = 0; i < 60 * TAKEOFF_MAX_S; i++) {
    const next = holdMass(spec, stepChecked(spec, s, controls, DT))
    s = {
      ...next,
      position: v3(next.position.x, 0, next.position.z),
      velocity: v3(next.velocity.x, 0, next.velocity.z),
    }
    if (airspeed(s) >= liftoffSpeedMps) return s.position.x
  }
  // Important 2's same reasoning applies here: a run that never reached
  // lift-off speed is not evidence of "whatever distance it had covered so far".
  throw new Error(
    `measureTakeoffRun for "${spec.id}" did not reach ${liftoffSpeedMps.toFixed(3)} m/s within ` +
      `${TAKEOFF_MAX_S} s of simulated time (airspeed ${airspeed(s).toFixed(3)} m/s, ` +
      `distance ${s.position.x.toFixed(1)} m at that point)`,
  )
}
