// Track D step 3 (D3 T3, Mark 2026-10-09): a torpedo hit floods. The blow does its damage at once,
// then water drains more hull points over time, lists the ship toward the hit and slows it; floods
// add up; bombs never flood. Every ship and torpedo in content is enrolled, so the outcome table in
// the D3 handoff is what this file measures, and a new ship or torpedo is covered without a new test.
import { describe, expect, it } from 'vitest'
import { readdirSync } from 'node:fs'
import { loadAircraftSpec, loadShipSpec } from '../../../tools/content/load.js'
import { createState, type Controls } from '../../../src/sim/flight/state.js'
import { DT } from '../../../src/sim/flight/model.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { createCombat, stepCombat, type CombatShip, type CombatState, type Projectile } from '../../../src/sim/weapons/combat.js'
import {
  FLOOD_DAMAGE_FRACTION, FLOOD_SECONDS, MAX_FLOOD_LIST_RAD, floodListRad, floodSpeedFraction,
} from '../../../src/sim/weapons/flooding.js'
import { advance, type World } from '../../../src/sim/loop.js'
import { missionWorld } from '../mission/fixture.js'
import type { AircraftSpec, StoreType } from '../../../src/sim/flight/schema.js'

const SHIP_IDS = readdirSync('content/ships').filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
const CARRIER_OF: Record<string, string> = { mk13: 'tbm-3-avenger', type91: 'b5n2-kate' }

it('enrolls every ship in content', () => {
  expect(SHIP_IDS).toEqual([
    'abukuma-cl', 'casablanca-cve', 'cleveland-cl', 'essex-cv', 'fletcher-dd', 'kagero-dd', 'mogami-ca',
    'pennsylvania-bb', 'shiratsuyu-dd', 'type-b-maru', 'yamato-bb', 'zuikaku-cv',
  ])
})

const controls: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0, fire: false, dropBomb: false }

const target = (id: string, x = 150): CombatShip => {
  const s = loadShipSpec(id)
  return {
    id: 'target', spec: { lengthM: s.lengthM, beamM: s.beamM, deckHeightM: s.deckHeightM, hullHp: s.hullHp, role: s.role },
    // Heading 0 lays the hull along z: a run east (+x) from the origin meets its port side.
    state: { position: v3(x, 0, 0), headingRad: 0 }, previous: { position: v3(x, 0, 0), headingRad: 0 },
  }
}

/** An armed torpedo running east from the origin, well past its arming run. */
const runner = (t: StoreType, id: number): Projectile => ({
  id, owner: 'p', position: v3(0, -t.runDepthM!, 0), previous: v3(0, -t.runDepthM!, 0),
  velocity: v3(t.runSpeedMps!, 0, 0), lifeS: 100, tracer: false, kind: 'torpedo', ageS: 5, runM: t.armRunM! + 1,
})

/** `hits` torpedoes, one after another, each launched once the previous one has struck, then
 *  `afterS` seconds of flooding. Returns the combat state then, and the ship's state each second. */
function torpedo(spec: AircraftSpec, t: StoreType, shipId: string, hits: number, afterS = FLOOD_SECONDS + 5) {
  const ship = target(shipId)
  const state = createState({ position: v3(0, 500, 0) })
  const a = { id: 'p', spec, state, previous: state, controls, impact: null }
  let combat: CombatState = createCombat([a], {}, [{ id: 'target', hullHp: ship.spec.hullHp }])
  let tick = 0
  const step = (): void => { combat = stepCombat(combat, [a], [ship], [], null, null, [], ++tick, DT) }
  for (let n = 0; n < hits && combat.ships.target!.destroyedTick === null; n++) {
    combat = { ...combat, projectiles: [runner(t, n + 1)] }
    while (combat.projectiles.length > 0) step()
  }
  for (let i = 0; i < Math.round(afterS / DT); i++) step()
  return combat
}

describe.each(Object.keys(CARRIER_OF))('%s', (storeId) => {
  const spec = loadAircraftSpec(CARRIER_OF[storeId]!)
  const t = spec.stores!.types[storeId]!

  it('a hit starts a flood on the side it came in on, and the flood drains its share over its run', () => {
    const ship = target('pennsylvania-bb')
    const state = createState({ position: v3(0, 500, 0) })
    const a = { id: 'p', spec, state, previous: state, controls, impact: null }
    let combat: CombatState = { ...createCombat([a], {}, [{ id: 'target', hullHp: ship.spec.hullHp }]), projectiles: [runner(t, 1)] }
    let tick = 0
    while (combat.projectiles.length > 0) combat = stepCombat(combat, [a], [ship], [], null, null, [], ++tick, DT)
    const hit = combat.ships.target!
    expect(hit.floods).toHaveLength(1)
    expect(hit.floods![0]!.side).toBe(-1) // the run came from the west: port
    expect(hit.floods![0]!.leftHp).toBeCloseTo(t.damage * FLOOD_DAMAGE_FRACTION - hit.floods![0]!.rateHps * DT, 6)
    const after = torpedo(spec, t, 'pennsylvania-bb', 1).ships.target!
    expect(after.floods).toEqual([])
    expect(ship.spec.hullHp - after.hp).toBeCloseTo(t.damage * (1 + FLOOD_DAMAGE_FRACTION), 6)
    expect(after.floodedPortHp).toBeCloseTo(t.damage * FLOOD_DAMAGE_FRACTION, 6)
    expect(after.floodedStarboardHp ?? 0).toBe(0)
    expect(floodListRad(after, ship.spec.hullHp)).toBeLessThan(0)
    expect(floodSpeedFraction(after, ship.spec.hullHp)).toBeLessThan(1)
  })

  it('drains over time, and two hits flood twice as fast', () => {
    const hullHp = loadShipSpec('yamato-bb').hullHp
    // Hull points lost over the second after the last hit's 20 s mark: the flood's rate alone.
    const rate = (hits: number): number =>
      torpedo(spec, t, 'yamato-bb', hits, 20).ships.target!.hp - torpedo(spec, t, 'yamato-bb', hits, 21).ships.target!.hp
    const one = torpedo(spec, t, 'yamato-bb', 1, 20).ships.target!
    expect(one.floods).toHaveLength(1)
    expect(hullHp - one.hp).toBeGreaterThan(t.damage)
    expect(rate(1)).toBeCloseTo(t.damage * FLOOD_DAMAGE_FRACTION / FLOOD_SECONDS, 6)
    expect(rate(2)).toBeCloseTo(2 * rate(1), 6)
  })

  it('a torpedo does more than a bomb of the same warhead: the flood comes on top of the blow', () => {
    const after = torpedo(spec, t, 'mogami-ca', 1).ships.target!
    expect(loadShipSpec('mogami-ca').hullHp - after.hp).toBeGreaterThan(t.damage * 1.5)
  })
})

it('lists and slows in proportion to the water taken, toward the flooded side', () => {
  const hullHp = 400
  expect(floodListRad({}, hullHp)).toBe(0)
  expect(floodSpeedFraction({}, hullHp)).toBe(1)
  expect(floodListRad({ floodedStarboardHp: 50 }, hullHp)).toBeGreaterThan(0)
  expect(floodListRad({ floodedPortHp: 50 }, hullHp)).toBeLessThan(0)
  expect(floodListRad({ floodedPortHp: 50, floodedStarboardHp: 50 }, hullHp)).toBe(0)
  expect(floodListRad({ floodedStarboardHp: 100 }, hullHp)).toBeCloseTo(2 * floodListRad({ floodedStarboardHp: 50 }, hullHp), 9)
  expect(floodListRad({ floodedStarboardHp: 1e6 }, hullHp)).toBe(MAX_FLOOD_LIST_RAD)
  expect(floodSpeedFraction({ floodedPortHp: 100 }, hullHp)).toBeLessThan(floodSpeedFraction({ floodedPortHp: 50 }, hullHp))
  expect(floodSpeedFraction({ floodedPortHp: 1e6 }, hullHp)).toBeGreaterThan(0)
})

it('a bomb on the hull starts no flood (T4)', () => {
  const spec = loadAircraftSpec('f6f-hellcat')
  const ship = target('pennsylvania-bb', 0)
  const state = createState({ position: v3(0, 200, 0), velocity: v3(0, -50, 0) })
  const a = { id: 'p', spec, state, previous: state, controls: { ...controls, dropBomb: true }, impact: null }
  let combat: CombatState = createCombat([a], { p: { bombs: 2, rockets: 0 } }, [{ id: 'target', hullHp: ship.spec.hullHp }])
  const idle = { ...a, controls }
  for (let tick = 1; tick < 60 * 30; tick++) combat = stepCombat(combat, [tick === 1 ? a : idle], [ship], [], null, null, [], tick, DT)
  expect(combat.ships.target!.hp).toBeLessThan(ship.spec.hullHp)
  expect(combat.ships.target!.floods ?? []).toEqual([])
})

it('a dud inside its arming run starts no flood', () => {
  const spec = loadAircraftSpec('tbm-3-avenger')
  const t = spec.stores!.types.mk13!
  const ship = target('pennsylvania-bb', Math.min(100, t.armRunM! / 2))
  const state = createState({ position: v3(0, 500, 0) })
  const a = { id: 'p', spec, state, previous: state, controls, impact: null }
  let combat: CombatState = { ...createCombat([a], {}, [{ id: 'target', hullHp: ship.spec.hullHp }]), projectiles: [{ ...runner(t, 1), runM: 0 }] }
  for (let tick = 1; combat.projectiles.length > 0; tick++) combat = stepCombat(combat, [a], [ship], [], null, null, [], tick, DT)
  expect(combat.ships.target!.floods ?? []).toEqual([])
})

/** Hits to sink, each torpedo given its full flood before the verdict. */
function hitsToSink(storeId: string, shipId: string): number {
  const spec = loadAircraftSpec(CARRIER_OF[storeId]!)
  const t = spec.stores!.types[storeId]!
  for (let n = 1; n <= 12; n++) if (torpedo(spec, t, shipId, n).ships.target!.destroyedTick !== null) return n
  return Infinity
}

// The tuning the plan asks for (T3): one Mk 13 finishes a destroyer, two or three sink a cruiser, a
// battleship survives several. The full table is in docs/handoff/2026-10-09-d3-torpedo-flooding.md.
it('sinks a destroyer with one Mk 13, a cruiser with two or three, and a battleship takes more than three', () => {
  const table = SHIP_IDS.map((id) => ({ id, role: loadShipSpec(id).role, hullHp: loadShipSpec(id).hullHp, mk13: hitsToSink('mk13', id), type91: hitsToSink('type91', id) }))
  for (const r of table) {
    if (r.role === 'escort') expect(r.mk13, r.id).toBe(1)
    if (r.role === 'cruiser') expect([2, 3], r.id).toContain(r.mk13)
    if (r.role === 'battleship') expect(r.mk13, r.id).toBeGreaterThan(3)
    expect(r.type91, r.id).toBeGreaterThanOrEqual(r.mk13)
  }
})

// Wiring: the loop reads the flood when it steps a ship, so a flooded maru makes less way.
it('a flooded ship makes less speed in the running world', () => {
  const steaming = { ships: [{ id: 'maru-1', spec: 'type-b-maru', waypoints: [[-25000, -10000], [-20000, -10000]], speedMps: 6 }] }
  const dry = missionWorld(steaming)
  const hullHp = loadShipSpec('type-b-maru').hullHp
  const wet: World<undefined> = { ...dry, combat: { ...dry.combat, ships: { ...dry.combat.ships, 'maru-1': { ...dry.combat.ships['maru-1']!, floodedPortHp: hullHp / 4 } } } }
  const speed = (w: World<undefined>): number => advance(w, DT).world.ships.find((s) => s.id === 'maru-1')!.state.speedMps
  expect(speed(dry)).toBeCloseTo(6, 9)
  expect(speed(wet)).toBeCloseTo(6 * floodSpeedFraction({ floodedPortHp: hullHp / 4 }, hullHp), 9)
})

// Replays re-step the same ticks: flooding reads nothing but the state it is given.
it('floods identically on a re-run (replay determinism)', () => {
  const spec = loadAircraftSpec('tbm-3-avenger')
  const t = spec.stores!.types.mk13!
  expect(torpedo(spec, t, 'cleveland-cl', 2, 30)).toEqual(torpedo(spec, t, 'cleveland-cl', 2, 30))
})
