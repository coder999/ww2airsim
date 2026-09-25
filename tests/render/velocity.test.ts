import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3, Vector4 } from 'three'
import { advanceVelocity, resetVelocity, velocityState } from '../../src/render/scene/velocity.js'

/** CPU mirror of `worldFixedVelocity`: NDC now minus NDC previous for the
 *  eye-relative position `rel`. */
function ndcMotion(rel: Vector3): { x: number; y: number } {
  const { viewProjection, previousViewProjection, eyeDelta } = velocityState()
  const now = new Vector4(rel.x, rel.y, rel.z, 1).applyMatrix4(viewProjection)
  const prev = new Vector4(rel.x + eyeDelta.x, rel.y + eyeDelta.y, rel.z + eyeDelta.z, 1).applyMatrix4(previousViewProjection)
  return { x: now.x / now.w - prev.x / prev.w, y: now.y / now.w - prev.y / prev.w }
}

describe('world-fixed motion vectors (photoreal Task 6)', () => {
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
})
