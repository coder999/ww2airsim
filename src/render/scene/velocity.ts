import { Matrix4, Vector3, type Camera } from 'three'
import { VelocityNode, type Node } from 'three/webgpu'
import { modelViewMatrix, mrt, positionLocal, positionWorld, uniform, varying, vec4 } from 'three/tsl'
import type { Vec3 } from '../../sim/math/vec3.js'

/**
 * Motion vectors for TRAA (photoreal Task 6, spec §4.2), read from three's
 * r186 source on 2026-09-25 rather than assumed.
 *
 * TRAA reprojects its history by the scene pass's motion attachment,
 * `ndc(now) - ndc(previous frame)`. three's `VelocityNode` gets "previous"
 * from the object's previous `matrixWorld` applied to `positionPrevious`,
 * which is the RAW geometry attribute (Position.js:54), untouched by a
 * material's `positionNode`. In this camera-relative world (camera at the
 * origin, scene translated by -eye) that leaves three cases:
 * - ordinary meshes, and the terrain -- its `positionNode` is the TRUE world
 *   position and its object matrix the scene's -eye, so object-matrix
 *   tracking of the displaced position is exact: `VertexVelocityNode`;
 * - instanced meshes (trees, tracers, ordnance): the same node, taking each
 *   instance as fixed within its mesh for one frame (see that class);
 * - the polar ocean (`ocean/mesh.ts`): the mesh FOLLOWS the eye, so its
 *   object matrices say nothing about where the sea was last frame. The sea
 *   is world-fixed (wave motion ignored: centimetres per frame), and a
 *   fragment's `positionWorld` is eye-relative, so the same world point sat
 *   at `positionWorld + (eye - previousEye)` relative to last frame's eye:
 *   `worldFixedVelocity`, set as the ocean material's `mrtNode`.
 *
 * Both are projected with the UNJITTERED view-projection (TRAA jitters the
 * camera's projection during the pipeline render; `advanceVelocity` runs
 * before that). Clip positions go through varyings and divide per fragment,
 * which is exact under perspective-correct interpolation (clip coordinates
 * are linear in object space).
 *
 * Module-level uniforms, the `lighting.ts` pattern (Ruling P2): the ocean
 * material takes its node at construction, before any pipeline exists.
 */
const viewProjection = uniform(new Matrix4())
const previousViewProjection = uniform(new Matrix4())
const eyeDelta = uniform(new Vector3())

const clipNow = varying(viewProjection.mul(vec4(positionWorld, 1)))
const clipPrevious = varying(previousViewProjection.mul(vec4(positionWorld.add(eyeDelta), 1)))

/** NDC motion (now minus previous frame) of a world-fixed surface. */
export const worldFixedVelocity = clipNow.xy.div(clipNow.w).sub(clipPrevious.xy.div(clipPrevious.w)) as unknown as Node<'vec2'>

/**
 * The scene pass's motion-vector MRT output name. Deliberately NOT
 * `'velocity'`: three switches every instanced/skinned/batched mesh into its
 * previous-frame path whenever the active MRT has a `velocity` output
 * (`NodeBuilder.needsPreviousData`, three@0.186.0 NodeBuilder.js:3464), and
 * with that path on, the 1440p frame over Leyte went from p50 2.0 / p95 3.1 ms
 * to p50 3.5 / p95 10-11 ms -- spikes every few frames -- even with a
 * CONSTANT zero written as the velocity; the same zero under another name
 * measured p50 2.8 / p95 3.6 (reference GPU, 2026-09-25, task-6 report). The
 * previous-instance tracking it buys is not needed (`VertexVelocityNode`).
 */
export const MOTION_OUTPUT = 'motion'

/** A material's `mrtNode` overriding the pass's motion output with
 *  `worldFixedVelocity`. Ignored outside an MRT pass (shadow, radar). */
export function worldFixedVelocityMrt(): ReturnType<typeof mrt> {
  return mrt({ [MOTION_OUTPUT]: worldFixedVelocity })
}

/**
 * three's `VelocityNode` for every OTHER mesh (airframes, ships, buildings,
 * the runway, the sky), with one change: both clip positions are computed in
 * the VERTEX stage and passed as varyings. `VelocityNode.setup` builds them
 * inside the MRT output, i.e. per FRAGMENT -- three 4x4 matrix products per
 * fragment for each position -- and at 4K that measured 0.8 ms of the frame
 * (reference GPU, 2026-09-25, runway view: world-fixed velocity everywhere
 * 5.25 ms p50 vs three's node 6.05, zero velocity 5.24). Per-vertex then
 * per-fragment divide is exact for the same reason as above.
 *
 * Everything else is inherited: `update`/`updateAfter` keep the per-object
 * previous `matrixWorld` and the camera's previous view/projection (shared
 * per camera, so exactly ONE instance must be in use -- `sceneVelocity`).
 * The previous position is `positionLocal`, not `positionPrevious`: with the
 * output not named `velocity` (`MOTION_OUTPUT`) three fills no previous-frame
 * vertex data, and for every mesh here without a `positionNode` the two are
 * the same. The one approximation: an INSTANCED mesh's instances are taken
 * as fixed within the mesh for a frame -- exact for everything but tracers
 * and ordnance in flight (small, fast, and clipped to the current
 * neighborhood by TRAA's variance clip). The projection is `unjitteredProjection`,
 * which `advanceVelocity` refreshes before TRAA jitters the camera: TRAA
 * only un-jitters three's global `velocity` instance, which is not used.
 */
class VertexVelocityNode extends VelocityNode {
  override setup(): Node<'vec2'> {
    const projection = uniform(this.projectionMatrix ?? new Matrix4())
    const now = varying(projection.mul(modelViewMatrix).mul(vec4(positionLocal, 1)))
    const previous = varying(this.previousProjectionMatrix.mul(this.previousCameraViewMatrix)
      .mul(this.previousModelWorldMatrix).mul(vec4(positionLocal, 1)))
    return now.xy.div(now.w).sub(previous.xy.div(previous.w)) as unknown as Node<'vec2'>
  }
}

const unjitteredProjection = new Matrix4()
const vertexVelocity = new VertexVelocityNode()
vertexVelocity.setProjectionMatrix(unjitteredProjection)
/** The scene pass's `velocity` MRT output (pipeline.ts). */
export const sceneVelocity = vertexVelocity as unknown as Node<'vec2'>

let previousEye: Vec3 | null = null
const scratch = new Matrix4()

/**
 * Advances the motion state to the frame about to render. Call once per
 * RENDERED frame, before the pipeline renders (the camera must be unjittered
 * and posed for this frame). After `resetVelocity` (and on the first frame)
 * the previous state is this frame's, so the ocean's velocity is zero, like
 * three's own `VelocityNode` on an object's first frame.
 */
export function advanceVelocity(camera: Camera, eye: Vec3): void {
  camera.updateMatrixWorld()
  unjitteredProjection.copy(camera.projectionMatrix)
  scratch.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  if (previousEye === null) {
    previousViewProjection.value.copy(scratch)
    eyeDelta.value.set(0, 0, 0)
  } else {
    previousViewProjection.value.copy(viewProjection.value)
    eyeDelta.value.set(eye.x - previousEye.x, eye.y - previousEye.y, eye.z - previousEye.z)
  }
  viewProjection.value.copy(scratch)
  previousEye = { x: eye.x, y: eye.y, z: eye.z }
}

/** The next `advanceVelocity` starts from nothing (a teleport or a cut).
 *  This resets only `worldFixedVelocity`'s state (the ocean); every other
 *  mesh keeps three's per-object previous matrices across it, which is
 *  harmless because TRAA discards its history on the same frame. */
export function resetVelocity(): void {
  previousEye = null
}

/** The uniforms' current values, for the unit test. */
export function velocityState(): { viewProjection: Matrix4; previousViewProjection: Matrix4; eyeDelta: Vector3 } {
  return { viewProjection: viewProjection.value, previousViewProjection: previousViewProjection.value, eyeDelta: eyeDelta.value }
}
