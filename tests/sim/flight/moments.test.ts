import { describe, it, expect } from 'vitest'
import { v3 } from '../../../src/sim/math/vec3.js'
import { qIdentity, qRotate } from '../../../src/sim/math/quat.js'
import { createState, step, commandedBodyRates, DT, type Controls }
  from '../../../src/sim/flight/model.js'
import { assertFinite } from '../../../src/sim/invariants.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

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
    for (let i = 0; i < 60; i++) s = step(f6f, s, NEUTRAL, { dt: DT, tick: i + 1 })
    expect(Math.abs(s.attitude.x)).toBeLessThan(0.02)
    expect(Math.abs(s.attitude.z)).toBeLessThan(0.15)
  })

  it('actually rolls the aircraft when roll is commanded', () => {
    let s = createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0), attitude: qIdentity() })
    for (let i = 0; i < 30; i++) s = step(f6f, s, FULL_ROLL, { dt: DT, tick: i + 1 })
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

describe('control sign conventions (Important 1)', () => {
  // Body axes: +X forward, +Y up, +Z right. A positive rotation rate about
  // +Y (right-hand rule) turns +X toward -Z (nose LEFT) -- the opposite of
  // the documented "yaw > 0 = nose right" convention -- so commandedBodyRates
  // must negate the yaw term. Roll and pitch need no such fix; these three
  // tests pin all three signs down so this doesn't silently invert again.
  const AT_SPEED = createState({ position: v3(0, 2000, 0), velocity: v3(150, 0, 0), attitude: qIdentity() })

  it('positive yaw input turns the nose toward +Z (right), not -Z (left)', () => {
    let s = { ...AT_SPEED }
    const yawRight: Controls = { pitch: 0, roll: 0, yaw: 1, throttle: 0.5 }
    for (let i = 0; i < 30; i++) s = step(f6f, s, yawRight, { dt: DT, tick: i + 1 })
    const forward = qRotate(s.attitude, v3(1, 0, 0))
    expect(forward.z).toBeGreaterThan(0)
  })

  it('negative yaw input turns the nose toward -Z (left)', () => {
    let s = { ...AT_SPEED }
    const yawLeft: Controls = { pitch: 0, roll: 0, yaw: -1, throttle: 0.5 }
    for (let i = 0; i < 30; i++) s = step(f6f, s, yawLeft, { dt: DT, tick: i + 1 })
    const forward = qRotate(s.attitude, v3(1, 0, 0))
    expect(forward.z).toBeLessThan(0)
  })

  it('positive roll input rolls right (attitude.x > 0)', () => {
    let s = { ...AT_SPEED }
    const rollRight: Controls = { pitch: 0, roll: 1, yaw: 0, throttle: 0.5 }
    for (let i = 0; i < 30; i++) s = step(f6f, s, rollRight, { dt: DT, tick: i + 1 })
    expect(s.attitude.x).toBeGreaterThan(0)
  })

  it('positive pitch input raises the nose (forward.y > 0)', () => {
    let s = { ...AT_SPEED }
    const pitchUp: Controls = { pitch: 1, roll: 0, yaw: 0, throttle: 0.5 }
    for (let i = 0; i < 30; i++) s = step(f6f, s, pitchUp, { dt: DT, tick: i + 1 })
    const forward = qRotate(s.attitude, v3(1, 0, 0))
    expect(forward.y).toBeGreaterThan(0)
  })
})

describe('control input sanitisation (Important 4)', () => {
  const BASE = createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0) })
  // Finding I7: this hand-copied all 14 fields of `invariants.ts`'s canonical
  // FIELDS list. Correct at the time, but a fourth copy of a list that has
  // already drifted elsewhere -- and `assertFinite` is the module written for
  // exactly this, so it names the offending field on failure too.

  it('leaves the state finite when every control channel is NaN', () => {
    const bad: Controls = { pitch: NaN, roll: NaN, yaw: NaN, throttle: NaN }
    const s1 = step(f6f, BASE, bad, { dt: DT, tick: 1 })
    expect(() => assertFinite(s1, 'all-NaN controls')).not.toThrow()
  })

  it('leaves the state finite for wildly out-of-range control input', () => {
    const wild: Controls = { pitch: 999, roll: -999, yaw: 1e12, throttle: -Infinity }
    const s1 = step(f6f, BASE, wild, { dt: DT, tick: 1 })
    expect(() => assertFinite(s1, 'out-of-range controls')).not.toThrow()
  })

  it('clamps an out-of-range channel to the same rate as the clamped-in-range boundary', () => {
    const over = commandedBodyRates(f6f, BASE, { pitch: 0, roll: 999, yaw: 0, throttle: 0.5 })
    const atBound = commandedBodyRates(f6f, BASE, { pitch: 0, roll: 1, yaw: 0, throttle: 0.5 })
    expect(over.x).toBeCloseTo(atBound.x, 9)
  })

  it('saturates throttle at 1: throttle=5 gives the same thrust as throttle=1', () => {
    const t1 = step(f6f, BASE, { pitch: 0, roll: 0, yaw: 0, throttle: 1 }, { dt: DT, tick: 1 })
    const t5 = step(f6f, BASE, { pitch: 0, roll: 0, yaw: 0, throttle: 5 }, { dt: DT, tick: 1 })
    expect(t5.velocity.x).toBeCloseTo(t1.velocity.x, 9)
  })

  it('clamps negative throttle to 0 rather than producing reverse thrust', () => {
    const negative = step(f6f, BASE, { pitch: 0, roll: 0, yaw: 0, throttle: -3 }, { dt: DT, tick: 1 })
    const idle = step(f6f, BASE, { pitch: 0, roll: 0, yaw: 0, throttle: 0 }, { dt: DT, tick: 1 })
    expect(negative.velocity.x).toBeCloseTo(idle.velocity.x, 9)
  })
})
