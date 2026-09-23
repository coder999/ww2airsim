import { describe, expect, it } from 'vitest'
import { createState } from '../../../src/sim/flight/state.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { healthyDamage } from '../../../src/sim/damage/model.js'
import {
  STANDARD_GRAVITY_MPS2,
  damageFromStructuralOverload,
  initialStructuralStress,
  measureStructuralStress,
} from '../../../src/sim/damage/overload.js'

const limits = { diveSpeedMps: 200, gLimit: 8 }
const dt = 0.1
const state = (velocity: ReturnType<typeof v3>) => createState({ velocity })

describe('structural-stress measurement', () => {
  it('measures steady level motion as 1 g and ballistic motion as 0 g', () => {
    const level = state(v3(120, 0, 0))
    const initial = initialStructuralStress(level, limits)
    expect(measureStructuralStress(level, level, null, limits, dt, initial).loadFactorG).toBeCloseTo(1, 12)

    const falling = state(v3(120, -STANDARD_GRAVITY_MPS2 * dt, 0))
    expect(measureStructuralStress(level, falling, null, limits, dt, initial).loadFactorG).toBeCloseTo(0, 12)
  })

  it('uses air-relative speed, treats exact limits as safe and preserves peaks', () => {
    const previous = state(v3(250, 0, 0))
    const initial = initialStructuralStress(previous, limits, v3(50, 0, 0))
    const atLimit = measureStructuralStress(previous, previous, v3(50, 0, 0), { ...limits, gLimit: 1 }, dt, initial)
    expect(atLimit.airspeedMps).toBe(200)
    expect(atLimit.overspeed).toBe(false)
    expect(atLimit.overG).toBe(false)

    const fast = measureStructuralStress(previous, state(v3(260, 0, 0)), v3(50, 0, 0), limits, dt, atLimit)
    expect(fast.overspeed).toBe(true)
    expect(fast.peakAirspeedMps).toBe(210)
    const slower = measureStructuralStress(state(v3(150, 0, 0)), state(v3(150, 0, 0)), null, limits, dt, fast)
    expect(slower.peakAirspeedMps).toBe(210)
    expect(slower.peakLoadFactorG).toBe(fast.peakLoadFactorG)
  })
})

describe('structural-overload damage', () => {
  const stress = (loadFactorG: number, airspeedMps: number) => ({
    loadFactorG, airspeedMps,
    overG: loadFactorG > limits.gLimit,
    overspeed: airspeedMps > limits.diveSpeedMps,
    peakLoadFactorG: loadFactorG,
    peakAirspeedMps: airspeedMps,
  })

  it('returns the same healthy record at and below both limits', () => {
    const healthy = healthyDamage()
    expect(damageFromStructuralOverload(healthy, stress(8, 200), limits, 1, 1)).toBe(healthy)
    expect(damageFromStructuralOverload(healthy, stress(1, 120), limits, 1, 1)).toBe(healthy)
  })

  it('adds the fractional G and speed excesses as continuous structure loss', () => {
    const after = damageFromStructuralOverload(healthyDamage(), stress(8.8, 220), limits, 7, 0.5)
    expect(after.structure).toBeCloseTo(0.9, 12)
    expect(after.destroyedAt).toBeNull()
  })

  it('destroys once, without an attacker, and leaves destroyed records stable', () => {
    const almostGone = { ...healthyDamage(), structure: 0.05 }
    const destroyed = damageFromStructuralOverload(almostGone, stress(16, 200), limits, 19, 0.1)
    expect(destroyed.structure).toBe(0)
    expect(destroyed.destroyedAt).toBe(19)
    expect(destroyed.attacker).toBeNull()
    expect(damageFromStructuralOverload(destroyed, stress(32, 400), limits, 20, 1)).toBe(destroyed)
  })
})

