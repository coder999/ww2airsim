import { describe, it, expect } from 'vitest'
import { v3 } from '../../../src/sim/math/vec3.js'
import { qIdentity } from '../../../src/sim/math/quat.js'
import { createState, step, commandedBodyRates, DT, type Controls }
  from '../../../src/sim/flight/model.js'
import { loadAircraftSpec } from '../../../src/sim/content.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const FULL_ROLL: Controls = { pitch: 0, roll: 1, yaw: 0, throttle: 0.5 }
const NEUTRAL: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.5 }
const degs = (r: number) => (r * 180) / Math.PI

describe('rate-command moments (spec §5)', () => {
  it('achieves near maximum roll rate at or above the reference speed', () => {
    const s = createState({ position: v3(0, 1000, 0), velocity: v3(f6f.rates.rateRefSpeedMps, 0, 0) })
    const rates = commandedBodyRates(f6f, s, FULL_ROLL)
    expect(degs(rates.x)).toBeGreaterThan(f6f.rates.maxRollRateDegPerSec * 0.9)
    expect(degs(rates.x)).toBeLessThanOrEqual(f6f.rates.maxRollRateDegPerSec * 1.001)
  })

  it('caps the rate rather than growing without bound at very high speed', () => {
    const s = createState({ position: v3(0, 1000, 0), velocity: v3(400, 0, 0) })
    expect(degs(commandedBodyRates(f6f, s, FULL_ROLL).x))
      .toBeLessThanOrEqual(f6f.rates.maxRollRateDegPerSec * 1.001)
  })

  it('gives mushy controls at low speed: much less roll authority', () => {
    const slow = createState({ position: v3(0, 1000, 0), velocity: v3(40, 0, 0) })
    const fast = createState({ position: v3(0, 1000, 0), velocity: v3(150, 0, 0) })
    const slowRate = degs(commandedBodyRates(f6f, slow, FULL_ROLL).x)
    const fastRate = degs(commandedBodyRates(f6f, fast, FULL_ROLL).x)
    expect(slowRate).toBeLessThan(fastRate * 0.5)
    expect(slowRate).toBeGreaterThan(0)
  })

  it('gives almost no authority at a standstill', () => {
    const s = createState({ position: v3(0, 0, 0), velocity: v3(0, 0, 0) })
    expect(Math.abs(degs(commandedBodyRates(f6f, s, FULL_ROLL).x))).toBeLessThan(2)
  })

  it('loses authority with altitude at equal true airspeed', () => {
    const low = createState({ position: v3(0, 0, 0), velocity: v3(120, 0, 0) })
    const high = createState({ position: v3(0, 9000, 0), velocity: v3(120, 0, 0) })
    expect(degs(commandedBodyRates(f6f, high, FULL_ROLL).x))
      .toBeLessThan(degs(commandedBodyRates(f6f, low, FULL_ROLL).x))
  })

  it('holds attitude with neutral input', () => {
    let s = createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0), attitude: qIdentity() })
    for (let i = 0; i < 60; i++) s = step(f6f, s, NEUTRAL, DT)
    expect(Math.abs(s.attitude.x)).toBeLessThan(0.02)
    expect(Math.abs(s.attitude.z)).toBeLessThan(0.15)
  })

  it('actually rolls the aircraft when roll is commanded', () => {
    let s = createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0), attitude: qIdentity() })
    for (let i = 0; i < 30; i++) s = step(f6f, s, FULL_ROLL, DT)
    expect(Math.abs(s.attitude.x)).toBeGreaterThan(0.05)
  })

  it('never produces non-finite rates for any control input or speed', () => {
    for (const speed of [0, 1, 50, 200, 500]) {
      for (const input of [-1, -0.5, 0, 0.5, 1]) {
        const s = createState({ position: v3(0, 1000, 0), velocity: v3(speed, 0, 0) })
        const r = commandedBodyRates(f6f, s, { pitch: input, roll: input, yaw: input, throttle: 0.5 })
        expect([r.x, r.y, r.z].every(Number.isFinite)).toBe(true)
      }
    }
  })
})
