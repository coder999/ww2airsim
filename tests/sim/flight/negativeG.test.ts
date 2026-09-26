import { describe, it, expect } from 'vitest'
import { v3, length } from '../../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { parseAircraftSpec } from '../../../src/sim/content.js'
import { liftCoefficient } from '../../../src/sim/aero.js'
import { createState, step, angleOfAttack, engineCutOut, DT, type Controls } from '../../../src/sim/flight/model.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const zero = loadAircraftSpec('a6m2-zero')
const withoutCutout = parseAircraftSpec({ ...zero, engine: { ...zero.engine, negativeGCutout: false } })
const DEG = Math.PI / 180
const FULL: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 1 }
/** Level velocity, nose `noseDeg` above (+) or below (-) it. */
const flying = (noseDeg: number) => createState({
  position: v3(0, 3000, 0), velocity: v3(130, 0, 0), fuelKg: 300,
  attitude: qFromAxisAngle(v3(0, 0, 1), noseDeg * DEG),
})

describe('engine.negativeGCutout (A6M spec §4.4, the float carburetor)', () => {
  it('pushed over, the Zero gets no thrust and burns no fuel', () => {
    const s0 = flying(-3)
    // Precondition, so a sign-convention slip fails here rather than passing
    // by accident: the wing really is making negative lift.
    expect(liftCoefficient(zero, angleOfAttack(s0))).toBeLessThan(0)
    const cut = step(zero, s0, FULL, { dt: DT, tick: 1 })
    const running = step(withoutCutout, s0, FULL, { dt: DT, tick: 1 })
    expect(length(cut.velocity)).toBeLessThan(length(running.velocity))
    expect(cut.fuelKg).toBe(s0.fuelKg)
    expect(running.fuelKg).toBeLessThan(s0.fuelKg)
  })

  it('under positive lift the term changes nothing, bit for bit', () => {
    const s0 = flying(3)
    expect(step(zero, s0, FULL, { dt: DT, tick: 1 })).toEqual(step(withoutCutout, s0, FULL, { dt: DT, tick: 1 }))
  })

  it('is stateless: the first positive-lift step after a long push is a normal step', () => {
    let s = flying(-3)
    for (let i = 1; i <= 60; i++) s = { ...step(zero, s, FULL, { dt: DT, tick: i }), attitude: flying(-3).attitude }
    const recovered = { ...s, attitude: qFromAxisAngle(v3(0, 0, 1), 3 * DEG) }
    // The push bent the flight path down (about -10 deg), so nose +3 is now
    // well inside positive, unstalled lift. Asserted, not assumed.
    expect(liftCoefficient(zero, angleOfAttack(recovered))).toBeGreaterThan(0)
    expect(step(zero, recovered, FULL, { dt: DT, tick: 61 })).toEqual(step(withoutCutout, recovered, FULL, { dt: DT, tick: 61 }))
  })

  it('keeps the engine at exactly zero lift: a parked Zero can still take off', () => {
    expect(engineCutOut(zero, 0)).toBe(false)
    expect(engineCutOut(zero, -1e-9)).toBe(true)
    const parked = createState({ position: v3(0, 3000, 0), fuelKg: 300 })
    const next = step(zero, parked, FULL, { dt: DT, tick: 1 })
    expect(next.velocity.x).toBeGreaterThan(0)
  })

  it('is off when absent: the F6F pushed over keeps its thrust, bit for bit with the field set false', () => {
    const f6fFalse = parseAircraftSpec({ ...f6f, engine: { ...f6f.engine, negativeGCutout: false } })
    const s0 = flying(-3)
    expect(engineCutOut(f6f, -1000)).toBe(false)
    expect(step(f6f, s0, FULL, { dt: DT, tick: 1 })).toEqual(step(f6fFalse, s0, FULL, { dt: DT, tick: 1 }))
  })
})
