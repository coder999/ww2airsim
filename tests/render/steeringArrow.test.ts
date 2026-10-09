import { describe, expect, it } from 'vitest'
import { arrowPosition, arrowScreenAngle, MARKER_ENTER, MARKER_EXIT, nextSteeringMode } from '../../src/render/scene/steeringArrow.js'

// Level, nose along +x (sim/three body frame), at the origin.
const LEVEL = { x: 0, y: 0, z: 0, w: 1 }
// Yawed 90 deg left: nose along -z.
const NOSE_NORTH = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }
const O = { x: 0, y: 0, z: 0 }

describe('arrowPosition', () => {
  it('floats ahead of the nose and above its line, wherever the nose points', () => {
    const p = arrowPosition(O, LEVEL)
    expect(p.x).toBeGreaterThan(0)
    expect(p.y).toBeGreaterThan(0)
    expect(p.z).toBeCloseTo(0, 9)
    const n = arrowPosition(O, NOSE_NORTH)
    expect(n.z).toBeCloseTo(-p.x, 6)
    expect(n.x).toBeCloseTo(0, 6)
  })
})

describe('arrowScreenAngle', () => {
  // Rolling the arrow's +y tip by the angle about +z must land on the screen direction.
  const tip = (a: number) => ({ x: -Math.sin(a), y: Math.cos(a) })
  it('points up, right, down and left along the destination\'s screen direction', () => {
    for (const d of [{ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: -1, y: 0 }, { x: 3, y: 4 }]) {
      const t = tip(arrowScreenAngle(d)), n = Math.hypot(d.x, d.y)
      expect(t.x).toBeCloseTo(d.x / n, 9)
      expect(t.y).toBeCloseTo(d.y / n, 9)
    }
  })
  it('points down for a destination dead behind, along the view axis', () => {
    expect(tip(arrowScreenAngle({ x: 0, y: 0 })).y).toBeCloseTo(-1, 9)
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
