import type { Node } from 'three/webgpu'
import { float, vec2, vec4 } from 'three/tsl'
import type { Vec3 } from '../../sim/math/vec3.js'

/**
 * Temporal accumulation for the reduced-resolution cloud pass (photoreal
 * spec §4.1, Task 4, 2026-09-24): the pure arithmetic, in JS for tests and in
 * TSL for the resolve shader in cloudPass.ts. The two are written line for
 * line alike; the TSL one is proved on the GPU by `cloudTemporal.spec.ts`'s
 * look-left case, not by this file's tests.
 */

/** Weight of the reprojected history in the resolve: `mix(current, history, HISTORY_BLEND)`. */
export const HISTORY_BLEND = 0.9
/** Faster than the F6F's dive limit; an eye that moved faster than this is a teleport. */
export const MAX_EYE_SPEED_MPS = 400
/** A frame longer than this (pause, tab switch, a hitch) invalidates history outright. */
const MAX_FRAME_SECONDS = 0.25
/** The shortest frame the speed test assumes, so a 240 Hz display is not
 *  held to a fraction-of-a-metre threshold. */
const MIN_FRAME_SECONDS = 1 / 240

/**
 * History is discarded when the eye jumped further than a flight could move
 * in one frame (teleport, respawn, scenario switch, a camera-mode cut) or
 * after a long stall. `frameSeconds` is REAL time since the frame the history
 * was written in; `timeScale` (triple time, frame.ts) scales only the
 * distance allowance, since the eye covers sim metres at that rate -- the
 * stall rule stays in real seconds (Task 4 ruling).
 */
export function shouldResetHistory({ eye, prevEye, frameSeconds, timeScale = 1 }: {
  eye: Vec3; prevEye: Vec3; frameSeconds: number; timeScale?: number
}): boolean {
  if (frameSeconds > MAX_FRAME_SECONDS) return true
  const d = Math.hypot(eye.x - prevEye.x, eye.y - prevEye.y, eye.z - prevEye.z)
  return d > MAX_EYE_SPEED_MPS * Math.max(frameSeconds, MIN_FRAME_SECONDS) * Math.max(timeScale, 1)
}

/** A world point at `depthM` along the current pixel's ray, reprojected into
 *  the previous frame's UV. Camera-relative: the previous frame's camera sat
 *  at `prevEye`, the current one at `eye`. Returns null when behind the
 *  previous camera. Pure JS mirror of the TSL used in the shader, for tests.
 *
 *  `v` is TOP-origin (0 at the top edge), the convention of
 *  `screenCoordinate` and of a WebGPU texture's row 0 -- `WGSLNodeBuilder.
 *  isFlipY()` is false in three r186, so `texture(rt, vec2(u, v))` reads the
 *  row this `v` names. */
export function reprojectUv({ dirWorld, depthM, eye, prevEye, prevViewProjection: m }: {
  dirWorld: Vec3; depthM: number; eye: Vec3; prevEye: Vec3; prevViewProjection: readonly number[]
}): { u: number; v: number } | null {
  // The world point, expressed relative to the PREVIOUS eye (camera-relative rendering).
  const x = eye.x - prevEye.x + dirWorld.x * depthM
  const y = eye.y - prevEye.y + dirWorld.y * depthM
  const z = eye.z - prevEye.z + dirWorld.z * depthM
  const cx = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!
  const cy = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!
  const cw = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!
  if (cw <= 1e-6) return null
  return { u: cx / cw * 0.5 + 0.5, v: 0.5 - cy / cw * 0.5 }
}

/**
 * TSL mirror of `reprojectUv`, arithmetic in the same order. `eyeDelta` is
 * `eye - prevEye`, subtracted on the CPU in float64 (world coordinates reach
 * 100 km, where float32 would lose the metre). `valid` is false where
 * `reprojectUv` returns null; `uv` is then meaningless.
 * An inline builder, not an `Fn`: it returns two nodes (trap 1).
 */
export function reprojectUvNode(
  dirWorld: Node<'vec3'>, depthM: Node<'float'>, eyeDelta: Node<'vec3'>, prevViewProjection: Node<'mat4'>,
): { uv: Node<'vec2'>; valid: Node<'bool'> } {
  const p = eyeDelta.add(dirWorld.mul(depthM))
  const clip = prevViewProjection.mul(vec4(p, 1)).toVar()
  const cw = clip.w
  const valid = cw.greaterThan(1e-6)
  const w = cw.max(1e-6)
  const uv = vec2(clip.x.div(w).mul(0.5).add(0.5), float(0.5).sub(clip.y.div(w).mul(0.5)))
  return { uv: uv as unknown as Node<'vec2'>, valid: valid as unknown as Node<'bool'> }
}
