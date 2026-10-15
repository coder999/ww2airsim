import { type Vec3, v3, add } from '../math/vec3.js'
import { type Quat } from '../math/quat.js'
import { qRotate } from '../math/quat.js'

/**
 * Aircraft position lights (F6A Task 7, ruling D7: position lights only, red / green / white; a landing
 * light only for an airframe with period evidence, and none has been found, so none is installed).
 *
 * Body frame, metres: +X forward, +Y up, +Z right (flight/schema.ts). Points are DATA, one row per flyable
 * airframe, READ OFF THE RENDERED MESH (`tests/render/genNavPoints.test.ts` regenerates the table): the most
 * lateral vertex of each wing, and the aftmost vertex nearest the centreline, on a part that does not move in flight (not a control surface, turret, prop or door). The first version (2026-10-14,
 * CP2) was placed from bounding boxes and a light floated off the Hellcat's wingtip; tests/sim/lights/airframeLights.test.ts
 * now asserts every light lies within `NAV_SURFACE_TOLERANCE_M` of the mesh and that the table equals a fresh extraction.
 *
 * SOURCE: red to port, green to starboard, white at the tail is the standard position-light scheme of the
 * period (ANC/Navy practice; docs/night.md, Sources). The positions are the mesh's own extreme vertices, not drawings. The visibility arcs below are the conventional 110 degrees forward each side
 * and 140 degrees aft, ESTIMATE for the period.
 */
/** A position light lies within this of the airframe mesh surface (the rendered wingtip / rudder), metres. */
export const NAV_SURFACE_TOLERANCE_M = 0.15
export const NAV_POINTS = ['port', 'starboard', 'tail'] as const
export type NavPoint = typeof NAV_POINTS[number]
export type AirframeLights = { readonly [K in NavPoint]: readonly [number, number, number] }
/** A landing light, ONLY where period evidence exists for that airframe; `source` is required. */
export type LandingLight = { readonly offset: readonly [number, number, number]; readonly source: string }

export const AIRFRAME_LIGHT_POINTS: Readonly<Record<string, AirframeLights>> = {
  'a6m2-zero': { port: [-0.28, 0.14, -6], starboard: [-0.28, 0.14, 6], tail: [-6.7, -0.06, 0] },
  'b-17-flying-fortress': { port: [-1.21, 1.12, -15.81], starboard: [-1.21, 1.13, 15.81], tail: [-16.26, 0.38, 0] },
  'b-29-superfortress': { port: [-2.03, 1.22, -21.52], starboard: [-2.03, 1.39, 21.52], tail: [-17.58, 6.2, 0] },
  'b5n2-kate': { port: [-0.23, 0.24, -7.76], starboard: [-0.23, 0.36, 7.76], tail: [-7.06, 1.75, 0] },
  'd3a-val': { port: [-0.5, 0.38, -7.18], starboard: [-0.5, 0.39, 7.18], tail: [-7.64, 0.07, 0] },
  'f4f-wildcat': { port: [-0.11, 0.41, -5.79], starboard: [-0.11, 0.41, 5.79], tail: [-6.01, 1.8, 0] },
  'f4u-corsair': { port: [-0.23, -0.14, -6.25], starboard: [-0.23, -0.14, 6.25], tail: [-7.37, 0.32, 0] },
  'f6f-hellcat': { port: [-0.18, 0.18, -6.53], starboard: [-0.18, 0.18, 6.53], tail: [-7.2, -0.06, 0] },
  'g4m-betty': { port: [-0.27, 0.85, -12.44], starboard: [-0.27, 1.01, 12.44], tail: [-11.79, 0.46, 0] },
  'ki-21-sally': { port: [-0.31, 0.78, -11.25], starboard: [-0.31, 0.98, 11.25], tail: [-9.6, 2.75, 0] },
  'ki-43-oscar': { port: [0.01, 0.09, -5.4], starboard: [0.01, 0.09, 5.4], tail: [-6.31, 0.04, 0.2] },
  'ki-57-ii-topsy': { port: [-0.55, 0.87, -11.3], starboard: [-0.55, 1.01, 11.3], tail: [-11.33, 0.25, 0] },
  'ki-84-frank': { port: [-0.09, -0.01, -5.62], starboard: [-0.09, 0.1, 5.62], tail: [-6.26, 1.65, 0] },
  'p-38-lightning': { port: [-0.16, 0.65, -7.93], starboard: [-0.16, 0.78, 7.93], tail: [-7.34, 1.69, -2.53] },
  'pby-5a-catalina': { port: [-0.9, 2.85, -15.85], starboard: [-0.9, 3.14, 15.85], tail: [-11.53, 0.83, 0] },
  'tbm-3-avenger': { port: [-0.26, 0.21, -8.26], starboard: [-0.26, 0.36, 8.26], tail: [-8.83, 2.43, 0] },
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
