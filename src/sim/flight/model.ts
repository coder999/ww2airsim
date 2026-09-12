import { type Vec3, v3, add, scale, dot, length, normalize, cross, ZERO } from '../math/vec3.js'
import { qRotate, qIntegrateBodyRates } from '../math/quat.js'
import { densityAt } from '../atmosphere.js'
import { liftCoefficient, dragCoefficient } from '../aero.js'
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

/** Body-frame forward, up and right axes for the current attitude. */
const bodyAxes = (state: AircraftState) => ({
  forward: qRotate(state.attitude, v3(1, 0, 0)),
  up: qRotate(state.attitude, v3(0, 1, 0)),
  right: qRotate(state.attitude, v3(0, 0, 1)),
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

function thrustMagnitude(spec: AircraftSpec, state: AircraftState, throttle: number): number {
  const v = Math.max(airspeed(state), 1)
  const power = spec.engine.maxPowerW * powerFractionAt(spec, state.position.y) * throttle
  // Propeller thrust from power, capped at static thrust so it does not blow up
  // toward zero airspeed.
  return Math.min((spec.engine.propEfficiency * power) / v, spec.engine.staticThrustN * throttle)
}

export function step(
  spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
  dt: number,
): AircraftState {
  const mass = spec.mass.emptyKg + state.fuelKg
  const rho = densityAt(state.position.y)
  const v = airspeed(state)
  const q = 0.5 * rho * v * v
  const { forward, up } = bodyAxes(state)

  const alpha = angleOfAttack(state)
  const cl = liftCoefficient(spec, alpha)
  const cd = dragCoefficient(spec, cl)

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

  // Moments arrive in Task 8; attitude integrates existing body rates only.
  const attitude = qIntegrateBodyRates(state.attitude, state.bodyRates, dt)

  return { position, velocity, attitude, bodyRates: state.bodyRates, fuelKg }
}
