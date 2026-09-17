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
import { createTerrainField, type TerrainField } from '../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../src/sim/world/schema.js'

const DEG = Math.PI / 180

/**
 * Disposable load that puts the airplane on the scales at exactly
 * `reference.testMassKg`.
 *
 * Ruling R31: every figure in the reference block was measured at one stated
 * gross weight, so a harness that spawns at any other weight is not measuring
 * the same airplane. `step()` computes mass as `mass.emptyKg + state.fuelKg`
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
 *  with this pin removed left the airplane to burn fuel freely, and it took
 *  436 s (not the shipped card's 421 s) to lose 36.6 kg, 0.65% of gross weight,
 *  worth 0.11 m/s on the reading (172.56 m/s drifting, 172.46 m/s held). That
 *  436 s vs 421 s gap is NOT because burning fuel changes qRef as it goes --
 *  qRef (`0.5 * densityAt(0) * rateRefSpeedMps^2` in flight/model.ts) has no
 *  mass or fuel dependency at all. The real mechanism: a lighter airplane
 *  trims to a lower clTrim (= massKg * G / (q * S)), which changes induced
 *  drag and hence the equilibrium speed the run is converging toward. Small,
 *  but it is free to remove and it would not stay small for a longer card. */
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
 *    level and lift a little short of weight the airplane settles into a
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
  // Run-scoped, not the loop index directly: this measurement is a single
  // timeline, and SimContext.tick's contract (src/sim/loop.ts) is monotonic
  // for the whole run it belongs to, not just within one loop.
  let tick = 0
  for (let i = 0; i < 60 * TOP_SPEED_MAX_S; i++) {
    tick++
    s = holdMass(spec, stepChecked(spec, s, holdLevelFlight(spec, s, 1, altitudeM), { dt: DT, tick }))
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
 *  -- a flight-path angle of only 15.8 degrees. Past 32 degrees the airplane
 *  departs and reads about -45 m/s, which is harmless because the sweep takes
 *  the maximum, but it is why the sweep does not simply run to 90. */
const CLIMB_SWEEP_MAX_DEG = 40
const CLIMB_SWEEP_STEP_DEG = 2
/** Long enough for airspeed to settle at the commanded attitude: the airplane
 *  is spawned at the rate-reference speed and has to decelerate ~45 m/s at well
 *  under 1 m/s^2. Measured 2026-09-12 at propEfficiency 0.75, testMassKg
 *  5633.62, at the best-rate (24-degree) attitude: spawn speed 103.000 m/s,
 *  settled speed after 120 s 57.984 m/s, a 45.016 m/s drop (0.375 m/s^2 mean).
 *  This number moves with propEfficiency and mass -- it is not a property of
 *  the model in general, just of this content file as it stood on that date. */
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
    // Run-scoped for this angle's own timeline: settle and sample are two
    // sequential phases of the SAME run (the state carries over between
    // them, unlike between one angleDeg and the next, which starts from a
    // fresh spawn), so the tick counter has to carry over too rather than
    // restarting at the sample phase -- see Task 1 fix round 1.
    let tick = 0
    for (let i = 0; i < 60 * CLIMB_SETTLE_S; i++) {
      tick++
      s = holdMassAndAltitude(spec, stepChecked(spec, s, holdPitchAngle(spec, s, 1, angle), { dt: DT, tick }), altitudeM)
    }
    // Mean vertical velocity, not a position difference: position is pinned.
    let sum = 0
    let stalledDuringSample = false
    for (let i = 0; i < 60 * CLIMB_SAMPLE_S; i++) {
      tick++
      s = holdMassAndAltitude(spec, stepChecked(spec, s, holdPitchAngle(spec, s, 1, angle), { dt: DT, tick }), altitudeM)
      sum += s.velocity.y
      if (isStalled(spec, s)) stalledDuringSample = true
    }
    // **A stalled sweep point is not a climb rate, and this card used to take
    // one as its best.** Added 2026-09-17. The sweep runs the commanded pitch
    // attitude up past the best-rate angle into attitudes that depart, and
    // because the altitude is PINNED a departed airplane can report a large
    // `velocity.y` while going nowhere. It stayed invisible while the model had
    // no lateral force: the moment `sideForceN` was added, a departed state
    // that the stall wing-drop had rolled acquired a vertical force component
    // and won the sweep with 22.9 m/s against a 13.51 m/s reference -- 69% off.
    // Rejecting stalled points is the fix, not a tolerance: the card grades a
    // best RATE OF CLIMB, and a stalled airplane is not climbing.
    if (stalledDuringSample) continue
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
 *
 * `flapFraction` defaults to 0 -- the clean configuration every caller before
 * Plan 11b measured, and the one `reference.stallSpeedMps` is a figure for.
 * Pass 1 for the landing-configuration card graded against
 * `reference.stallSpeedFlapMps`.
 */
const STALL_MAX_S = 300

export function measureStallSpeed(spec: AircraftSpec, altitudeM: number, flapFraction = 0): number {
  // Held at the configuration this card measures, not lowered during the run:
  // the card grades a CONFIGURATION, not a transition. `flapDown` is left
  // undefined in the controls below so `flapAfter` holds the travel where this
  // line put it -- see its doc comment on the hold rule.
  let s: AircraftState = { ...spawn(spec, altitudeM, spec.rates.rateRefSpeedMps), flapFraction }
  let tick = 0
  for (let i = 0; i < 60 * STALL_MAX_S; i++) {
    tick++
    s = holdMass(spec, stepChecked(spec, s, holdLevelFlight(spec, s, 0, altitudeM), { dt: DT, tick }))
    if (isStalled(spec, s)) return airspeed(s)
  }
  // Important 2: a wing that never stalls within the run is not evidence of a
  // stall speed of "whatever the airspeed happened to be" -- it means the
  // decelerating glide never got there, and that has to be loud.
  throw new Error(
    `measureStallSpeed for "${spec.id}" at altitude ${altitudeM} m with flaps at ${flapFraction} ` +
      `never stalled within ${STALL_MAX_S} s of simulated time ` +
      `(airspeed ${airspeed(s).toFixed(3)} m/s at that point)`,
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
  let tick = 0
  for (let i = 0; i < 60 * SECONDS; i++) {
    tick++
    const next = stepChecked(spec, s, controls, { dt: DT, tick })
    s = { ...next, velocity: v3(speedMps, 0, 0), position: v3(0, altitudeM, 0) }
    const bank = bankAngleRad(s)
    totalRad += bank - prevBank
    prevBank = bank
  }
  return (totalRad / SECONDS) * (180 / Math.PI)
}

/**
 * A flat synthetic runway, built the same way
 * `tests/sim/terrainContact.test.ts` builds its `plateau` (same header shape,
 * a single LOD level, every sample identical) -- just at a nominal
 * `RUNWAY_HEIGHT_M` instead of 1000 m.
 *
 * Deliberately NOT the real, committed Tacloban field. Task 9's binding
 * decision (planning measurements, 2026-09-16): this card grades the flight
 * model against a Patuxent River trial figure measured on a flat airfield, so
 * running it over real Leyte terrain would make a historical grading number
 * depend on which terrain LOD level the test happened to load -- L0 and L4
 * are measurably different runways (2.12% vs 0.30% worst local grade, north-
 * south through Tacloban). A flat field has no such dependency: every level
 * of it is the same runway.
 *
 * `RUNWAY_HEIGHT_M`, not literally sea level (Task 16): `supportedContact`
 * now requires LAND (`surfaceAt`, `src/sim/contact.ts`, reads at-or-below
 * `SEA_LEVEL_M` as water), so a field at height 0 would make this card's
 * airplane read as driving on the ocean, not rolling down a runway -- no
 * ground constraint, no rolling friction, no steering, and a take-off roll
 * that measures nothing like the real one. `RUNWAY_HEIGHT_M` only has to
 * clear `SEA_LEVEL_M`; its exact value does not otherwise matter to a flat
 * field.
 */
const RUNWAY_HEIGHT_M = 1
const FLAT_RUNWAY_FIELD: TerrainField = createTerrainField(
  parseTerrainHeader({
    centreLatDeg: 10.8,
    centreLonDeg: 125.3,
    halfExtentM: 100000,
    finestSamples: 8193,
    levels: 13,
    encoding: 'int16-decimetres',
  }),
  12,
  new Int16Array(9).fill(RUNWAY_HEIGHT_M * 10),
)

/**
 * Ground-roll distance from a standstill to a stated lift-off speed, metres.
 * Controls held at zero (level, no aileron, no rudder) and full throttle, so
 * the commanded body rates are all zero and the attitude never leaves level
 * -- no autopilot is needed to hold it there. `groundBodyRates`
 * (`src/sim/ground.ts`) forces roll to exactly zero throughout, and gates
 * pitch on ground speed reaching `spec.gear.tailUpSpeedMps` -- which this run
 * DOES pass (measured 2026-09-16: at x = 33.8 m of the roll's 228.7 m total,
 * about 15% of the way down it), but that gate only ever passes through
 * `airRates.z`, the AIR-commanded pitch rate, and `airRates.z` is itself zero
 * the whole time because `controls.pitch` is held at zero throughout. So the
 * airplane still never rotates here, not because the speed gate never opens
 * but because there is no rotation command for it to let through -- and it
 * rolls level all the way to lift-off speed by construction, not by a
 * position pin.
 *
 * The airplane is spawned with `gearFraction: 1` -- on its wheels -- over
 * `FLAT_RUNWAY_FIELD`, and the real ground constraint (`restOnSurface`,
 * gated on `supportedContact`) is what keeps it on the runway now, the same
 * mechanism `tests/sim/ground.test.ts` and the terrain soak
 * (`tools/soak/run.ts`) exercise elsewhere. There is no more position/
 * velocity pin to fake "wheels still on the runway" -- that fake is exactly
 * what Task 9 deletes.
 *
 * NOT a like-for-like measurement against a full-flaps trial figure: the
 * model has no flaps and no ground effect, and -- unlike when this comment
 * was first written -- DOES now have rolling friction (this plan), which
 * makes the roll longer than it was. See the take-off card in f6f.test.ts
 * for the tolerance this is graded at, the evidence it is built from, and
 * which way the remaining gap runs.
 */
const TAKEOFF_MAX_S = 60

export function measureTakeoffRun(spec: AircraftSpec, liftoffSpeedMps: number, flapFraction = 0): number {
  // Task 15: `position.y` is the body origin, and a resting airplane's origin
  // sits `spec.gear.heightM` above the ground it is parked on
  // (`onGround`/`restOnSurface`, src/sim/ground.ts), not on the ground
  // itself. Spawning at `RUNWAY_HEIGHT_M + spec.gear.heightM` here, rather
  // than `RUNWAY_HEIGHT_M`, is what keeps this card's datum shift invisible
  // -- the airplane starts exactly on its wheels over `FLAT_RUNWAY_FIELD`
  // either way, so the measured roll distance is unaffected by Task 15.
  // `flapFraction` defaults to 0 for callers predating Plan 11b. The trial
  // figure this card grades against is a FULL-FLAPS run, so the card itself
  // passes 1 -- see the card in f6f.test.ts.
  let s: AircraftState = {
    ...spawn(spec, RUNWAY_HEIGHT_M + spec.gear.heightM, 0),
    gearFraction: 1,
    flapFraction,
  }
  const controls: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 1 }
  let tick = 0
  for (let i = 0; i < 60 * TAKEOFF_MAX_S; i++) {
    tick++
    s = holdMass(spec, stepChecked(spec, s, controls, { dt: DT, tick, terrain: FLAT_RUNWAY_FIELD }))
    if (airspeed(s) >= liftoffSpeedMps) return s.position.x
  }
  // Important 2's same reasoning applies here: a run that never reached
  // lift-off speed is not evidence of "whatever distance it had covered so far".
  throw new Error(
    `measureTakeoffRun for "${spec.id}" with flaps at ${flapFraction} did not reach ` +
      `${liftoffSpeedMps.toFixed(3)} m/s within ` +
      `${TAKEOFF_MAX_S} s of simulated time (airspeed ${airspeed(s).toFixed(3)} m/s, ` +
      `distance ${s.position.x.toFixed(1)} m at that point)`,
  )
}
