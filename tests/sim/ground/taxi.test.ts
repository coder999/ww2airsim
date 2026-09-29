import { describe, expect, it } from 'vitest'
import { DT, type Controls } from '../../../src/sim/flight/model.js'
import { attitudeAngles } from '../../../src/sim/flight/attitude.js'
import { headingDeg, speedOf, taxi } from './run.js'

describe('Hellcat taxi under power with full rudder (the 2026-09-17 failure)', () => {
  const controls: Controls = { pitch: 0, roll: 0, yaw: 1, throttle: 0.6, gearDown: true }
  const { trace } = taxi('f6f-hellcat', controls, 12)

  it('is still turning at 15 m/s, not near zero', () => {
    const i = trace.findIndex((s) => speedOf(s) >= 15)
    expect(i, 'never reached 15 m/s').toBeGreaterThan(10)
    const rate = Math.abs(headingDeg(trace[i]!) - headingDeg(trace[i - 10]!)) / (10 * DT)
    expect(rate).toBeGreaterThanOrEqual(3)
  })

  it('stays on its wheels, never rolls, never pitches below level', () => {
    for (const s of trace) {
      const a = attitudeAngles(s)
      expect(Math.abs(a.rollRad)).toBeLessThan(1e-6)
      expect(a.pitchRad).toBeGreaterThanOrEqual(-1e-6)
    }
  })
})

describe('take-off roll with the stick neutral', () => {
  const { trace, rest } = taxi('f6f-hellcat', { pitch: 0, roll: 0, yaw: 0, throttle: 1, gearDown: true }, 14)
  const end = trace[trace.length - 1]!

  it('starts at the rest attitude and lifts the tail as the airplane accelerates', () => {
    expect(attitudeAngles(trace[0]!).pitchRad).toBeCloseTo(rest, 6)
    const last = attitudeAngles(end).pitchRad
    expect(last).toBeLessThan(rest * 0.25)
  })

  it('swings a bounded amount at full power with no correction (torque), not a ground loop', () => {
    expect(Math.abs(headingDeg(end))).toBeGreaterThan(0.5)
    expect(Math.abs(headingDeg(end))).toBeLessThan(30)
  })
})
