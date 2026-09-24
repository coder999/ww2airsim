import { describe, it, expect } from 'vitest'
import {
  advance, createWorld, createWorldOf, playerAircraft, aircraftById, withControls, withAircraftState,
  PLAYER_ID, type AircraftEntity, type ShipEntity,
} from '../../src/sim/loop.js'
import { createState } from '../../src/sim/flight/state.js'
import { DT } from '../../src/sim/flight/model.js'
import { v3, ZERO } from '../../src/sim/math/vec3.js'
import { createShipState } from '../../src/sim/world/ships.js'
import { interpolateShip } from '../../src/sim/interpolate.js'
import { createTerrainField, SEA_LEVEL_M } from '../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../src/sim/world/schema.js'
import { loadAircraftSpec, loadShipSpec } from '../../tools/content/load.js'
import { GREEN_SKILL } from '../../src/sim/ai/pilot.js'

const PURSUE_NOW = {
  maneuver: 'pursue' as const, nextRescoreS: 0,
  observedTargetPosition: ZERO, observedTargetVelocity: ZERO, noiseCursor: 0,
}
// What `PURSUE_NOW` becomes after `advance()`'s Plan 7b dispatch runs its
// very first rescore (tick 1, since `nextRescoreS: 0` is always <= tick*DT):
// the maneuver is decided fresh, and `nextRescoreS` moves to `DT +
// skill.reactionS` regardless of which maneuver wins. Below, `pursuitWorld`'s
// fixture is deliberately energy-favorable for the pilot, so this rescore
// keeps choosing `'pursue'` -- see that fixture's own comment.
//
// `observedTargetPosition`/`observedTargetVelocity` are no longer `ZERO`
// (Task 2: perception staleness makes these fields real). They capture the
// target's START-OF-TICK-1 state -- `pursuitWorld`'s own `targetState` --
// because the rescore reads `aircraftAtStart`, the pre-step snapshot, and
// (with GREEN_SKILL.reactionS=1.0 comfortably longer than the 5-tick test
// window below) no later rescore overwrites it before this assertion runs.
const RESCORED_PURSUE = {
  maneuver: 'pursue' as const, nextRescoreS: DT + GREEN_SKILL.reactionS,
  observedTargetPosition: v3(900, 2100, 250), observedTargetVelocity: v3(80, 0, 10), noiseCursor: 0,
}

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

  it('rejects a pilot target that is missing or is the pilot itself', () => {
    expect(() => createWorldOf({
      aircraft: [{ ...flying('a'), pilot: { target: 'missing', skill: GREEN_SKILL, decision: PURSUE_NOW } }], player: 'a',
    })).toThrow(/pilot "a" targets missing aircraft "missing"/)
    expect(() => createWorldOf({
      aircraft: [{ ...flying('a'), pilot: { target: 'a', skill: GREEN_SKILL, decision: PURSUE_NOW } }], player: 'a',
    })).toThrow(/pilot "a" cannot target itself/)
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

describe('AI pilots in the fixed-step world', () => {
  const pursuitWorld = (reversed = false) => {
    const pilotState = createState({ position: v3(0, 2000, 0), velocity: v3(100, 0, 0) })
    // Target is slower than the pilot despite being 100m higher, so the
    // pilot's relative energy stays positive and the Plan 7b decision layer
    // resolves to Pursue on tick 1 -- this fixture predates that layer and
    // originally had the target FASTER (velocity (110,0,15)), which is now a
    // real energy deficit for the pilot and flips the decision to Extend.
    // Position (bearing, range) is unchanged from the original fixture: only
    // speed moved, so the pursuit geometry these tests assert against
    // (roll/pitch sign, array-order invariance, clone determinism) is intact.
    const targetState = createState({ position: v3(900, 2100, 250), velocity: v3(80, 0, 10) })
    const pilot = {
      ...flying('pilot'), state: pilotState, previous: pilotState,
      pilot: { target: 'target', skill: GREEN_SKILL, decision: PURSUE_NOW },
    }
    const target = { ...flying('target'), state: targetState, previous: targetState }
    return createWorldOf({
      aircraft: reversed ? [target, pilot] : [pilot, target],
      player: 'pilot',
    })
  }

  it('lets the fixed-tick pilot fly the player seat and recomputes its controls', () => {
    const first = advance(pursuitWorld(), DT).world
    const firstPilot = playerAircraft(first)
    expect(firstPilot.controls.roll).toBeGreaterThan(0)
    expect(firstPilot.controls.pitch).toBeGreaterThan(0)
    expect(firstPilot.state.attitude).not.toEqual(flying('pilot').state.attitude)

    const second = advance(first, DT).world
    expect(playerAircraft(second).controls).not.toEqual(firstPilot.controls)
  })

  it('is invariant to aircraft array order because every pilot reads the same tick snapshot', () => {
    const run = (world: ReturnType<typeof pursuitWorld>) => {
      for (let i = 0; i < 24; i++) world = advance(world, DT * 5).world
      return world
    }
    const normal = run(pursuitWorld())
    const reversed = run(pursuitWorld(true))
    for (const id of ['pilot', 'target']) {
      expect(aircraftById(reversed, id)!.state).toEqual(aircraftById(normal, id)!.state)
      expect(aircraftById(reversed, id)!.controls).toEqual(aircraftById(normal, id)!.controls)
    }
  })

  it('survives structuredClone and continues deterministically with its assignment', () => {
    const world = advance(pursuitWorld(), DT * 5).world
    const cloned = structuredClone(world)
    expect(playerAircraft(cloned).pilot).toEqual({ target: 'target', skill: GREEN_SKILL, decision: RESCORED_PURSUE })
    expect(advance(cloned, DT * 5).world).toEqual(advance(world, DT * 5).world)
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
