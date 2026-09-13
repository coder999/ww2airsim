import { describe, it, expect } from 'vitest'
import { v3 } from '../../src/sim/math/vec3.js'
import { createState, DT, type Controls } from '../../src/sim/flight/model.js'
import {
  specificEnergyAirmass,
  assertFinite,
  assertNoEnergyGain,
  isIdleThrottle,
  stepChecked,
} from '../../src/sim/invariants.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const IDLE: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }

describe('airmass-frame specific energy (spec §11)', () => {
  it('ignores a uniform wind, unlike the ground frame', () => {
    const s = createState({ position: v3(0, 1000, 0), velocity: v3(100, 0, 0) })
    const still = specificEnergyAirmass(s, v3(0, 0, 0))
    const windy = specificEnergyAirmass({ ...s, velocity: v3(120, 0, 0) }, v3(20, 0, 0))
    expect(windy).toBeCloseTo(still, 6)
  })

  it('increases with altitude at constant airspeed', () => {
    const low = createState({ position: v3(0, 1000, 0), velocity: v3(100, 0, 0) })
    const high = createState({ position: v3(0, 3000, 0), velocity: v3(100, 0, 0) })
    expect(specificEnergyAirmass(high, v3(0, 0, 0)))
      .toBeGreaterThan(specificEnergyAirmass(low, v3(0, 0, 0)))
  })

  // Ruling R29: step() does not couple wind into the aerodynamics, so this
  // scenario runs in still air, where the airmass and ground frames coincide.
  // stepChecked's own doc comment explains why a windMps parameter here would
  // be meaningless -- it would assert a quantity the physics never produces.
  it('does not increase at idle throttle over a long glide', () => {
    let s = createState({ position: v3(0, 6000, 0), velocity: v3(120, 0, 0) })
    let prev = specificEnergyAirmass(s)
    for (let i = 0; i < 60 * 120; i++) {
      s = stepChecked(f6f, s, IDLE, DT)
      const e = specificEnergyAirmass(s)
      expect(e).toBeLessThanOrEqual(prev + 1e-3)
      prev = e
    }
  })

  it('allows energy to increase under thrust', () => {
    let s = createState({ position: v3(0, 1000, 0), velocity: v3(80, 0, 0) })
    const e0 = specificEnergyAirmass(s)
    for (let i = 0; i < 60 * 20; i++) {
      s = stepChecked(f6f, s, { pitch: 0, roll: 0, yaw: 0, throttle: 1 }, DT)
    }
    expect(specificEnergyAirmass(s)).toBeGreaterThan(e0)
  })
})

describe('assertFinite', () => {
  it('passes a valid state', () => {
    expect(() => assertFinite(createState({ velocity: v3(1, 2, 3) }), 'ok')).not.toThrow()
  })

  it('throws naming the field and context for a NaN', () => {
    const bad = { ...createState(), velocity: v3(Number.NaN, 0, 0) }
    expect(() => assertFinite(bad, 'my-context')).toThrow(/velocity\.x/)
    expect(() => assertFinite(bad, 'my-context')).toThrow(/my-context/)
  })

  it('throws for Infinity as well as NaN', () => {
    const bad = { ...createState(), position: v3(0, Number.POSITIVE_INFINITY, 0) }
    expect(() => assertFinite(bad, 'ctx')).toThrow(/position\.y/)
  })
})

// Ruling R30: with correct physics and no wind coupling, no reachable state
// from stepChecked's own call sites can actually trip this guard, so its
// throw path is tested directly here with synthetic before/after numbers
// rather than by staging a physics violation.
describe('assertNoEnergyGain', () => {
  it('does not throw when energy decreases', () => {
    expect(() => assertNoEnergyGain(100, 99, 'ctx')).not.toThrow()
  })

  it('does not throw for an exactly-equal pair', () => {
    expect(() => assertNoEnergyGain(100, 100, 'ctx')).not.toThrow()
  })

  it('does not throw for a gain below the epsilon', () => {
    expect(() => assertNoEnergyGain(100, 100 + 0.5e-3, 'ctx')).not.toThrow()
  })

  it('throws for a gain above the epsilon, naming the context', () => {
    expect(() => assertNoEnergyGain(100, 101, 'my-context')).toThrow(/my-context/)
  })
})

describe('isIdleThrottle', () => {
  it('is true for throttle 0', () => {
    expect(isIdleThrottle({ pitch: 0, roll: 0, yaw: 0, throttle: 0 })).toBe(true)
  })

  it('is true for a negative throttle, which the physics clamps to 0', () => {
    expect(isIdleThrottle({ pitch: 0, roll: 0, yaw: 0, throttle: -5 })).toBe(true)
  })

  it('is true for a NaN throttle, unlike a strict === 0 check', () => {
    expect(isIdleThrottle({ pitch: 0, roll: 0, yaw: 0, throttle: Number.NaN })).toBe(true)
  })

  it('is false for a positive throttle', () => {
    expect(isIdleThrottle({ pitch: 0, roll: 0, yaw: 0, throttle: 0.5 })).toBe(false)
  })
})
