import { type Vec3, v3, add, scale, dot, length, normalize, cross, ZERO } from '../math/vec3.js'
import { qRotate, qIntegrateBodyRates } from '../math/quat.js'
import { densityAt } from '../atmosphere.js'
import { liftCoefficient, dragCoefficient, alphaCritRad } from '../aero.js'
import type { AircraftSpec } from './schema.js'
import type { AircraftState, Controls } from './state.js'

export { createState } from './state.js'
export type { AircraftState, Controls } from './state.js'

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
 *  trimming for the aeroplane's actual weight. */
export const massKg = (spec: AircraftSpec, state: AircraftState): number =>
  spec.mass.emptyKg + state.fuelKg

/** Body-frame forward and up axes for the current attitude. (Body right is
 *  not needed anywhere in this module -- dropped to avoid paying for two
 *  unused quaternion rotations every step.) */
const bodyAxes = (state: AircraftState) => ({
  forward: qRotate(state.attitude, v3(1, 0, 0)),
  up: qRotate(state.attitude, v3(0, 1, 0)),
})

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

export function step(
  spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
  dt: number,
): AircraftState {
  const mass = massKg(spec, state)
  const rho = densityAt(state.position.y)
  const v = airspeed(state)
  const q = 0.5 * rho * v * v
  const { forward, up } = bodyAxes(state)

  const alpha = angleOfAttack(state)
  const cl = liftCoefficient(spec, alpha)
  const cd = dragCoefficient(spec, cl, alpha)

  const liftN = q * spec.geometry.wingAreaM2 * cl
  const dragN = q * spec.geometry.wingAreaM2 * cd
  const thrustN = thrustMagnitude(spec, state, controls.throttle)

  const vdir = v > 1e-6 ? normalize(state.velocity) : forward
  // Lift acts perpendicular to the relative wind, in the plane of the body up axis.
  const liftDir = v > 1e-6 ? normalize(cross(cross(vdir, up), vdir)) : up

  let force: Vec3 = ZERO
  force = add(force, scale(forward, thrustN))
  force = add(force, scale(vdir, -dragN))
  force = add(force, scale(liftDir, liftN))
  force = add(force, v3(0, -mass * G, 0))

  const accel = scale(force, 1 / mass)
  const velocity = add(state.velocity, scale(accel, dt))
  const position = add(state.position, scale(velocity, dt))

  const workJ = thrustN * Math.max(v, 1) * dt
  const fuelKg = Math.max(0, state.fuelKg - workJ * FUEL_KG_PER_JOULE)

  const bodyRates = ratesFromDynamicPressure(spec, q, controls)
  const stalled = isStalled(spec, state)
  const ratesWithStall = stalled
    ? v3(bodyRates.x + STALL_WING_DROP_RAD_PER_S, bodyRates.y, bodyRates.z)
    : bodyRates
  const attitude = qIntegrateBodyRates(state.attitude, ratesWithStall, dt)

  return { position, velocity, attitude, bodyRates: ratesWithStall, fuelKg }
}
