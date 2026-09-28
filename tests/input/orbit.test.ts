import { describe, it, expect } from 'vitest'
import {
  ORBIT_ZERO, NO_MOUSE, orbitFromMouse, wheelNotches, addMouse,
  ORBIT_RAD_PER_PX, ORBIT_PITCH_MIN_RAD, ORBIT_PITCH_MAX_RAD, ORBIT_ZOOM_MIN, ORBIT_ZOOM_MAX,
} from '../../src/input/orbit.js'

const drag = (dxPx: number, dyPx: number) => ({ ...NO_MOUSE, dxPx, dyPx })

/** Orbit camera spec §4 and its plan's rulings P-1 (pitch range) and P-4 (signs). */
describe('orbitFromMouse', () => {
  it('returns the identical object when nothing moved', () => {
    const o = { yawRad: 0.3, pitchRad: 0.1, zoom: 2 }
    expect(orbitFromMouse(o, NO_MOUSE)).toBe(o)
  })
  it('0.3 deg per pixel; drag right = +yaw, drag down = +pitch (ruling P-4)', () => {
    expect(ORBIT_RAD_PER_PX).toBeCloseTo((0.3 * Math.PI) / 180, 12)
    const o = orbitFromMouse(ORBIT_ZERO, drag(100, 50))
    expect(o.yawRad).toBeCloseTo(100 * ORBIT_RAD_PER_PX, 12)
    expect(o.pitchRad).toBeCloseTo(50 * ORBIT_RAD_PER_PX, 12)
  })
  it('clamps pitch to [-80, +60] degrees (ruling P-1) under extreme drags', () => {
    expect(orbitFromMouse(ORBIT_ZERO, drag(0, 1e6)).pitchRad).toBe(ORBIT_PITCH_MAX_RAD)
    expect(orbitFromMouse(ORBIT_ZERO, drag(0, -1e6)).pitchRad).toBe(ORBIT_PITCH_MIN_RAD)
    expect(ORBIT_PITCH_MAX_RAD).toBeCloseTo((60 * Math.PI) / 180, 12)
    expect(ORBIT_PITCH_MIN_RAD).toBeCloseTo((-80 * Math.PI) / 180, 12)
  })
  it('wraps yaw into (-PI, PI] so it never grows without bound', () => {
    const o = orbitFromMouse(ORBIT_ZERO, drag(1e6, 0))
    expect(o.yawRad).toBeGreaterThan(-Math.PI)
    expect(o.yawRad).toBeLessThanOrEqual(Math.PI)
  })
  it('x1.1 per notch, scroll down zooms out, clamped to [0.4, 4]', () => {
    expect(orbitFromMouse(ORBIT_ZERO, { ...NO_MOUSE, wheelNotches: 1 }).zoom).toBeCloseTo(1.1, 12)
    expect(orbitFromMouse(ORBIT_ZERO, { ...NO_MOUSE, wheelNotches: -1 }).zoom).toBeCloseTo(1 / 1.1, 12)
    expect(orbitFromMouse(ORBIT_ZERO, { ...NO_MOUSE, wheelNotches: 1e4 }).zoom).toBe(ORBIT_ZOOM_MAX)
    expect(orbitFromMouse(ORBIT_ZERO, { ...NO_MOUSE, wheelNotches: -1e4 }).zoom).toBe(ORBIT_ZOOM_MIN)
  })
  it('reset returns ORBIT_ZERO even with movement in the same frame', () => {
    expect(orbitFromMouse({ yawRad: 1, pitchRad: 1, zoom: 3 }, { dxPx: 50, dyPx: 5, wheelNotches: 2, reset: true })).toBe(ORBIT_ZERO)
  })
})

describe('wheelNotches', () => {
  it('pixel mode: 100 px per notch; line mode: 3 lines; page mode: 1 page', () => {
    expect(wheelNotches(100, 0)).toBe(1)
    expect(wheelNotches(-300, 0)).toBe(-3)
    expect(wheelNotches(3, 1)).toBe(1)
    expect(wheelNotches(1, 2)).toBe(1)
  })
})

describe('addMouse', () => {
  it('sums movement and ORs reset', () => {
    expect(addMouse(drag(3, 4), { dxPx: 1, dyPx: -2, wheelNotches: 0.5, reset: true }))
      .toEqual({ dxPx: 4, dyPx: 2, wheelNotches: 0.5, reset: true })
  })
})
