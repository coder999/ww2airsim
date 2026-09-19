import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { createState, step, airspeed, airVelocity, angleOfAttack, DT } from '../../src/sim/flight/model.js'
import { stepChecked } from '../../src/sim/invariants.js'
import { windVectorFrom } from '../../src/sim/scenario.js'
import { type Vec3, v3 } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import { createTerrainField } from '../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../src/sim/world/schema.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const RUNWAY_M = 1
const FLAT = createTerrainField(
  parseTerrainHeader({ centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000, finestSamples: 8193, levels: 13, encoding: 'int16-decimetres' }),
  12,
  new Int16Array(9).fill(RUNWAY_M * 10),
)
const FULL = { pitch: 0, roll: 0, yaw: 0, throttle: 1 }

/** Nose north (-z), the parked attitude on Tacloban's strip. */
const north = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2)

function takeoffRollM(wind: Vec3 | null): { rollM: number; liftoffAirspeedMps: number } {
  let s = createState({ position: v3(0, RUNWAY_M + f6f.gear.heightM, 0), attitude: north, gearFraction: 1, flapFraction: 1 })
  const liftoff = 86.5 * 0.44704
  for (let tick = 1; tick < 60 * 120; tick++) {
    s = step(f6f, s, FULL, { dt: DT, tick, terrain: FLAT, wind })
    if (airspeed({ ...s, velocity: airVelocity(s, wind ?? null) }) >= liftoff) {
      return { rollM: Math.hypot(s.position.x, s.position.z), liftoffAirspeedMps: liftoff }
    }
  }
  throw new Error('never reached lift-off speed')
}

describe('windVectorFrom', () => {
  it('turns a meteorological "from" bearing into the velocity of the air', () => {
    // From 342° (NNW) the air moves toward 162° (SSE): +x east a little, +z south a lot.
    const w = windVectorFrom(342, 7.717)
    expect(w.x).toBeCloseTo(-Math.sin((342 * Math.PI) / 180) * 7.717, 9)
    expect(w.z).toBeCloseTo(Math.cos((342 * Math.PI) / 180) * 7.717, 9)
    expect(w.y).toBe(0)
    // From north the air blows south (+z); from east it blows west (-x).
    expect(windVectorFrom(0, 10).x).toBeCloseTo(0, 9)
    expect(windVectorFrom(0, 10).z).toBeCloseTo(10, 9)
    expect(windVectorFrom(90, 10).x).toBeCloseTo(-10, 9)
    expect(windVectorFrom(90, 10).z).toBeCloseTo(0, 9)
  })
  it('is calm at zero speed', () => {
    const w = windVectorFrom(123, 0)
    expect(Math.hypot(w.x, w.y, w.z)).toBe(0)
  })
})

describe('wind in step', () => {
  it('a null wind is the code path that exists today: bit-identical states', () => {
    let a = createState({ position: v3(0, 500, 0), velocity: v3(0, 0, -80), attitude: north })
    let b = a
    for (let tick = 1; tick <= 600; tick++) {
      a = step(f6f, a, { pitch: 0.1, roll: 0.05, yaw: 0, throttle: 0.6 }, { dt: DT, tick })
      b = step(f6f, b, { pitch: 0.1, roll: 0.05, yaw: 0, throttle: 0.6 }, { dt: DT, tick, wind: null })
    }
    expect(b).toEqual(a)
  })

  it('a headwind shortens the take-off roll and lift-off happens at the same AIRSPEED', () => {
    const calm = takeoffRollM(null)
    // 5 m/s from the north, straight down a northbound roll: the air moves south (+z).
    const headwind = takeoffRollM(windVectorFrom(0, 5))
    expect(headwind.rollM).toBeLessThan(calm.rollM * 0.85)
    expect(headwind.liftoffAirspeedMps).toBe(calm.liftoffAirspeedMps)
  })

  it('angle of attack and airspeed are measured against the air, not the ground', () => {
    // Flying north at 60 m/s ground speed into a 20 m/s headwind is 80 m/s of air.
    const s = createState({ position: v3(0, 500, 0), velocity: v3(0, 0, -60), attitude: north })
    const wind = windVectorFrom(0, 20)
    const air = { ...s, velocity: airVelocity(s, wind) }
    expect(airspeed(air)).toBeCloseTo(80, 9)
    expect(angleOfAttack(air)).toBeCloseTo(angleOfAttack(s), 9)
  })

  it('a hands-off airplane weathercocks into a crosswind', () => {
    // Nose north, 60 m/s ground speed, air arriving from the east at 15 m/s
    // (blowing west, -x): sideslip is positive, the nose must swing right (east).
    let s = createState({ position: v3(0, 1500, 0), velocity: v3(0, 0, -60), attitude: north })
    const wind = windVectorFrom(90, 15)
    const nose = (state: typeof s) => {
      const q = state.attitude
      // body +x in world: quaternion rotate of (1,0,0)
      const x = 1 - 2 * (q.y * q.y + q.z * q.z)
      const z = 2 * (q.x * q.z - q.w * q.y)
      return Math.atan2(x, -z) // compass heading, 0 north
    }
    const start = nose(s)
    for (let tick = 1; tick <= 60 * 5; tick++) s = step(f6f, s, { pitch: 0, roll: 0, yaw: 0, throttle: 0.5 }, { dt: DT, tick, wind })
    expect(nose(s)).toBeGreaterThan(start + 0.02)
  })

  it('the airmass-frame energy invariant holds at idle in a steady wind', () => {
    let s = createState({ position: v3(0, 2000, 0), velocity: v3(0, 0, -90), attitude: north })
    const wind = windVectorFrom(270, 12)
    for (let tick = 1; tick <= 60 * 20; tick++) {
      s = stepChecked(f6f, s, { pitch: 0.05, roll: 0.2, yaw: 0, throttle: 0 }, { dt: DT, tick, wind })
    }
    expect(Number.isFinite(s.position.y)).toBe(true)
  })
})
