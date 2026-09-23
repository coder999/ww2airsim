import { describe, expect, it } from 'vitest'
import { controlsForDesiredVelocity } from '../../../src/sim/ai/controller.js'
import { createState } from '../../../src/sim/flight/state.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const state = createState({ velocity: v3(100, 0, 0) })

describe('desired-velocity flight controller', () => {
  it('keeps a level forward vector neutral, pitches toward vertical error and banks toward lateral error', () => {
    const ahead = controlsForDesiredVelocity(state, f6f, v3(100, 0, 0))
    expect(ahead.roll).toBeCloseTo(0, 12)
    expect(ahead.pitch).toBeCloseTo(0, 12)
    expect(ahead.yaw).toBeCloseTo(0, 12)

    expect(controlsForDesiredVelocity(state, f6f, v3(100, 20, 0)).pitch).toBeGreaterThan(0)
    expect(controlsForDesiredVelocity(state, f6f, v3(100, -20, 0)).pitch).toBeLessThan(0)
    const right = controlsForDesiredVelocity(state, f6f, v3(100, 0, 20))
    expect(right.roll).toBeGreaterThan(0)
    expect(right.yaw).toBeGreaterThan(0)
    const left = controlsForDesiredVelocity(state, f6f, v3(100, 0, -20))
    expect(left.roll).toBeLessThan(0)
    expect(left.yaw).toBeLessThan(0)
  })

  it('opposes roll, pitch and yaw rates with the derivative terms', () => {
    const rolling = createState({ ...state, bodyRates: v3(0.5, 0, 0) })
    const pitching = createState({ ...state, bodyRates: v3(0, 0, 0.5) })
    const yawingRight = createState({ ...state, bodyRates: v3(0, -0.5, 0) })
    expect(controlsForDesiredVelocity(rolling, f6f, v3(100, 0, 0)).roll).toBeLessThan(0)
    expect(controlsForDesiredVelocity(pitching, f6f, v3(100, 0, 0)).pitch).toBeLessThan(0)
    expect(controlsForDesiredVelocity(yawingRight, f6f, v3(100, 0, 0)).yaw).toBeLessThan(0)
  })

  it('levels an existing bank when the desired vector is straight ahead', () => {
    const banked = createState({
      velocity: v3(100, 0, 0),
      attitude: qFromAxisAngle(v3(1, 0, 0), Math.PI / 4),
    })
    expect(controlsForDesiredVelocity(banked, f6f, v3(100, 0, 0)).roll).toBeLessThan(0)
  })

  it('adds throttle for a faster vector and removes it for a slower one', () => {
    const faster = controlsForDesiredVelocity(state, f6f, v3(150, 0, 0))
    const slower = controlsForDesiredVelocity(state, f6f, v3(60, 0, 0))
    expect(faster.throttle).toBeGreaterThan(slower.throttle)
  })

  it('returns finite bounded player controls for zero and extreme vectors', () => {
    for (const desired of [v3(0, 0, 0), v3(-1e30, 1e30, -1e30)]) {
      const c = controlsForDesiredVelocity(state, f6f, desired)
      for (const axis of [c.pitch, c.roll, c.yaw]) {
        expect(Number.isFinite(axis)).toBe(true)
        expect(axis).toBeGreaterThanOrEqual(-1)
        expect(axis).toBeLessThanOrEqual(1)
      }
      expect(Number.isFinite(c.throttle)).toBe(true)
      expect(c.throttle).toBeGreaterThanOrEqual(0)
      expect(c.throttle).toBeLessThanOrEqual(1)
    }
  })
})
