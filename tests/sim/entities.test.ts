import { describe, it, expect } from 'vitest'
import {
  advance, createWorld, createWorldOf, playerAircraft, aircraftById, withControls, withAircraftState,
  PLAYER_ID, type AircraftEntity, type ShipEntity,
} from '../../src/sim/loop.js'
import { createState } from '../../src/sim/flight/state.js'
import { DT } from '../../src/sim/flight/model.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { createShipState } from '../../src/sim/world/ships.js'
import { interpolateShip } from '../../src/sim/interpolate.js'
import { createTerrainField, SEA_LEVEL_M } from '../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../src/sim/world/schema.js'
import { loadAircraftSpec, loadShipSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const dd = loadShipSpec('fletcher-dd')
const level = { pitch: 0, roll: 0, yaw: 0, throttle: 0.7 }

const flying = (id: string, x = 0): AircraftEntity<undefined> => {
  const state = createState({ position: v3(x, 2000, 0), velocity: v3(130, 0, 0) })
  return { id, spec: f6f, state, previous: state, controls: level, assistMemory: undefined, impact: null, parked: false }
}
const sailing = (id: string): ShipEntity => {
  const state = createShipState({ position: v3(0, SEA_LEVEL_M, 50000), headingRad: 0, speedMps: 5, waypoint: 0 })
  return { id, spec: dd, state, previous: state, orders: { waypoints: [{ x: 0, z: -1e6 }, { x: 0, z: -2e6 }], speedMps: 5 } }
}
const plateauHeader = parseTerrainHeader({
  centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000,
  finestSamples: 8193, levels: 13, encoding: 'int16-decimetres',
})
const plateau = createTerrainField(plateauHeader, 12, new Int16Array(9).fill(10000)) // 1000 m everywhere

function deepFreeze<T>(value: T): T {
  if (value !== null && (typeof value === 'object' || typeof value === 'function') && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.getOwnPropertyNames(value)) deepFreeze((value as Record<string, unknown>)[key])
  }
  return value
}

describe('createWorld, the one-airplane convenience', () => {
  it('builds a world whose only aircraft is the player', () => {
    const w = createWorld(f6f, createState({}), level)
    expect(w.aircraft).toHaveLength(1)
    expect(w.ships).toEqual([])
    expect(w.airfields).toEqual([])
    expect(w.player).toBe(PLAYER_ID)
    expect(playerAircraft(w).id).toBe(PLAYER_ID)
    expect(playerAircraft(w).parked).toBe(false)
    expect(w.tick).toBe(0)
  })
})

describe('createWorldOf', () => {
  it('rejects a duplicate id and a missing player', () => {
    expect(() => createWorldOf({ aircraft: [flying('a'), flying('a')], player: 'a' })).toThrow(/duplicate.*"a"/)
    expect(() => createWorldOf({ aircraft: [flying('a')], ships: [sailing('a')], player: 'a' })).toThrow(/duplicate.*"a"/)
    expect(() => createWorldOf({ aircraft: [flying('a')], player: 'b' })).toThrow(/player.*"b"/)
  })

  it('rejects an entity that is not at tick 0, which the world clock would rewind', () => {
    // `advance` steps every entity from `world.tick`, not from the entity's
    // own tick, so an already-stepped entity in a fresh (tick 0) world would
    // be silently rewound on the first step.
    const stepped = advance(createWorldOf({ aircraft: [flying('a')], ships: [sailing('s')], player: 'a' }), DT * 4)
      .world
    const a = playerAircraft(stepped)
    expect(a.state.tick).toBe(4)
    expect(() => createWorldOf({ aircraft: [a], player: 'a' })).toThrow(/"a" is at tick 4/)
    expect(() => createWorldOf({ aircraft: [flying('a')], ships: stepped.ships, player: 'a' })).toThrow(
      /"s" is at tick 4/,
    )
  })

  it('aircraftById and withControls address an entity by id, never by index', () => {
    const w = createWorldOf({ aircraft: [flying('a'), flying('b')], player: 'b' })
    expect(aircraftById(w, 'b')?.id).toBe('b')
    expect(aircraftById(w, 'zz')).toBeUndefined()
    const w2 = withControls(w, 'a', { ...level, pitch: 1 })
    expect(aircraftById(w2, 'a')!.controls.pitch).toBe(1)
    expect(aircraftById(w2, 'b')!.controls.pitch).toBe(0)
    expect(w2.aircraft[1]).toBe(w.aircraft[1]) // untouched entity is the same object
    const s = createState({ position: v3(9, 9, 9) })
    const w3 = withAircraftState(w, 'a', s)
    expect(aircraftById(w3, 'a')!.state).toBe(s)
    expect(aircraftById(w3, 'a')!.previous).toBe(s)
  })
})

describe('advance over several entities (spec §3.4)', () => {
  const two = () => createWorldOf({ aircraft: [flying('a'), flying('b', 500)], ships: [sailing('s')], player: 'a' })

  it('steps every aircraft and every ship on one clock; every state.tick equals world.tick', () => {
    const r = advance(two(), DT * 3)
    expect(r.stepsRun).toBe(3)
    expect(r.world.tick).toBe(3)
    for (const a of r.world.aircraft) expect(a.state.tick).toBe(3)
    for (const s of r.world.ships) expect(s.state.tick).toBe(3)
    expect(r.world.ships[0]!.state.position.z).toBeCloseTo(50000 - 5 * 3 * DT, 9)
  })

  it('is exactly today\'s single-airplane result for the player: two aircraft do not perturb each other', () => {
    const alone = advance(createWorld(f6f, flying('a').state, level), DT * 5).world
    const together = advance(two(), DT * 5).world
    expect(playerAircraft(together).state).toEqual(playerAircraft(alone).state)
  })

  it('skips a crashed aircraft and keeps stepping the others', () => {
    const diving = { ...flying('a'), state: createState({ position: v3(0, 1001, 0), velocity: v3(60, -60, 0) }) }
    const w = createWorldOf({ aircraft: [{ ...diving, previous: diving.state }, flying('b')], ships: [sailing('s')], player: 'a', terrain: plateau })
    const ended = advance(w, DT * 5).world
    const a = playerAircraft(ended)
    expect(a.impact).not.toBeNull()
    expect(a.previous).toBe(a.state)
    // The others ran all five steps.
    expect(aircraftById(ended, 'b')!.state.tick).toBe(5)
    expect(ended.ships[0]!.state.tick).toBe(5)
    expect(ended.tick).toBe(5)
    // A later call leaves the crashed one exactly where it was and moves the rest on.
    const later = advance(ended, DT * 10).world
    expect(playerAircraft(later).state).toBe(a.state)
    expect(playerAircraft(later).impact).toBe(a.impact)
    // 10, not 15: `DT * 10` owes ten steps and MAX_STEPS_PER_FRAME caps the
    // call at five, exactly as it did before this world held more than one
    // entity.
    expect(aircraftById(later, 'b')!.state.tick).toBe(10)
  })

  it('returns the same world object for zero elapsed time (spec §4)', () => {
    const w = two()
    const r = advance(w, 0)
    expect(r.world).toBe(w)
    expect(r.stepsRun).toBe(0)
    expect(r.alpha).toBe(0)
    // And for a negative or NaN delta, which map to zero.
    expect(advance(w, -1).world).toBe(w)
    expect(advance(w, NaN).world).toBe(w)
  })

  it('is pure with two aircraft and a ship: a deep-frozen world is not written', () => {
    const w = deepFreeze(two())
    const before = JSON.stringify(w)
    advance(w, DT * 3)
    expect(JSON.stringify(w)).toBe(before)
  })

  it('survives structuredClone with every entity intact and flies on identically', () => {
    const w = { ...two(), terrain: plateau }
    const cloned = structuredClone(w)
    expect(cloned.ships[0]!.spec).toEqual(dd)
    expect(cloned.terrain!.heightsDm).toBeInstanceOf(Int16Array)
    expect(advance(cloned, DT * 4).world).toEqual(advance(w, DT * 4).world)
  })
})

describe('interpolateShip', () => {
  it('lerps position and takes the short way round in heading', () => {
    const prev = createShipState({ position: v3(0, 0, 0), headingRad: Math.PI - 0.1 })
    const curr = createShipState({ position: v3(10, 0, 0), headingRad: -Math.PI + 0.1 })
    const mid = interpolateShip(prev, curr, 0.5)
    expect(mid.position.x).toBe(5)
    expect(Math.abs(mid.headingRad)).toBeCloseTo(Math.PI, 9)
    expect(interpolateShip(prev, curr, 0)).toEqual({ position: prev.position, headingRad: prev.headingRad })
    expect(interpolateShip(prev, curr, 1)).toEqual({ position: curr.position, headingRad: curr.headingRad })
  })
})
