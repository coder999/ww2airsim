import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { reprojectUv } from '../../src/render/scene/cloudHistory.js'
import {
  CAMERA_MOTION_RESOLUTION_SCALE,
  advanceVelocity,
  cameraMotionNdc,
  resetVelocity,
  velocityState,
} from '../../src/render/scene/velocity.js'

function ndcMotion(rel: Vector3): { x: number; y: number } {
  return cameraMotionNdc({ x: rel.x, y: rel.y, z: rel.z })
}

describe('depth-reconstructed camera motion (Cloud Fidelity II §3.1)', () => {
  it('reconstructs one sixteenth as many pixels as the 4K resolve', () => {
    expect(CAMERA_MOTION_RESOLUTION_SCALE).toBe(0.25)
    expect(CAMERA_MOTION_RESOLUTION_SCALE ** 2).toBe(1 / 16)
  })

  it('is zero on the first frame and after a reset', () => {
    const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 1e5)
    resetVelocity()
    advanceVelocity(camera, { x: 100, y: 600, z: 200 })
    const m = ndcMotion(new Vector3(0, -600, -2000))
    expect(Math.abs(m.x) + Math.abs(m.y)).toBeLessThan(1e-9)
  })

  it('is the reprojection of the SAME world point from last frame\'s eye', () => {
    const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 1e5)
    resetVelocity()
    advanceVelocity(camera, { x: 0, y: 600, z: 0 })
    // Fly 10 m forward (-z): a ground point ahead and below moves DOWN the
    // screen (it gets closer), and one dead ahead on the horizon barely moves.
    advanceVelocity(camera, { x: 0, y: 600, z: -10 })
    const ground = new Vector3(0, -600, -2000) // eye-relative, this frame
    const m = ndcMotion(ground)
    expect(m.y).toBeLessThan(0)
    expect(Math.abs(m.x)).toBeLessThan(1e-9)
    // Exact: previous NDC is the point's projection from the old eye.
    const prevRel = new Vector3(0, -600, -2010)
    const projected = (v: Vector3): number => { const c = v.clone().project(camera); return c.y }
    expect(m.y).toBeCloseTo(projected(ground) - projected(prevRel), 9)
  })

  it('follows a camera rotation with no translation', () => {
    const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 1e5)
    resetVelocity()
    advanceVelocity(camera, { x: 0, y: 600, z: 0 })
    camera.rotation.y = 0.01 // yaw left: the world slides right on screen
    advanceVelocity(camera, { x: 0, y: 600, z: 0 })
    expect(velocityState().eyeDelta.length()).toBe(0)
    expect(ndcMotion(new Vector3(0, 0, -1000)).x).toBeGreaterThan(0)
  })

  it('maps to the same previous UV as the cloud reprojection for a static point', () => {
    const camera = new PerspectiveCamera(60, 16 / 9, 0.1, 1e5)
    camera.rotation.set(0.04, -0.07, 0)
    const previousEye = { x: 100, y: 1200, z: -300 }
    const eye = { x: 104, y: 1201, z: -307 }
    resetVelocity()
    advanceVelocity(camera, previousEye)
    camera.rotation.set(0.06, -0.03, 0)
    advanceVelocity(camera, eye)

    const relative = new Vector3(300, -250, -4000)
    const motion = ndcMotion(relative)
    const current = relative.clone().project(camera)
    const historyFromMotion = {
      u: current.x * 0.5 + 0.5 - motion.x * 0.5,
      v: 0.5 - current.y * 0.5 + motion.y * 0.5,
    }
    const depthM = relative.length()
    const direction = relative.clone().divideScalar(depthM)
    const historyFromCloud = reprojectUv({
      dirWorld: { x: direction.x, y: direction.y, z: direction.z },
      depthM,
      eye,
      prevEye: previousEye,
      prevViewProjection: velocityState().previousViewProjection.toArray(),
    })!
    expect(historyFromMotion.u).toBeCloseTo(historyFromCloud.u, 9)
    expect(historyFromMotion.v).toBeCloseTo(historyFromCloud.v, 9)
  })
})
