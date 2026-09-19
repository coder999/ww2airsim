import { mul, smoothstep } from 'three/tsl'
import type { Node } from 'three/webgpu'
import { EARTH_RADIUS_M } from '../sim/world/projection.js'

/**
 * How far the Earth's surface falls below the tangent plane at a given
 * horizontal distance: the `d^2/2R` of master spec §4.
 *
 * **This is the only place that expression may live**, and
 * `tests/architecture/boundary.test.ts` asserts it. The reason is not tidiness.
 * Plan 4 applied the sink to the terrain and not to the water, so the flat sea
 * at `y = 0` occluded every coast lower than the sink at its own distance --
 * 80.4 m at 32 km -- and the beach was invisible. That was ruled "not a bug,
 * it is the ocean's to fix" on 2026-09-14. A second copy of this expression is
 * how that defect comes back: one surface gets an edit and the other does not,
 * and the symptom is geography rather than a stack trace.
 *
 * The same hazard is why the Plan 4 hand-off insists a vertical exaggeration
 * would be "one number, two call sites, and a test that they are the same
 * number".
 *
 * Even in `distanceM` because distance is unsigned in meaning; taking a signed
 * value and squaring it is the caller-friendly shape and cannot surprise.
 */
export function horizonSinkM(distanceM: number): number {
  return (distanceM * distanceM) / (2 * EARTH_RADIUS_M)
}

/**
 * The distance to the true horizon from a given eye height, the exact inverse
 * of `horizonSinkM`.
 *
 * This is what sets `OCEAN_EXTENT_M`, and it is why the ocean cannot simply
 * inherit the terrain's 100 km draw distance: at 3,000 m the horizon is
 * 195.5 km away, so a 100 km surface would put the edge of the world in frame
 * at the altitude Plan 4's own reference screenshots were taken from.
 */
export function horizonDistanceM(eyeHeightM: number): number {
  return Math.sqrt(2 * EARTH_RADIUS_M * eyeHeightM)
}

/**
 * How far the ocean surface extends from the camera, metres.
 *
 * 400 km, from `horizonDistanceM(11_370) = 380.6 km` -- the horizon at the
 * F6F's service ceiling of ~37,300 ft -- rounded up.
 *
 * The service ceiling is NOT currently in `content/aircraft/f6f-hellcat.json`
 * (the schema has `diveSpeedMps` and no ceiling), so it is a historical figure
 * and is cited in `ASSETS.md` rather than asserted here. Nothing depends on it
 * being exact: it sets a draw distance and the rounding absorbs a wide error.
 */
export const OCEAN_EXTENT_M = 400_000

/**
 * `horizonSinkM` as a TSL node, for a material's `positionNode`.
 *
 * Kept in this module beside the scalar rather than in a GPU-only one so that
 * the boundary test above has a single file to point at. `three/tsl` imports
 * cleanly under plain Node -- verified 2026-09-15, 682 exports -- so this
 * module stays importable by a headless test.
 *
 * Typed `Node<'float'>` rather than `ShaderNodeObject<Node>` -- the type this
 * version of three's TSL surface actually exports for a chained node
 * expression is `Node<'float'>`, and `src/render/terrain/mesh.ts` already
 * types its own node locals that way (see `worldXZ: Node<'vec2'>` there).
 */
export function horizonSinkNode(distanceM: Node<'float'>): Node<'float'> {
  return mul(distanceM, distanceM).div(2 * EARTH_RADIUS_M)
}

/** The terrain's draw distance and the distance at which aerial perspective
 *  is total (`terrain/lod.ts`'s `drawDistanceM`; `tests/render/clouds.test.ts`
 *  pins the two equal). */
export const FOG_DISTANCE_M = 100_000

/**
 * Aerial perspective weight, 0 clear to 1 pure `SKY_HAZE` at `FOG_DISTANCE_M`.
 * Moved here from `terrain/mesh.ts` on 2026-09-19 so the clouds and the
 * terrain fog on ONE ramp, for the reason `horizonSinkNode` lives here.
 * `smoothstep` is exactly 1 at the distance, which is what lets the far
 * plane sit on the draw distance invisibly -- mesh.ts's own comment.
 */
export function fogWeightNode(distanceM: Node<'float'>): Node<'float'> {
  return smoothstep(0, FOG_DISTANCE_M, distanceM)
}
