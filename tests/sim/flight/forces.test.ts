import { describe, it, expect } from 'vitest'
import { v3, length } from '../../../src/sim/math/vec3.js'
import { qIdentity } from '../../../src/sim/math/quat.js'
import { createState, step, airspeed, angleOfAttack, DT, type Controls }
  from '../../../src/sim/flight/model.js'
import { loadAircraftSpec } from '../../../src/sim/content.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const NEUTRAL: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }

describe('flight integrator: forces', () => {
  it('accelerates downward in free fall with no airspeed', () => {
    const s0 = createState({ position: v3(0, 5000, 0), velocity: v3(0, 0, 0) })
    const s1 = step(f6f, s0, NEUTRAL, DT)
    expect(s1.velocity.y).toBeLessThan(0)
    expect(s1.velocity.y).toBeCloseTo(-9.80665 * DT, 3)
  })

  it('never produces a non-finite state over a long run', () => {
    let s = createState({ position: v3(0, 3000, 0), velocity: v3(120, 0, 0) })
    for (let i = 0; i < 60 * 300; i++) {
      s = step(f6f, s, { pitch: 0, roll: 0, yaw: 0, throttle: 0.8 }, DT)
      const all = [s.position.x, s.position.y, s.position.z, s.velocity.x, s.velocity.y,
        s.velocity.z, s.attitude.x, s.attitude.y, s.attitude.z, s.attitude.w, s.fuelKg]
      expect(all.every(Number.isFinite)).toBe(true)
    }
  })

  it('reaches a terminal velocity in a vertical power-off dive', () => {
    let s = createState({
      position: v3(0, 8000, 0),
      velocity: v3(0, -60, 0),
      attitude: qIdentity(),
    })
    for (let i = 0; i < 60 * 120; i++) {
      s = step(f6f, s, NEUTRAL, DT)
      if (s.position.y <= 0) break
    }
    const speed = airspeed(s)
    expect(speed).toBeGreaterThan(60)
    expect(speed).toBeLessThan(400)
  })

  it('produces more thrust at sea level than at high altitude for equal throttle', () => {
    const low = createState({ position: v3(0, 0, 0), velocity: v3(100, 0, 0) })
    const high = createState({ position: v3(0, 11000, 0), velocity: v3(100, 0, 0) })
    const full: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 1 }
    const dLow = step(f6f, low, full, DT).velocity.x - low.velocity.x
    const dHigh = step(f6f, high, full, DT).velocity.x - high.velocity.x
    expect(dLow).toBeGreaterThan(dHigh)
  })

  it('burns fuel at full throttle and not at idle', () => {
    const s0 = createState({ position: v3(0, 1000, 0), velocity: v3(120, 0, 0), fuelKg: 600 })
    const burned = s0.fuelKg - step(f6f, s0, { pitch: 0, roll: 0, yaw: 0, throttle: 1 }, DT).fuelKg
    const idle = s0.fuelKg - step(f6f, s0, NEUTRAL, DT).fuelKg
    expect(burned).toBeGreaterThan(0)
    expect(burned).toBeGreaterThan(idle)
  })

  it('computes zero angle of attack for velocity along the body X axis', () => {
    const s = createState({ velocity: v3(100, 0, 0), attitude: qIdentity() })
    expect(angleOfAttack(s)).toBeCloseTo(0, 6)
  })

  it('computes positive angle of attack when descending through level attitude', () => {
    const s = createState({ velocity: v3(100, -10, 0), attitude: qIdentity() })
    expect(angleOfAttack(s)).toBeGreaterThan(0)
  })

  it('is deterministic: identical inputs give identical output', () => {
    const run = () => {
      let s = createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0) })
      for (let i = 0; i < 600; i++) s = step(f6f, s, { pitch: 0.2, roll: 0.1, yaw: 0, throttle: 0.7 }, DT)
      return s
    }
    expect(run()).toEqual(run())
  })

  it('conserves speed within tolerance in level flight at trim', () => {
    // Straight and level at 130 m/s with enough throttle to hold it: speed
    // should not run away in either direction over 30 seconds.
    let s = createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0) })
    for (let i = 0; i < 60 * 30; i++) s = step(f6f, s, { pitch: 0, roll: 0, yaw: 0, throttle: 0.75 }, DT)
    expect(length(s.velocity)).toBeGreaterThan(40)
    expect(length(s.velocity)).toBeLessThan(300)
  })
})
