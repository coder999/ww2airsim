import { type Vec3, v3, add, scale, dot, length, normalize, cross, ZERO } from '../math/vec3.js'
import { qRotate, qIntegrateBodyRates } from '../math/quat.js'
import { densityAt } from '../atmosphere.js'
import { liftCoefficient, dragCoefficient, alphaCritRad } from '../aero.js'
import { gearAfter, gearDragN, restOnSurface, supportedContact } from '../ground.js'
import { heightAt } from '../world/terrain.js'
import type { AircraftSpec } from './schema.js'
import type { AircraftState, Controls } from './state.js'
import type { SimContext } from '../loop.js'

export { createState } from './state.js'
export type { AircraftState, Controls } from './state.js'

/** The fixed timestep the whole simulation is designed around, seconds.
 *  Spec: 60 Hz. This is a constant every caller is expected to pass, not
 *  something `step` enforces -- `step` integrates whatever positive, finite
 *  `dt` it is handed (see `assertUsableDt`). Who owns the fixed-step contract,
 *  and how a variable frame time is accumulated into 60 Hz ticks, is a
 *  deliberately deferred design decision for the next plan. */
export const DT = 1 / 60
const G = 9.80665
/** kg of fuel per joule of work, tuned so a full internal load lasts a
 *  realistic few hours at cruise. Refined when range matters. */
const FUEL_KG_PER_JOULE = 7.5e-8

export const airspeed = (state: AircraftState): number => length(state.velocity)

/** The model's only mass expression: empty weight plus whatever fuel remains,
 *  no separate payload term. `step` and `autopilot.ts`'s `holdLevelFlight`
 *  both need exactly this quantity to trim lift against weight, so it is
 *  exported rather than duplicated -- a payload term added here later would
 *  otherwise have to be found and added in two places to keep the autopilot
 *  trimming for the airplane's actual weight. */
export const massKg = (spec: AircraftSpec, state: AircraftState): number =>
  spec.mass.emptyKg + state.fuelKg

/** Body-frame forward and up axes for the current attitude. (Body right is
 *  not needed anywhere in this module -- dropped to avoid paying for two
 *  unused quaternion rotations every step.) */
const bodyAxes = (state: AircraftState) => ({
  forward: qRotate(state.attitude, v3(1, 0, 0)),
  up: qRotate(state.attitude, v3(0, 1, 0)),
})

/**
 * Angle of attack, radians, positive when the airflow comes from below the
 * wing. This is the standard flight-dynamics definition -- the angle, measured
 * in the airplane's plane of symmetry, between the body forward axis and the
 * velocity projected into that plane.
 *
 * It IS already measured in the plane of symmetry, and open item 8 in
 * `docs/superpowers/specs/2026-09-12-renderer-and-flight-controls-design.md`
 * was wrong to say otherwise (retracted there 2026-09-13, with the numbers).
 * Derivation, because that item was believed for a day and is the kind of
 * claim this codebase has shipped wrongly before. Write the velocity in the
 * body basis, which `qRotate` keeps orthogonal for any attitude:
 *
 *     v = u * forward + n * up + s * right
 *     u = dot(v, forward)   n = dot(v, up)   s = dot(v, right)
 *
 * Projecting the lateral component out gives `vSym = v - s * right`, and
 * because `right` is orthogonal to both `forward` and `up`:
 *
 *     dot(vSym, forward) = u        dot(vSym, up) = n
 *
 * -- so `atan2(-n, u)` below is already the in-plane angle, and doing the
 * subtraction first cannot change it. Verified numerically 2026-09-13 over
 * 20,000 random attitude/velocity pairs: the largest disagreement between
 * this function and the explicitly-projected form is 1.2e-14 rad (7e-13
 * degrees), i.e. the rounding cost of the extra subtraction and nothing else.
 * `tests/sim/flight/angleOfAttack.test.ts` asserts the identity rather than
 * leaving it as this paragraph.
 *
 * What open item 8 mistook for an artefact is real: yaw the nose away from a
 * fixed flight path and alpha grows as `tan(alpha) = tan(alpha_0) / cos(beta)`
 * -- 3.5% at 15 degrees of sideslip, 34% at 42. That is what the definition
 * says, not a bug in it. Crabbing cuts the chordwise component of the flow
 * (`u`) while leaving the component normal to the wing (`n`) alone, so the
 * flow does meet the chord at a larger angle. The same test file pins that
 * relation, so a future "fix" that removes it has to fail a test first.
 *
 * `normalize(v)` is not load-bearing: both arguments are scaled by the same
 * positive `1/|v|`, which `atan2` is invariant to. It is kept because it
 * costs one sqrt in a function that is not the hot path (`step` calls it
 * once) and it keeps the arguments in a readable range for anyone debugging.
 *
 * Note also that this form degrades gracefully where the projected form does
 * not: in a purely lateral flow (90 degrees of sideslip) `vSym` is the zero
 * vector, so normalizing it yields NaN, while `atan2(0, 0)` is 0.
 */
export function angleOfAttack(state: AircraftState): number {
  const v = state.velocity
  if (length(v) < 1e-6) return 0
  const { forward, up } = bodyAxes(state)
  const vn = normalize(v)
  // Positive alpha = airflow coming from below the wing.
  return Math.atan2(-dot(vn, up), dot(vn, forward))
}

function powerFractionAt(spec: AircraftSpec, altitudeM: number): number {
  const pts = spec.engine.powerFractionByAltitudeM
  if (altitudeM <= pts[0]![0]) return pts[0]![1]
  const last = pts[pts.length - 1]!
  if (altitudeM >= last[0]) return last[1]
  for (let i = 1; i < pts.length; i++) {
    const [h1, f1] = pts[i]!
    const [h0, f0] = pts[i - 1]!
    if (altitudeM <= h1) return f0 + ((f1 - f0) * (altitudeM - h0)) / (h1 - h0)
  }
  return last[1]
}

/** Clamps to [lo, hi], and maps any non-finite input to 0 rather than letting
 *  it propagate. This is the simulation's only external input boundary --
 *  Important 4: without this, a NaN or out-of-range control channel (a
 *  malformed input event, a bad replay file, ...) poisons the whole state,
 *  and `qNormalize`'s zero-length guard cannot catch a NaN because a NaN
 *  quaternion's hypot is itself NaN, not 0. */
export const clampFinite = (n: number, lo: number, hi: number): number =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : 0

function thrustMagnitude(spec: AircraftSpec, state: AircraftState, rawThrottle: number): number {
  const throttle = clampFinite(rawThrottle, 0, 1)
  const v = Math.max(airspeed(state), 1)
  const power = spec.engine.maxPowerW * powerFractionAt(spec, state.position.y) * throttle
  // Propeller thrust from power, capped at static thrust so it does not blow up
  // toward zero airspeed.
  return Math.min((spec.engine.propEfficiency * power) / v, spec.engine.staticThrustN * throttle)
}

const DEG = Math.PI / 180

/** Shared by `commandedBodyRates` and `step`, which both need it but must not
 *  recompute rho/v/q a second time when `step` already has them in hand
 *  (this is the hottest function in the project). */
function ratesFromDynamicPressure(spec: AircraftSpec, q: number, controls: Controls): Vec3 {
  const qRef = 0.5 * densityAt(0) * spec.rates.rateRefSpeedMps * spec.rates.rateRefSpeedMps
  // qRef is always > 0: schema.ts validates rateRefSpeedMps as positive.
  const authority = Math.min(1, q / qRef)

  const clamp = (n: number) => clampFinite(n, -1, 1)
  return v3(
    clamp(controls.roll) * spec.rates.maxRollRateDegPerSec * DEG * authority,
    // Negated: a positive rotation rate about body +Y (right-hand rule) turns
    // +X (forward) toward -Z (left) in this right-handed frame, but the
    // documented convention is yaw > 0 = nose right (+Z). See Controls.yaw.
    -clamp(controls.yaw) * spec.rates.maxYawRateDegPerSec * DEG * authority,
    clamp(controls.pitch) * spec.rates.maxPitchRateDegPerSec * DEG * authority,
  )
}

/**
 * Spec §5: control input commands a body rotation rate, not a torque. The
 * achievable fraction of the maximum rate scales with dynamic pressure
 * normalised against sea-level dynamic pressure at the reference speed. This
 * is what makes controls mushy near the stall and stiff at speed, without
 * modelling moments of inertia or damping derivatives.
 */
export function commandedBodyRates(
  spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
): Vec3 {
  const rho = densityAt(state.position.y)
  const v = airspeed(state)
  const q = 0.5 * rho * v * v
  return ratesFromDynamicPressure(spec, q, controls)
}

/** Wing-drop roll rate injected at the stall, rad/s. Deterministic in sign so
 *  the behaviour is reproducible; a randomised drop would need the seeded RNG. */
const STALL_WING_DROP_RAD_PER_S = 0.6

export function isStalled(spec: AircraftSpec, state: AircraftState): boolean {
  return Math.abs(angleOfAttack(state)) > alphaCritRad(spec)
}

/**
 * Finding I8: `step` would previously integrate a NaN, a negative or a 0.25 s
 * frame-time `dt` perfectly happily -- a NaN poisons the whole state, a
 * negative one runs the physics backwards, and neither produces anything a
 * caller would recognise as an error. `dt` is the one `step` argument that is
 * not otherwise validated: `spec` is Zod-checked at load and `controls` go
 * through `clampFinite`.
 *
 * Deliberately narrow: it rejects only what cannot be integrated at all, and
 * says nothing about the 60 Hz constraint. A large-but-finite `dt` is still
 * accepted, because rejecting it needs a decision about who owns the
 * fixed-step contract -- the `SimContext` (`../loop.js`) carries `dt` as of
 * this task, but its accumulator, which is what would actually own that
 * contract, is Task 3's work, not this one's.
 */
function assertUsableDt(dt: number): void {
  if (!Number.isFinite(dt) || dt <= 0) {
    throw new Error(`step() requires a positive, finite dt in seconds, got ${dt}`)
  }
}

export function step(
  spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
  ctx: SimContext,
): AircraftState {
  assertUsableDt(ctx.dt)
  const dt = ctx.dt
  const mass = massKg(spec, state)
  const rho = densityAt(state.position.y)
  const v = airspeed(state)
  const q = 0.5 * rho * v * v
  const { forward, up } = bodyAxes(state)

  const alpha = angleOfAttack(state)
  const cl = liftCoefficient(spec, alpha)
  const cd = dragCoefficient(spec, cl, alpha)

  const liftN = q * spec.geometry.wingAreaM2 * cl
  // Gear drag is parasitic and acts along the same direction as the rest of
  // drag, so it is folded into this one scalar rather than a fourth force.
  const dragN = q * spec.geometry.wingAreaM2 * cd + gearDragN(spec, state.gearFraction, q)
  const thrustN = thrustMagnitude(spec, state, controls.throttle)

  const vdir = v > 1e-6 ? normalize(state.velocity) : forward
  // Lift acts perpendicular to the relative wind, in the plane of the body up axis.
  const liftDir = v > 1e-6 ? normalize(cross(cross(vdir, up), vdir)) : up

  let force: Vec3 = ZERO
  force = add(force, scale(forward, thrustN))
  force = add(force, scale(vdir, -dragN))
  force = add(force, scale(liftDir, liftN))
  force = add(force, v3(0, -mass * G, 0))

  // Ground reaction (Task 5b, found while making a supported contact never
  // read as a crash): while the airplane is ALREADY resting on its wheels at
  // the START of this step, the ground supplies whatever upward force is
  // needed to stop it falling through -- the normal force in any rigid-
  // contact model, which only ever PUSHES. A force that is already lifting
  // (e.g. once airspeed has built enough lift to fly) passes through
  // untouched, so this never holds a genuinely take-off-capable airplane
  // down.
  //
  // Without this, a supported airplane still integrates one tick of
  // unopposed gravity before the POST-integration clamp below (gated on
  // `supportedContact` too) catches it, and that clamp only ever pulls a
  // sunk airplane back up to the surface when it arrived from ABOVE it
  // (`restOnSurface` must not do so once it is already at-or-below --
  // that direction is `assertNoEnergyGain`'s hazard). That one-tick sliver
  // of unopposed fall compounds every following tick, because the
  // post-integration clamp never restores it either, and silently walks the
  // airplane through the ground over a couple of seconds: verified, an idle,
  // gear-down, stationary airplane on this same plateau sank 0.25 m and was
  // wrongly recorded as a crash 91 ticks (1.5 s) in, without this term.
  // `ctx.terrain` being `null` short-circuits before `heightAt` is called,
  // same as the block below.
  if (ctx.terrain != null) {
    const startGroundHeightM = heightAt(ctx.terrain, state.position.x, state.position.z)
    if (force.y < 0 && supportedContact(spec, state, startGroundHeightM)) {
      force = v3(force.x, 0, force.z)
    }
  }

  const accel = scale(force, 1 / mass)
  let velocity = add(state.velocity, scale(accel, dt))
  let position = add(state.position, scale(velocity, dt))

  // The ground constraint: keeps the airplane from sinking through the
  // surface without ever lifting it off (see `restOnSurface`'s doc comment
  // for why that direction matters -- `assertNoEnergyGain`). `ctx.terrain`
  // being `null` short-circuits before `heightAt` is ever called, the same
  // guard `advance`'s impact check (`src/sim/loop.ts`) applies for the same
  // reason: the overwhelmingly common, pre-Task-8 no-terrain path must not
  // pay for a terrain query it has nothing to query.
  //
  // Gated on `supportedContact`, not the bare `onGround`: a gear-up airplane
  // or one arriving too hard must pass straight through untouched and be
  // caught by `advance` as the crash it is, rather than have its sink rate
  // quietly zeroed here first (Task 5b -- `supportedContact`'s own doc
  // explains why the two checks have to agree on this).
  if (ctx.terrain != null) {
    const groundHeightM = heightAt(ctx.terrain, position.x, position.z)
    const integrated: AircraftState = { ...state, position, velocity }
    if (supportedContact(spec, integrated, groundHeightM)) {
      const rested = restOnSurface(integrated, groundHeightM)
      position = rested.position
      velocity = rested.velocity
    }
  }

  const workJ = thrustN * Math.max(v, 1) * dt
  const fuelKg = Math.max(0, state.fuelKg - workJ * FUEL_KG_PER_JOULE)

  const bodyRates = ratesFromDynamicPressure(spec, q, controls)

  // Weathercock: the fin swings the nose into the relative wind.
  //
  // Added 2026-09-13 after Mark flew it twice and reported the same thing both
  // times -- roll into a turn, level out, and the airplane keeps travelling
  // diagonally instead of straightening. Correct: master spec section 5's
  // rate-command model states it carries no damping derivatives, and
  // directional stability is one, so nothing here produced a yaw moment from
  // sideslip at all. Measured before this, hands off at 120 m/s from 10
  // degrees of sideslip, the nose heading did not move by a hundredth of a
  // degree in a full minute.
  //
  // Deliberately a RATE, not a moment, because that is the model this project
  // chose: the fin is treated as commanding a yaw rate proportional to the
  // sideslip it sees, scaled by the same dynamic-pressure authority as every
  // other rate here, so it goes mushy near the stall exactly as the controls
  // do. Sideslip then decays as exp(-t / weathercockSeconds) at full
  // authority.
  //
  // Saturated at the fin's own commanded maximum: a large sideslip cannot
  // produce a yaw rate the pilot could not command with full rudder, which
  // keeps a violent entry from snapping the nose round faster than the
  // airplane can physically yaw.
  const weathercockY = (() => {
    if (v < 1e-6) return 0
    const right = qRotate(state.attitude, v3(0, 0, 1))
    const sideslipRad = Math.asin(Math.max(-1, Math.min(1, dot(vdir, right))))
    const authority = Math.min(1, q / (0.5 * densityAt(0) * spec.rates.rateRefSpeedMps ** 2))
    const maxRad = spec.rates.maxYawRateDegPerSec * DEG
    const rate = (sideslipRad / spec.rates.weathercockSeconds) * authority
    // Negated for the same reason `ratesFromDynamicPressure` negates yaw: a
    // positive rotation about body +Y turns the nose toward -Z, i.e. LEFT,
    // while positive sideslip means the airflow is coming from the right and
    // the nose must go right to meet it.
    return -Math.max(-maxRad, Math.min(maxRad, rate))
  })()
  const stalled = isStalled(spec, state)
  const withWeathercock = v3(bodyRates.x, bodyRates.y + weathercockY, bodyRates.z)
  const ratesWithStall = stalled
    ? v3(withWeathercock.x + STALL_WING_DROP_RAD_PER_S, withWeathercock.y, withWeathercock.z)
    : withWeathercock
  const attitude = qIntegrateBodyRates(state.attitude, ratesWithStall, dt)

  // `gearFraction` is state, and `step` is what produces the next state, so
  // advancing it is `step`'s job, not a later task's -- `gearAfter`
  // (src/sim/ground.ts) is this plan's command for that, driven by
  // `controls.gearDown`.
  const gearFraction = gearAfter(spec, state.gearFraction, controls.gearDown, dt)

  return { position, velocity, attitude, bodyRates: ratesWithStall, fuelKg, tick: ctx.tick, gearFraction }
}
