import { describe, it, expect } from 'vitest'
import { v3 } from '../../src/sim/math/vec3.js'
import { createState, DT, type Controls } from '../../src/sim/flight/model.js'
import { specificEnergyAirmass, assertFinite, stepChecked } from '../../src/sim/invariants.js'
import { loadAircraftSpec } from '../../src/sim/content.js'

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

  it('does not increase at idle throttle over a long glide, even in wind', () => {
    let s = createState({ position: v3(0, 6000, 0), velocity: v3(120, 0, 0) })
    const wind = v3(25, 0, 0)
    let prev = specificEnergyAirmass(s, wind)
    for (let i = 0; i < 60 * 120; i++) {
      s = stepChecked(f6f, s, IDLE, DT, wind)
      const e = specificEnergyAirmass(s, wind)
      expect(e).toBeLessThanOrEqual(prev + 1e-3)
      prev = e
    }
  })

  it('allows energy to increase under thrust', () => {
    let s = createState({ position: v3(0, 1000, 0), velocity: v3(80, 0, 0) })
    const e0 = specificEnergyAirmass(s, v3(0, 0, 0))
    for (let i = 0; i < 60 * 20; i++) {
      s = stepChecked(f6f, s, { pitch: 0, roll: 0, yaw: 0, throttle: 1 }, DT)
    }
    expect(specificEnergyAirmass(s, v3(0, 0, 0))).toBeGreaterThan(e0)
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
