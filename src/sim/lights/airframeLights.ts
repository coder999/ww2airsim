import { type Vec3, v3, add } from '../math/vec3.js'
import { type Quat } from '../math/quat.js'
import { qRotate } from '../math/quat.js'

/**
 * Aircraft position lights (F6A Task 7, ruling D7: position lights only, red / green / white; a landing
 * light only for an airframe with period evidence, and none has been found, so none is installed).
 *
 * Body frame, metres: +X forward, +Y up, +Z right (flight/schema.ts). Points are DATA, one row per flyable
 * airframe, and sit just inside the airframe's committed model bounds (tests/sim/lights/airframeLights.test.ts
 * checks that against every glb): the wingtips at the model's half span, a quarter of the length forward
 * of the tail, and the wing line about 45% of the length back from the nose.
 *
 * SOURCE: red to port, green to starboard, white at the tail is the standard position-light scheme of the
 * period (ANC/Navy practice; docs/night.md, Sources). The exact positions are ESTIMATES read off the
 * models' bounds, not drawings. The visibility arcs below are the conventional 110 degrees forward each side
 * and 140 degrees aft, ESTIMATE for the period.
 */
export const NAV_POINTS = ['port', 'starboard', 'tail'] as const
export type NavPoint = typeof NAV_POINTS[number]
export type AirframeLights = { readonly [K in NavPoint]: readonly [number, number, number] }
/** A landing light, ONLY where period evidence exists for that airframe; `source` is required. */
export type LandingLight = { readonly offset: readonly [number, number, number]; readonly source: string }

export const AIRFRAME_LIGHT_POINTS: Readonly<Record<string, AirframeLights>> = {
  'a6m2-zero': { port: [-1.7, -0.4, -5.95], starboard: [-1.7, -0.4, 5.95], tail: [-6.5, 0.2, 0] },
  'b-17-flying-fortress': { port: [-4.2, 0.9, -15.76], starboard: [-4.2, 0.9, 15.76], tail: [-16.8, 2.2, 0] },
  'b-29-superfortress': { port: [-1.0, 0.5, -21.47], starboard: [-1.0, 0.5, 21.47], tail: [-17.3, 2.3, 0] },
  'b5n2-kate': { port: [-1.4, -0.3, -7.71], starboard: [-1.4, -0.3, 7.71], tail: [-6.8, 0.3, 0] },
  'd3a-val': { port: [-2.1, -0.3, -7.13], starboard: [-2.1, -0.3, 7.13], tail: [-7.4, 0.4, 0] },
  'f4f-wildcat': { port: [-1.4, -0.1, -5.74], starboard: [-1.4, -0.1, 5.74], tail: [-5.9, 0.5, 0] },
  'f4u-corsair': { port: [-1.7, -0.2, -6.2], starboard: [-1.7, -0.2, 6.2], tail: [-7.1, 0.5, 0] },
  'f6f-hellcat': { port: [-1.6, -0.4, -6.48], starboard: [-1.6, -0.4, 6.48], tail: [-7.0, 0.3, 0] },
  'g4m-betty': { port: [-1.1, -0.1, -12.39], starboard: [-1.1, -0.1, 12.39], tail: [-12.5, 0.7, 0] },
  'ki-21-sally': { port: [-0.6, -0.4, -11.2], starboard: [-0.6, -0.4, 11.2], tail: [-9.6, 0.6, 0] },
  'ki-43-oscar': { port: [-1.8, -0.4, -5.37], starboard: [-1.8, -0.4, 5.37], tail: [-6.5, 0.1, 0] },
  'ki-84-frank': { port: [-0.8, -0.4, -5.57], starboard: [-0.8, -0.4, 5.57], tail: [-6.0, 0.2, 0] },
  'p-38-lightning': { port: [-1.0, -0.4, -7.88], starboard: [-1.0, -0.4, 7.88], tail: [-7.1, 0.3, 0] },
  'pby-5a-catalina': { port: [-0.9, 3.8, -15.8], starboard: [-0.9, 3.8, 15.8], tail: [-11.3, 1.7, 0] },
  'tbm-3-avenger': { port: [-2.0, 0.0, -8.21], starboard: [-2.0, 0.0, 8.21], tail: [-8.6, 0.8, 0] },
}

/** None installed (D7): no per-type period evidence found yet (docs/night.md, Sources). Add a row only with a `source`. */
export const AIRFRAME_LANDING_LIGHTS: Readonly<Record<string, LandingLight>> = {}

/** Colour of each point. */
export const NAV_COLOR = { port: 'red', starboard: 'green', tail: 'white' } as const
const DEG = Math.PI / 180
/** The direction each light faces (body frame, unit) and the half-angle of its visibility cone. */
export const NAV_AXIS: Readonly<Record<NavPoint, Vec3>> = {
  port: v3(Math.cos(55 * DEG), 0, -Math.sin(55 * DEG)),
  starboard: v3(Math.cos(55 * DEG), 0, Math.sin(55 * DEG)),
  tail: v3(-1, 0, 0),
}
export const NAV_HALF_ANGLE_RAD: Readonly<Record<NavPoint, number>> = { port: 55 * DEG, starboard: 55 * DEG, tail: 70 * DEG }

/** World position and facing of a position light on an aircraft with this pose, or null for an airframe with no row. */
export function navLightPose(aircraftSpecId: string, point: NavPoint, position: Vec3, attitude: Quat): { readonly position: Vec3; readonly axis: Vec3 } | null {
  const row = Object.hasOwn(AIRFRAME_LIGHT_POINTS, aircraftSpecId) ? AIRFRAME_LIGHT_POINTS[aircraftSpecId] : undefined
  if (row === undefined) return null
  const o = row[point]
  return { position: add(position, qRotate(attitude, v3(o[0], o[1], o[2]))), axis: qRotate(attitude, NAV_AXIS[point]) }
}
