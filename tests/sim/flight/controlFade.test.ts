import { describe, it, expect } from 'vitest'
import { v3 } from '../../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { densityAt } from '../../../src/sim/atmosphere.js'
import { parseAircraftSpec } from '../../../src/sim/content.js'
import {
  createState, step, commandedBodyRates, controlFade, equivalentAirspeedMps, DT, type Controls,
} from '../../../src/sim/flight/model.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const zero = loadAircraftSpec('a6m2-zero')
const DEG = Math.PI / 180
const FULL: Controls = { pitch: 1, roll: 1, yaw: 1, throttle: 1 }
const at = (altitudeM: number, speedMps: number) =>
  createState({ position: v3(0, altitudeM, 0), velocity: v3(speedMps, 0, 0) })
const q = (altitudeM: number, speedMps: number) => 0.5 * densityAt(altitudeM) * speedMps * speedMps

describe('rates.controlFadeByEasMps (A6M spec §4.4)', () => {
  it('is exactly 1 when absent, so the F6F commands the same bits as before', () => {
    const neutral = parseAircraftSpec({ ...f6f, rates: { ...f6f.rates, controlFadeByEasMps: [[1, 1], [1000, 1]] } })
    for (const [alt, v] of [[0, 40], [0, 103], [0, 200], [6000, 150]] as const) {
      expect(controlFade(f6f, q(alt, v))).toBe(1)
      const a = commandedBodyRates(f6f, at(alt, v), FULL)
      const b = commandedBodyRates(neutral, at(alt, v), FULL)
      expect([a.x, a.y, a.z]).toEqual([b.x, b.y, b.z])
    }
  })

  it('gives the Zero full authority up to 250 mph IAS, and 0.35 of it at 300 mph', () => {
    // toBeCloseTo, not toBe: sqrt(2q / rho0) returns 111.76 to within an ulp.
    expect(controlFade(zero, q(0, 111.76))).toBeCloseTo(1, 9)
    expect(controlFade(zero, q(0, 134.11))).toBeCloseTo(0.35, 6)
    expect(controlFade(zero, q(0, 200))).toBe(0.2)
  })

  it('fades by equivalent airspeed: the same true speed higher up keeps more authority', () => {
    const eas = equivalentAirspeedMps(q(6096, 150))
    expect(eas).toBeCloseTo(150 * Math.sqrt(densityAt(6096) / densityAt(0)), 9)
    const high = commandedBodyRates(zero, at(6096, 150), FULL).x
    const low = commandedBodyRates(zero, at(0, 150), FULL).x
    expect(high).toBeGreaterThan(low)
  })

  it('reduces the pilot\'s commanded roll, pitch and yaw together', () => {
    const r = commandedBodyRates(zero, at(0, 150), FULL)
    const f = controlFade(zero, q(0, 150))
    expect(r.x).toBeCloseTo(80 * DEG * f, 12)
    expect(r.z).toBeCloseTo(30 * DEG * f, 12)
    expect(-r.y).toBeCloseTo(15 * DEG * f, 12)
  })

  it('does not touch the weathercock: hands-off yaw from sideslip is the same with or without it', () => {
    const noFade: Record<string, unknown> = { ...zero.rates }
    delete noFade['controlFadeByEasMps']
    const bare = parseAircraftSpec({ ...zero, rates: noFade })
    const slipping = createState({
      position: v3(0, 1000, 0), velocity: v3(150, 0, 0),
      attitude: qFromAxisAngle(v3(0, 1, 0), 5 * DEG),
    })
    const hands: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 1 }
    const a = step(zero, slipping, hands, { dt: DT, tick: 1 })
    const b = step(bare, slipping, hands, { dt: DT, tick: 1 })
    expect(a.bodyRates.y).toBe(b.bodyRates.y)
    expect(a.bodyRates.y).not.toBe(0)
  })

  it('rejects a table whose fraction rises with speed, or whose speeds do not increase', () => {
    expect(() => parseAircraftSpec({ ...zero, rates: { ...zero.rates, controlFadeByEasMps: [[100, 0.5], [150, 0.9]] } }))
      .toThrow(/must not rise/)
    expect(() => parseAircraftSpec({ ...zero, rates: { ...zero.rates, controlFadeByEasMps: [[150, 1], [150, 0.5]] } }))
      .toThrow(/strictly increase/)
    expect(() => parseAircraftSpec({ ...zero, rates: { ...zero.rates, controlFadeByEasMps: [[150, 0]] } }))
      .toThrow(/controlFadeByEasMps/)
  })
})
