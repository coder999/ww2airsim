import { HalfFloatType, Matrix4, RGFormat, Vector3, Vector4, type Camera } from 'three'
import type { Node, TextureNode } from 'three/webgpu'
import { Fn, getViewPosition, int, rtt, uniform, uv, vec2, vec4 } from 'three/tsl'
import type { Vec3 } from '../../sim/math/vec3.js'

/**
 * Camera-motion reconstruction for TRAA (Cloud Fidelity II §3.1).
 *
 * The old Task 6 path made every scene fragment write a second MRT attachment.
 * At 4K that cost about 2 ms even with a constant value (Task 11 measurement).
 * Almost every visible pixel is static world geometry, so depth already says
 * which world point TRAA must reproject:
 *
 * 1. reconstruct the current view position from the JITTERED depth sample;
 * 2. rotate/translate it into this frame's camera-relative world;
 * 3. add `eye - previousEye`, so it names the same point in the previous
 *    camera-relative frame;
 * 4. project both with the UNJITTERED current/previous view-projections;
 * 5. write `ndc(now) - ndc(previous)`, exactly TRAANode's convention.
 *
 * Camera motion is smooth except at depth discontinuities, which TRAA already
 * detects independently at full resolution. Reconstructing it at quarter
 * linear resolution therefore cuts this pass to 1/16 of 4K while preserving
 * TRAA's full-resolution silhouette rejection. Moving objects deliberately
 * receive camera motion initially; the Tier 2 roll captures decide whether
 * they need a later object-only pass.
 */
const viewProjection = uniform(new Matrix4())
const previousViewProjection = uniform(new Matrix4())
const eyeDelta = uniform(new Vector3())
const cameraWorld = uniform(new Matrix4())

let previousEye: Vec3 | null = null
const scratch = new Matrix4()

/** One sixteenth of the full-resolution pixels. */
export const CAMERA_MOTION_RESOLUTION_SCALE = 0.25

export type CameraMotion = { readonly source: TextureNode; dispose(): void }

/** A reduced-resolution camera-motion texture and the load adapter TRAA uses. */
export function createCameraMotion(depth: TextureNode, camera: Camera): CameraMotion {
  // This is the live Matrix4 object. TRAANode jitters it in its
  // OnBeforeRenderPipeline hook before this RTT renders, which is exactly the
  // inverse needed to reconstruct the position that produced the depth.
  const jitteredProjectionInverse = uniform(camera.projectionMatrixInverse)
  const node = Fn(() => {
    const sampleUv = uv()
    // renderer.ts always enables reversed depth. TRAANode's own
    // sampleCurrentDepth applies this same oneMinus before reconstruction.
    const depthValue = depth.sample(sampleUv).x.oneMinus()
    const viewPosition = getViewPosition(sampleUv, depthValue, jitteredProjectionInverse).toVar()
    const relativeWorld = cameraWorld.mul(vec4(viewPosition, 1)).xyz.toVar()
    const clipNow = viewProjection.mul(vec4(relativeWorld, 1)).toVar()
    const clipPrevious = previousViewProjection.mul(vec4(relativeWorld.add(eyeDelta), 1)).toVar()
    const motion = clipNow.xy.div(clipNow.w).sub(clipPrevious.xy.div(clipPrevious.w))
    return vec4(motion, 0, 1)
  })()
  const texture = rtt(node, null, null, {
    type: HalfFloatType,
    format: RGFormat,
    resolutionScale: CAMERA_MOTION_RESOLUTION_SCALE,
  })
  texture.name = 'cameraMotion'

  // three r186 reads velocity only through load(fullResolutionTexel). Map
  // that coordinate back to UV so the reduced texture is sampled linearly.
  const source = {
    load(positionTexel: Node<'vec2'>): Node<'vec4'> {
      const textureSize = vec2(depth.size(int(0)) as unknown as Node<'ivec2'>)
      const sampleUv = positionTexel.div(textureSize)
      return texture.sample(sampleUv) as unknown as Node<'vec4'>
    },
  }
  return {
    source: source as unknown as TextureNode,
    dispose() { texture.dispose() },
  }
}

/**
 * Advances the motion state to the frame about to render. Call once per
 * RENDERED frame, before the pipeline renders (the camera must be unjittered
 * and posed for this frame). After `resetVelocity` (and on the first frame),
 * previous equals current so reconstructed motion is zero.
 */
export function advanceVelocity(camera: Camera, eye: Vec3): void {
  camera.updateMatrixWorld()
  scratch.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  if (previousEye === null) {
    previousViewProjection.value.copy(scratch)
    eyeDelta.value.set(0, 0, 0)
  } else {
    previousViewProjection.value.copy(viewProjection.value)
    eyeDelta.value.set(eye.x - previousEye.x, eye.y - previousEye.y, eye.z - previousEye.z)
  }
  viewProjection.value.copy(scratch)
  cameraWorld.value.copy(camera.matrixWorld)
  previousEye = { x: eye.x, y: eye.y, z: eye.z }
}

/** The next `advanceVelocity` starts from nothing (a teleport or a cut). */
export function resetVelocity(): void {
  previousEye = null
}

/** CPU mirror of the motion texture's final two projections, for tests. */
export function cameraMotionNdc(relativeWorld: Vec3): { x: number; y: number } {
  const now = new Vector4(relativeWorld.x, relativeWorld.y, relativeWorld.z, 1).applyMatrix4(viewProjection.value)
  const previous = new Vector4(
    relativeWorld.x + eyeDelta.value.x,
    relativeWorld.y + eyeDelta.value.y,
    relativeWorld.z + eyeDelta.value.z,
    1,
  ).applyMatrix4(previousViewProjection.value)
  return {
    x: now.x / now.w - previous.x / previous.w,
    y: now.y / now.w - previous.y / previous.w,
  }
}

/** The uniforms' current values, for the unit test. */
export function velocityState(): { viewProjection: Matrix4; previousViewProjection: Matrix4; eyeDelta: Vector3 } {
  return { viewProjection: viewProjection.value, previousViewProjection: previousViewProjection.value, eyeDelta: eyeDelta.value }
}
