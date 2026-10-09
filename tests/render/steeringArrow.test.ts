import { describe, expect, it } from 'vitest'
import { arrowPose, MARKER_ENTER, MARKER_EXIT, nextSteeringMode } from '../../src/render/scene/steeringArrow.js'

// Level, nose along +x (sim/three body frame), at the origin.
const LEVEL = { x: 0, y: 0, z: 0, w: 1 }
// Yawed 90 deg left: nose along -z.
const NOSE_NORTH = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }
const O = { x: 0, y: 0, z: 0 }

describe('arrowPose', () => {
  it('floats ahead of the nose and above its line, wherever the nose points', () => {
    const p = arrowPose(O, LEVEL, { x: 10000, y: 0, z: 0 }).position
    expect(p.x).toBeGreaterThan(0)
    expect(p.y).toBeGreaterThan(0)
    expect(p.z).toBeCloseTo(0, 9)
    const n = arrowPose(O, NOSE_NORTH, { x: 0, y: 0, z: -10000 }).position
    expect(n.z).toBeCloseTo(-p.x, 6)
    expect(n.x).toBeCloseTo(0, 6)
  })

  it('points at the destination: ahead, right, behind', () => {
    const far = 20000
    expect(arrowPose(O, LEVEL, { x: far, y: 0, z: 0 }).direction.x).toBeGreaterThan(0.99)
    expect(arrowPose(O, LEVEL, { x: 0, y: 0, z: far }).direction.z).toBeGreaterThan(0.99)
    expect(arrowPose(O, LEVEL, { x: -far, y: 0, z: 0 }).direction.x).toBeLessThan(-0.99)
    const up = arrowPose(O, LEVEL, { x: 0, y: far, z: 0 }).direction
    expect(Math.hypot(up.x, up.y, up.z)).toBeCloseTo(1, 9)
    expect(up.y).toBeGreaterThan(0.99)
  })
})

describe('nextSteeringMode', () => {
  it('is the arrow while the destination is behind the camera', () => {
    expect(nextSteeringMode('marker', null)).toBe('arrow')
  })

  it('switches to the marker inside the enter margin and back past the exit margin, with no flicker between', () => {
    const between = (MARKER_ENTER + MARKER_EXIT) / 2
    expect(nextSteeringMode('arrow', { x: 0, y: 0 })).toBe('marker')
    expect(nextSteeringMode('arrow', { x: between, y: 0 })).toBe('arrow')
    expect(nextSteeringMode('marker', { x: between, y: 0 })).toBe('marker')
    expect(nextSteeringMode('marker', { x: 0, y: -(MARKER_EXIT + 0.01) })).toBe('arrow')
  })
})
