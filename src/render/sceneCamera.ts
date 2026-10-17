import type { Camera } from 'three'
import { clampAbove, headingPitch } from '../replay/cameras.js'
import { v3 } from '../sim/math/vec3.js'
import type { SceneEye } from '../sim/scene/camera.js'
import type { SurfaceHeightAt } from './camera.js'
import { toThreeOrientation } from './frame.js'

/** Apply a scene eye in world coordinates, with manual replay's surface clearance and zero roll. */
export function applySceneEye(camera: Camera, eye: SceneEye, surfaceHeightAt: SurfaceHeightAt): void {
  const position = clampAbove(v3(...eye.position), surfaceHeightAt)
  const orientation = toThreeOrientation(headingPitch(eye.yawDeg * Math.PI / 180, eye.pitchDeg * Math.PI / 180))
  camera.position.set(position.x, position.y, position.z)
  camera.up.set(0, 1, 0)
  camera.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w)
}
