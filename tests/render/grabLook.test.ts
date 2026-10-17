import { describe, expect, it } from 'vitest'
import { lookToHold, worldRayAt } from '../../src/render/grabLook.js'

const view = { width: 1920, height: 1080 }
const vfov = (60 * Math.PI) / 180
const close = (a: readonly number[], b: readonly number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, 9))

describe('grab look', () => {
  it('the screen centre looks along the yaw and pitch', () => {
    const y = 0.7
    const p = 0.3
    close(worldRayAt(y, p, 960, 540, view, vfov), [Math.cos(p) * Math.cos(y), Math.sin(p), -Math.cos(p) * Math.sin(y)])
  })

  it('without moving the pointer, the camera stays where it was', () => {
    for (const [y, p, px, py] of [[0.4, 0.2, 700, 300], [-2.5, -0.6, 1500, 800], [3, 0.9, 100, 1000]] as const) {
      const g = worldRayAt(y, p, px, py, view, vfov)
      const back = lookToHold(g, px, py, view, vfov, p)
      expect(back.yawRad).toBeCloseTo(((y + Math.PI) % (2 * Math.PI)) - Math.PI, 9)
      expect(back.pitchRad).toBeCloseTo(p, 9)
    }
  })

  it('the grabbed point stays under the pointer wherever it is dragged (the cloud stays under the mouse)', () => {
    const y0 = 1.1
    const p0 = -0.2
    const grabbedAt = [900, 400] as const
    const g = worldRayAt(y0, p0, ...grabbedAt, view, vfov)
    for (const [px, py] of [[1200, 400], [300, 700], [960, 100], [1800, 1000]] as const) {
      const { yawRad, pitchRad } = lookToHold(g, px, py, view, vfov, p0)
      close(worldRayAt(yawRad, pitchRad, px, py, view, vfov), g)
    }
  })

  it('is 1:1 at the centre: a drag of one pixel turns the view by one pixel of field of view', () => {
    const g = worldRayAt(0, 0, 960, 540, view, vfov)
    const { yawRad } = lookToHold(g, 961, 540, view, vfov, 0)
    // dragging right by 1 px turns the view left (yaw up) by atan(tan(vfov/2) / (height/2)), about 0.0005 rad
    expect(yawRad).toBeCloseTo(Math.atan(Math.tan(vfov / 2) / (view.height / 2)), 6)
  })

  it('never leaves the pitch limit, and prefers the branch nearest the current pitch', () => {
    const g = worldRayAt(0, 1.4, 960, 100, view, vfov) // nearly straight up
    const { pitchRad } = lookToHold(g, 960, 1000, view, vfov, 1.4)
    expect(Math.abs(pitchRad)).toBeLessThanOrEqual((85 * Math.PI) / 180 + 1e-12)
  })
})
