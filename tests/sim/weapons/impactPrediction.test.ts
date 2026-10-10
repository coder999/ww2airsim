import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { groundTruthTerrain } from '../../pilot/rangePass.js'
import { createState, type AircraftState, type Controls } from '../../../src/sim/flight/state.js'
import { advance, createWorldOf, playerAircraft, withControls, type Stepper } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { qFromAxisAngle, qMul, qRotate } from '../../../src/sim/math/quat.js'
import { add, length, sub, v3, type Vec3 } from '../../../src/sim/math/vec3.js'
import { heightAt, type TerrainField } from '../../../src/sim/world/terrain.js'
import { restPitchRad, wheelDepthM } from '../../../src/sim/gearContact.js'
import { predictImpact } from '../../../src/sim/weapons/impactPrediction.js'
import type { StoresState } from '../../../src/sim/weapons/stores.js'
import type { AircraftSpec } from '../../../src/sim/flight/schema.js'

/**
 * B2. The predicted impact point against where the real sim puts the store. Truth is `advance`: the
 * detonation `stepCombat` records in `combat.impacts`. The assertions are on that, never on a picture.
 * Tolerances are from measurement (2026-10-10, ryzen): the bomb and the dispersion-free rocket agree to
 * float noise, so the tolerance is 1 cm, and only tightens.
 */
const EXACT_M = 0.01

const hellcat = loadAircraftSpec('f6f-hellcat')
// Rail dispersion is a random draw the prediction cannot know; the exact-match matrix removes it and a
// separate test bounds what the real draw does.
const noScatter: AircraftSpec = { ...hellcat, combat: { ...hellcat.combat!, dispersionDeg: 0 } }
const terrain: TerrainField = groundTruthTerrain()

const still: Stepper = (_spec, state, _controls, ctx) => ({ ...state, tick: ctx.tick })
const idle: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0 }

const attitudeOf = (yaw: number, pitch: number, roll: number) => {
  const heading = qMul(qFromAxisAngle(v3(0, 1, 0), yaw), qFromAxisAngle(v3(0, 0, 1), pitch))
  return { heading, attitude: qMul(heading, qFromAxisAngle(v3(1, 0, 0), roll)) }
}
const stateOf = (position: Vec3, speed: number, yaw: number, pitch: number, roll: number): AircraftState => {
  const { heading, attitude } = attitudeOf(yaw, pitch, roll)
  return createState({ position, velocity: qRotate(heading, v3(speed, 0, 0)), attitude })
}

type Run = { readonly predicted: ReturnType<typeof predictImpact>; readonly actual: readonly Vec3[]; readonly detonations: number }

/** Release one bomb or one rocket pair from `state` in the real sim and fly it to its detonation. */
function release(
  spec: AircraftSpec, state: AircraftState, stores: StoresState, wind: Vec3 | null, terr: TerrainField | null,
  what: 'bomb' | 'rocket', stepper: Stepper = still,
): Run {
  const predicted = predictImpact(spec, state, stores, terr, wind)
  const entity = { id: 'p', spec, state, previous: state, controls: idle, assistMemory: undefined, impact: null, parked: false }
  let w = createWorldOf({ aircraft: [entity], player: 'p', terrain: terr, wind, stores: { p: stores } })
  w = withControls(w, 'p', { ...idle, ...(what === 'bomb' ? { dropBomb: true } : { fireRockets: true }) })
  w = advance(w, DT, stepper).world
  w = withControls(w, 'p', idle)
  for (let i = 0; i < 60 * 70 && w.combat.projectiles.length > 0; i++) w = advance(w, DT, stepper).world
  const hits = w.combat.impacts.filter((i) => i.cause === what && i.outcome === 'detonated')
  return { predicted, actual: hits.map((h) => h.point), detonations: hits.length }
}
const mean = (ps: readonly Vec3[]): Vec3 => ps.reduce((a, p) => add(a, v3(p.x / ps.length, p.y / ps.length, p.z / ps.length)), v3(0, 0, 0))

/** A spread over release speed, height, dive angle, bank and wind. Index-cycled, so it is fixed. */
const WIND = [null, v3(12, 0, -7), v3(-9, 0, 15)] as const
const cases = (where: 'land' | 'sea') => {
  const out: { name: string; state: AircraftState; wind: Vec3 | null }[] = []
  let n = 0
  for (const speed of [60, 100, 160]) {
    for (const diveDeg of [0, 15, 45]) {
      for (const bankDeg of [0, 40]) {
        const yaw = (n * 0.9) % (2 * Math.PI)
        const y = where === 'land' ? 1800 + 400 * (n % 3) : 500 + 700 * (n % 4)
        const origin = where === 'land' ? v3(-30000 + 300 * n, y, 25000 - 200 * n) : v3(100 * n, y, -100 * n)
        const wind = WIND[n % WIND.length]!
        out.push({
          name: `${where} ${speed} m/s dive ${diveDeg} bank ${bankDeg} y ${y} wind ${wind === null ? 'calm' : `${wind.x},${wind.z}`}`,
          state: stateOf(origin, speed, yaw, (-diveDeg * Math.PI) / 180, (bankDeg * Math.PI) / 180), wind,
        })
        n++
      }
    }
  }
  return out
}

describe('predictImpact against the real sim', () => {
  it('matches a bomb over real terrain and over the sea, across speed, height, dive, bank and wind', () => {
    let land = 0, sea = 0, worst = 0
    for (const where of ['land', 'sea'] as const) {
      const set = cases(where)
      expect(set).toHaveLength(18) // pinned: a filter that matched nothing must fail, not pass empty
      for (const c of set) {
        const r = release(hellcat, c.state, { bombs: 2, rockets: 0 }, c.wind, where === 'land' ? terrain : null, 'bomb')
        expect(r.detonations, c.name).toBe(1)
        const miss = length(sub(r.predicted!.point, r.actual[0]!))
        worst = Math.max(worst, miss)
        expect(miss, c.name).toBeLessThan(EXACT_M)
        expect(r.predicted!.armed, c.name).toBe(true)
        if (where === 'land') { expect(r.actual[0]!.y, c.name).toBeGreaterThan(1); land++ } else { expect(r.actual[0]!.y, c.name).toBe(0); sea++ }
      }
    }
    expect([land, sea]).toEqual([18, 18])
    console.log(`bomb worst miss ${worst.toExponential(2)} m over ${land + sea} drops`)
  })

  it('matches a rocket pair, which is powered and then ballistic, over real terrain and the sea', () => {
    let worst = 0, n = 0, expired = 0
    for (const where of ['land', 'sea'] as const) {
      for (const c of cases(where).filter((x, i) => i % 2 === 0)) {
        const r = release(noScatter, c.state, { bombs: 0, rockets: 6 }, c.wind, where === 'land' ? terrain : null, 'rocket')
        // A rocket lives 12 s: a shallow release from high up never lands, and then both must say so.
        if (r.predicted === null) { expect(r.detonations, c.name).toBe(0); expired++; continue }
        expect(r.detonations, c.name).toBe(2)
        const miss = length(sub(r.predicted.point, mean(r.actual)))
        worst = Math.max(worst, miss)
        expect(miss, c.name).toBeLessThan(EXACT_M)
        n++
      }
    }
    expect(n + expired).toBe(18)
    expect(n).toBeGreaterThanOrEqual(8) // not vacuous: measured 9 of 18 land, the rest outlive the motor and 12 s
    console.log(`rocket worst miss ${worst.toExponential(2)} m over ${n} salvos, ${expired} expired in the air`)
  })

  it('a rocket is not a bomb: the motor throws it farther than the same release as a bomb', () => {
    const state = stateOf(v3(0, 1000, 0), 120, 0, (-30 * Math.PI) / 180, 0)
    const rocket = predictImpact(noScatter, state, { bombs: 0, rockets: 6 }, null, null)!
    const bomb = predictImpact(noScatter, state, { bombs: 2, rockets: 0 }, null, null)!
    expect(rocket.point.x).toBeGreaterThan(bomb.point.x + 500)
    expect(rocket.timeS).toBeLessThan(bomb.timeS)
  })

  it('follows which rails are left: the next pair differs once the outer pair is gone', () => {
    const state = stateOf(v3(0, 1500, 0), 120, 0, (-20 * Math.PI) / 180, 0)
    const full = release(noScatter, state, { bombs: 0, rockets: 6 }, null, null, 'rocket')
    const one = release(noScatter, state, { bombs: 0, rockets: 3 }, null, null, 'rocket')
    expect(full.predicted!.point).not.toEqual(one.predicted!.point)
    expect(length(sub(one.predicted!.point, mean(one.actual)))).toBeLessThan(EXACT_M)
  })

  it('with the real dispersion draw, the pair lands within the cone the content declares', () => {
    for (const diveDeg of [20, 35]) {
      const state = stateOf(v3(0, 1500, 0), 130, 0.4, (-diveDeg * Math.PI) / 180, 0)
      const r = release(hellcat, state, { bombs: 0, rockets: 6 }, null, null, 'rocket')
      const flight = length(sub(r.predicted!.point, state.position))
      const cone = flight * Math.tan((hellcat.combat!.dispersionDeg * Math.PI) / 180)
      const miss = length(sub(r.predicted!.point, mean(r.actual)))
      // On the ground a cone of angle a is stretched by 1/sin(dive); 4x covers the shallowest dive here.
      expect(miss).toBeLessThan((cone * 1.5) / Math.sin((diveDeg * Math.PI) / 180) + 0.5)
    }
  })

  it('matches in real flight: a banked, diving, wind-blown Hellcat flown by the real stepper', () => {
    let w = createWorldOf({
      aircraft: [{ id: 'p', spec: hellcat, state: stateOf(v3(-30000, 2600, 25000), 130, 0.7, 0, 0), previous: stateOf(v3(-30000, 2600, 25000), 130, 0.7, 0, 0), controls: { ...idle, throttle: 0.7 }, assistMemory: undefined, impact: null, parked: false }],
      player: 'p', terrain, wind: v3(10, 0, 6), stores: { p: { bombs: 2, rockets: 6 } },
    })
    w = withControls(w, 'p', { ...idle, throttle: 0.7, pitch: 0.12, roll: 0.35 })
    for (let i = 0; i < 60 * 6; i++) w = advance(w, DT).world // six seconds of a real turning descent
    const p = playerAircraft(w)
    expect(p.impact).toBeNull()
    const predicted = predictImpact(p.spec, p.state, { bombs: 2, rockets: 6 }, terrain, w.wind)!
    w = withControls(w, 'p', { ...p.controls, dropBomb: true })
    w = advance(w, DT).world
    w = withControls(w, 'p', { ...playerAircraft(w).controls, dropBomb: false })
    for (let i = 0; i < 60 * 70 && w.combat.projectiles.some((q) => q.kind === 'bomb'); i++) w = advance(w, DT).world
    const hit = w.combat.impacts.find((i) => i.cause === 'bomb' && i.outcome === 'detonated')!
    expect(length(sub(predicted.point, hit.point))).toBeLessThan(EXACT_M)
  })
})

describe('predictImpact says nothing when nothing can be released', () => {
  const air = stateOf(v3(0, 1500, 0), 100, 0, (-10 * Math.PI) / 180, 0)
  it('has no store', () => {
    expect(predictImpact(hellcat, air, { bombs: 0, rockets: 0 }, null, null)).toBeNull()
  })
  it('has bombs but the bay doors are shut; open, it matches the sim', () => {
    const b17 = loadAircraftSpec('b-17-flying-fortress')
    expect(b17.bayDoors).toBeDefined()
    expect(predictImpact(b17, air, { bombs: 8, rockets: 0 }, null, null)).toBeNull()
    const open = createState({ ...air, bayDoorFraction: 1 })
    const r = release(b17, open, { bombs: 8, rockets: 0 }, null, null, 'bomb')
    expect(length(sub(r.predicted!.point, r.actual[0]!))).toBeLessThan(EXACT_M)
  })
  it('is carrying a torpedo, which has its own drop envelope', () => {
    const avenger = loadAircraftSpec('tbm-3-avenger')
    expect(predictImpact(avenger, air, { bombs: 1, rockets: 0 }, null, null)).toBeNull()
  })
  it('is on the ground', () => {
    const x = -30000, z = 25000
    const y = heightAt(terrain, x, z) + wheelDepthM(hellcat.gear, restPitchRad(hellcat.gear))
    const parked = createState({ position: v3(x, y, z) })
    expect(predictImpact(hellcat, parked, { bombs: 2, rockets: 6 }, terrain, null)).toBeNull()
    expect(predictImpact(hellcat, createState({ position: v3(x, y + 300, z) }), { bombs: 2, rockets: 6 }, terrain, null)).not.toBeNull()
  })
  it('would fly out its lifetime in the air: a rocket shot steeply up', () => {
    const up = stateOf(v3(0, 1500, 0), 100, 0, (80 * Math.PI) / 180, 0)
    expect(predictImpact(hellcat, up, { bombs: 0, rockets: 6 }, null, null)).toBeNull()
  })
  it('reports a bomb that meets the water before its fuze arms as a dud, and the sim agrees', () => {
    const low = stateOf(v3(0, 1, 0), 80, 0, 0, 0)
    const r = release(hellcat, low, { bombs: 2, rockets: 0 }, null, null, 'bomb')
    expect(r.predicted!.armed).toBe(false)
    expect(r.detonations).toBe(0)
  })
})

describe('the predictor is a view', () => {
  it('does not touch what it reads, and a world run with predictions interleaved is identical', () => {
    const state = stateOf(v3(-30000, 2000, 25000), 100, 1, (-15 * Math.PI) / 180, 0)
    const entity = { id: 'p', spec: hellcat, state, previous: state, controls: { ...idle, throttle: 0.6 }, assistMemory: undefined, impact: null, parked: false }
    const make = () => createWorldOf({ aircraft: [entity], player: 'p', terrain, wind: v3(5, 0, 5), stores: { p: { bombs: 2, rockets: 6 } } })
    let a = make(), b = make()
    const frozen = JSON.stringify(a.aircraft[0]!.state)
    for (let i = 0; i < 120; i++) {
      a = advance(a, DT).world
      predictImpact(hellcat, playerAircraft(a).state, { bombs: 2, rockets: 6 }, terrain, a.wind)
      b = advance(b, DT).world
    }
    // Not the whole world: it holds the terrain, whose arrays make JSON.stringify take seconds.
    expect(JSON.stringify([a.aircraft, a.combat, a.tick])).toBe(JSON.stringify([b.aircraft, b.combat, b.tick]))
    expect(JSON.stringify(make().aircraft[0]!.state)).toBe(frozen)
  })
})
