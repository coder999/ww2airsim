import { describe, it, expect } from 'vitest'
import { v3, length } from '../../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { parseAircraftSpec } from '../../../src/sim/content.js'
import { liftCoefficient } from '../../../src/sim/aero.js'
import { createState, step, angleOfAttack, engineCutOut, DT, type Controls } from '../../../src/sim/flight/model.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { createTerrainField } from '../../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../../src/sim/world/schema.js'

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

  // Final review, Important 1 (2026-09-25): keyed on lift alone, a forward
  // tap on the take-off roll (nose below the -1.19 deg zero-lift attitude)
  // cut the engine; below tailUpSpeedMps the ground regime gates pitch to 0,
  // so the nose could never come back up and the Zero sat on the runway at
  // 12 m/s with no thrust, for good. On the wheels the ground reaction holds
  // the airframe at positive g, so the float carburetor keeps its fuel.
  it('keeps the engine on the wheels: a forward tap on the take-off roll does not strand the Zero', () => {
    expect(engineCutOut(zero, -1000, true)).toBe(false)
    expect(engineCutOut(zero, -1000, false)).toBe(true)
    const field = createTerrainField(
      parseTerrainHeader({ centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000, finestSamples: 8193, levels: 13, encoding: 'int16-decimetres' }),
      12,
      new Int16Array(9).fill(10),
    )
    const groundM = 1
    let s = createState({ position: v3(0, groundM + zero.gear.heightM, 0), fuelKg: 300, gearFraction: 1 })
    // A 0.6 s full push past 20 m/s, 5 s of hesitation with the stick
    // centered (rate command holds the nose-down attitude), then a steady
    // half pull. With the bug the dead engine decelerated the Zero through
    // the hesitation (measured 20.9 -> 19.5 m/s), and a longer one (about
    // 22 s) let it fall below tailUpSpeedMps, where the pull does nothing.
    let pushTicks = 0
    let pushEnd: number | null = null
    let speedAtPushEnd = 0
    let speedAfterHesitation: number | null = null
    let airborneAt: number | null = null
    for (let tick = 1; tick <= 60 * 40 && airborneAt === null; tick++) {
      const pushing = length(s.velocity) > 20 && pushTicks < 36
      if (pushing) pushTicks++
      if (!pushing && pushTicks === 36 && pushEnd === null) { pushEnd = tick; speedAtPushEnd = length(s.velocity) }
      if (pushEnd !== null && tick === pushEnd + 300) speedAfterHesitation = length(s.velocity)
      const pitch = pushing ? -1 : pushEnd !== null && tick > pushEnd + 300 ? 0.5 : 0
      s = step(zero, s, { pitch, roll: 0, yaw: 0, throttle: 1 }, { dt: DT, tick, terrain: field })
      if (s.position.y - zero.gear.heightM - groundM > 5) airborneAt = tick
    }
    expect(pushTicks).toBe(36)
    expect(speedAfterHesitation!, 'the engine still pulls with the nose below zero lift on the wheels').toBeGreaterThan(speedAtPushEnd + 5)
    expect(airborneAt, 'lifted off within 40 s after a 0.6 s forward push').not.toBeNull()
  })
})

