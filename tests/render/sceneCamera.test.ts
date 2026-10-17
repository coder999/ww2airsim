import { describe, expect, it, vi } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { CAMERA_VFOV_DEG, ORBIT_SURFACE_CLEARANCE_M } from '../../src/render/camera.js'
import { applySceneEye } from '../../src/render/sceneCamera.js'
import type { SceneEye } from '../../src/sim/scene/camera.js'

const sea = () => 0
const eyeAt = (yawDeg: number, pitchDeg: number): SceneEye => ({ position: [120, 300, -450], yawDeg, pitchDeg })

describe('scene camera', () => {
  it.each([
    { yaw: 0, pitch: 0, forward: [1, 0, 0] },
    { yaw: 90, pitch: 0, forward: [0, 0, -1] },
    { yaw: 180, pitch: 0, forward: [-1, 0, 0] },
    { yaw: -90, pitch: 0, forward: [0, 0, 1] },
    { yaw: 450, pitch: 0, forward: [0, 0, -1] },
    { yaw: 0, pitch: 30, forward: [Math.sqrt(3) / 2, 0.5, 0] },
    { yaw: 90, pitch: -30, forward: [0, -0.5, -Math.sqrt(3) / 2] },
    { yaw: 45, pitch: 45, forward: [0.5, Math.SQRT1_2, -0.5] },
    { yaw: 37, pitch: 90, forward: [0, 1, 0] },
    { yaw: -123, pitch: -90, forward: [0, -1, 0] },
  ])('faces the manual replay direction at yaw $yaw, pitch $pitch', ({ yaw, pitch, forward }) => {
    const camera = new PerspectiveCamera(CAMERA_VFOV_DEG)
    const eye = eyeAt(yaw, pitch)
    applySceneEye(camera, eye, sea)
    const direction = camera.getWorldDirection(new Vector3())
    expect(direction.x).toBeCloseTo(forward[0]!, 12)
    expect(direction.y).toBeCloseTo(forward[1]!, 12)
    expect(direction.z).toBeCloseTo(forward[2]!, 12)
    expect(camera.position.toArray()).toEqual(eye.position)
  })

  it.each([0, 37, 90, -123])('removes inherited roll and keeps world up at yaw %s', (yaw) => {
    const camera = new PerspectiveCamera(CAMERA_VFOV_DEG)
    for (const pitch of [0, 30, -45, 90, -90]) {
      camera.rotation.set(0.4, -0.8, 1.2)
      camera.up.set(1, 0, 0)
      applySceneEye(camera, eyeAt(yaw, pitch), sea)
      expect(camera.up.toArray()).toEqual([0, 1, 0])
      const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
      expect(right.y).toBeCloseTo(0, 12)
      expect(right.x).toBeCloseTo(Math.sin(yaw * Math.PI / 180), 12)
      expect(right.z).toBeCloseTo(Math.cos(yaw * Math.PI / 180), 12)
      // With pitch, screen-up is the projection of world-up onto the view plane.
      const up = new Vector3(0, 1, 0).applyQuaternion(camera.quaternion)
      expect(up.y).toBeCloseTo(Math.cos(pitch * Math.PI / 180), 12)
    }
  })

  it.each([
    { surface: 0, height: -20 },
    { surface: 75, height: 74 },
    { surface: 75, height: 75 + ORBIT_SURFACE_CLEARANCE_M },
    { surface: 75, height: 300 },
  ])('clamps height $height above surface $surface without changing the eye', ({ surface, height }) => {
    const camera = new PerspectiveCamera(CAMERA_VFOV_DEG)
    const eye: SceneEye = Object.freeze({
      position: Object.freeze([120, height, -450] as const), yawDeg: 90, pitchDeg: -30,
    })
    const surfaceHeightAt = vi.fn(() => surface)
    applySceneEye(camera, eye, surfaceHeightAt)
    expect(surfaceHeightAt).toHaveBeenCalledWith(120, -450)
    expect(camera.position.toArray()).toEqual([120, Math.max(height, surface + ORBIT_SURFACE_CLEARANCE_M), -450])
    expect(eye.position).toEqual([120, height, -450])
    const direction = camera.getWorldDirection(new Vector3())
    expect(direction.x).toBeCloseTo(0, 12)
    expect(direction.y).toBeCloseTo(-0.5, 12)
    expect(direction.z).toBeCloseTo(-Math.sqrt(3) / 2, 12)
  })

  it('preserves the existing FOV and projection', () => {
    const camera = new PerspectiveCamera(CAMERA_VFOV_DEG, 16 / 9, 0.1, 100_000)
    const projection = camera.projectionMatrix.clone()
    const updateProjection = vi.spyOn(camera, 'updateProjectionMatrix')
    applySceneEye(camera, eyeAt(70, 25), sea)
    expect(camera.fov).toBe(CAMERA_VFOV_DEG)
    expect(camera.projectionMatrix.equals(projection)).toBe(true)
    expect(updateProjection).not.toHaveBeenCalled()
  })
})
