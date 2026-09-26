import { describe, expect, it } from 'vitest'
import {
  LIFT_VECTOR_HANDOFF_RAD, controlsForLiftVector, pitchCommandForLoadFactor, pitchPerUnitCommand, steerToward,
} from '../../../src/sim/ai/liftVector.js'
import { controlsForDesiredVelocity } from '../../../src/sim/ai/controller.js'
import { createState } from '../../../src/sim/flight/state.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const zero = loadAircraftSpec('a6m2-zero')
const level = createState({ position: v3(0, 3000, 0), velocity: v3(120, 0, 0) })
const inverted = createState({ ...level, attitude: qFromAxisAngle(v3(1, 0, 0), Math.PI) })
const G = 9.80665

describe('controlsForLiftVector (7c spec §3.4)', () => {
  it('lift straight up, wings level: no roll, and a pull', () => {
    const c = controlsForLiftVector(level, f6f, v3(0, 1, 0), 3, 1)
    expect(c.roll).toBeCloseTo(0, 9)
    expect(c.pitch).toBeGreaterThan(0)
  })

  it('lift to the right rolls right, to the left rolls left', () => {
    expect(controlsForLiftVector(level, f6f, v3(0, 0.2, 1), 3, 1).roll).toBeGreaterThan(0)
    expect(controlsForLiftVector(level, f6f, v3(0, 0.2, -1), 3, 1).roll).toBeLessThan(0)
  })

  it('lift straight down from wings level commands a full roll, not zero (7a\'s atan2 lesson), and never pushes', () => {
    const c = controlsForLiftVector(level, f6f, v3(0, -1, 0), 3, 1)
    expect(Math.abs(c.roll)).toBe(1)
    expect(c.pitch).toBeGreaterThanOrEqual(0)
  })

  it('already inverted with lift down: no roll, and a pull toward the ground', () => {
    const c = controlsForLiftVector(inverted, f6f, v3(0, -1, 0), 3, 1)
    expect(Math.abs(c.roll)).toBeLessThan(0.05)
    expect(c.pitch).toBeGreaterThan(0)
  })

  it('damping opposes body rates', () => {
    const rolling = createState({ ...level, bodyRates: v3(0.5, 0, 0) })
    const yawing = createState({ ...level, bodyRates: v3(0, -0.5, 0) })
    expect(controlsForLiftVector(rolling, f6f, v3(0, 1, 0), 1, 1).roll).toBeLessThan(0)
    expect(controlsForLiftVector(yawing, f6f, v3(0, 1, 0), 1, 1).yaw).toBeLessThan(0)
  })

  it('stays finite and clamped for a stopped airplane, a zero lift vector and absurd inputs', () => {
    const stopped = createState({ position: v3(0, 3000, 0), velocity: v3(0, 0, 0) })
    for (const c of [
      controlsForLiftVector(stopped, f6f, v3(0, 1, 0), 5, 1),
      controlsForLiftVector(level, f6f, v3(0, 0, 0), 5, 1),
      controlsForLiftVector(level, f6f, v3(-1, 0, 0), 99, 7),
      controlsForLiftVector(level, f6f, v3(Number.NaN, 1, 0), 5, 1),
    ]) {
      for (const k of ['roll', 'pitch', 'yaw', 'throttle'] as const) {
        expect(Number.isFinite(c[k])).toBe(true)
        expect(Math.abs(c[k])).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('pitchCommandForLoadFactor', () => {
  it('1 g wings level asks for no pitch rate', () => {
    expect(pitchCommandForLoadFactor(level, f6f, 1)).toBeCloseTo(0, 12)
  })

  it('commands the pitch rate whose V x omega / g + 1 equals the asked load', () => {
    const p = pitchCommandForLoadFactor(level, f6f, 4)!
    expect(120 * p * pitchPerUnitCommand(level, f6f) / G + 1).toBeCloseTo(4, 9)
  })

  it('sees the Zero\'s control fade: above 250 mph EAS a unit command buys less pitch rate', () => {
    const slow = createState({ position: v3(0, 0, 0), velocity: v3(100, 0, 0) })
    const fast = createState({ position: v3(0, 0, 0), velocity: v3(150, 0, 0) })
    expect(pitchPerUnitCommand(fast, zero)).toBeLessThan(pitchPerUnitCommand(slow, zero))
  })

  it('is null below any pitch authority', () => {
    expect(pitchCommandForLoadFactor(createState({ velocity: v3(0, 0, 0) }), f6f, 3)).toBeNull()
  })
})

describe('steerToward', () => {
  it('within the handoff angle it IS the velocity controller, bit for bit', () => {
    const desired = v3(120, 0, 120 * Math.tan(LIFT_VECTOR_HANDOFF_RAD * 0.5))
    expect(steerToward(level, f6f, desired, 6.75)).toEqual(controlsForDesiredVelocity(level, f6f, desired))
  })

  it('beyond it, a target behind is a pull round, never a push', () => {
    const c = steerToward(level, f6f, v3(-120, -30, 5), 6.75)
    expect(c).not.toEqual(controlsForDesiredVelocity(level, f6f, v3(-120, -30, 5)))
    expect(c.pitch).toBeGreaterThanOrEqual(0)
  })
})
