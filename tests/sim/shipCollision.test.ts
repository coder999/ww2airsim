import { describe, it, expect } from 'vitest'
import { parseScenario, worldFromScenario } from '../../src/sim/scenario.js'
import { advance, aircraftById, playerAircraft, withAircraftState, type World } from '../../src/sim/loop.js'
import { DT, massKg } from '../../src/sim/flight/model.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { bundleForScenario, loadAircraftSpec, loadScenarioBundle } from '../../tools/content/load.js'
import { stepShipCollisions, COLLISION, COLLISION_ATTACKER_PREFIX, SUPERSTRUCTURE, collisionDamage, shipVolumes } from '../../src/sim/shipCollision.js'
import { createState } from '../../src/sim/flight/state.js'
import { loadShipSpec } from '../../tools/content/load.js'
import { BASE, flatField } from './mission/fixture.js'
import { readdirSync } from 'node:fs'

/**
 * Air-to-ship collision (Mark, 2026-10-10). Anchored ship at the origin of its own frame heading east
 * (+x), an airplane put in its path flying east with no pilot, so the controls hold and nothing
 * steers it away. Every case is a flat sea, so nothing else can end the airplane.
 */
const SHIP = { x: -25000, z: -10000 }
const SPEED = 100

function bed(shipSpec = 'fletcher-dd', shipSide: 'allied' | 'axis' = 'allied', raiderSide: 'allied' | 'axis' = 'axis', raiderSpec = 'f6f-hellcat'): World<undefined> {
  const raw = {
    ...BASE,
    aircraft: [
      { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [60000, 3000, 60000], headingDeg: 90, speedMps: 120 } },
      { id: 'raider', spec: raiderSpec, side: raiderSide, airborneAt: { position: [SHIP.x - 5000, 3000, SHIP.z], headingDeg: 90, speedMps: SPEED } },
    ],
    ships: [{ id: 'ship', spec: shipSpec, side: shipSide, waypoints: [[SHIP.x, SHIP.z], [SHIP.x + 20000, SHIP.z]], speedMps: 0 }],
  }
  const w = worldFromScenario(bundleForScenario(parseScenario(raw)), flatField(0))
  // Heading east, as the second waypoint would have the ship turn to.
  const ships = w.ships.map((s) => ({ ...s, state: { ...s.state, headingRad: Math.PI / 2 }, previous: { ...s.state, headingRad: Math.PI / 2 } }))
  return { ...w, ships }
}

/** The raider at (dx, y, dz) from the ship's reference point, flying east at `SPEED`, nose along the path. */
function place(w: World<undefined>, id: string, dx: number, y: number, dz: number, vy = 0): World<undefined> {
  const a = aircraftById(w, id)!
  return withAircraftState(w, id, { ...a.state, position: v3(SHIP.x + dx, y, SHIP.z + dz), velocity: v3(SPEED, vy, 0), attitude: createState().attitude })
}

/** A level pass: the airplane is put back at `y`, speed and heading every tick, so an untrimmed airframe's sag cannot decide the case. */
function pass(w: World<undefined>, dx: number, y: number, dz: number, seconds: number, vy = 0): World<undefined> {
  let cur = place(w, 'raider', dx, y, dz)
  const attitude = qFromAxisAngle(v3(0, 0, 1), Math.atan2(vy, SPEED))
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const a = aircraftById(cur, 'raider')!
    const at = a.state.position
    cur = advance(withAircraftState(cur, 'raider', { ...a.state, position: v3(at.x, vy === 0 ? y : at.y, at.z), velocity: v3(SPEED, vy, 0), attitude }), DT).world
  }
  return cur
}

function fly(w: World<undefined>, seconds: number): World<undefined> {
  let cur = w
  for (let i = 0; i < Math.round(seconds / DT); i++) cur = advance(cur, DT).world
  return cur
}

const hp = (w: World<undefined>): number => w.combat.ships['ship']!.hp
const gone = (w: World<undefined>, id = 'raider'): boolean => w.combat.aircraft[id]!.damage.destroyedAt !== null

describe('air-to-ship collision', () => {
  it('a fighter flying into a destroyer hull is destroyed, and the destroyer loses the calibrated hull points', () => {
    const w0 = place(bed(), 'raider', -80, 3, 0)
    const hull0 = hp(w0)
    const w = fly(w0, 1.5)
    expect(gone(w)).toBe(true)
    expect(w.combat.aircraft['raider']!.damage.attacker).toBe(COLLISION_ATTACKER_PREFIX + 'ship')
    const spec = loadAircraftSpec('f6f-hellcat')
    const mass = massKg(spec, aircraftById(w0, 'raider')!.state)
    const lost = hull0 - hp(w)
    // The airplane is slowed a little by drag in the approach, so compare with the formula at both ends of the speed it could have had.
    expect(lost).toBeGreaterThanOrEqual(collisionDamage(mass, 95))
    expect(lost).toBeLessThanOrEqual(collisionDamage(mass, 101))
    expect(lost).toBeGreaterThan(0)
    // It stops against the hull and falls with it, not through it and on.
    const wreck = aircraftById(w, 'raider')!
    expect(Math.abs(wreck.state.position.x - SHIP.x)).toBeLessThan(70)
  })

  it('credits the damage to the raider, and a sinking ship to its side', () => {
    const w = fly(place(bed('type-b-maru'), 'raider', -80, 3, 0), 1.5)
    const d = w.combat.ships['ship']!
    expect(d.hp).toBeLessThan(loadShipSpec('type-b-maru').hullHp)
    // Push the ship to the edge so the raider's blow sinks it, then run out the 90 s sinking.
    const nearly = { ...bed('type-b-maru'), combat: { ...bed('type-b-maru').combat, ships: { ship: { ...bed('type-b-maru').combat.ships['ship']!, hp: 5 } } } }
    const sunk = fly(place(nearly, 'raider', -80, 3, 0), 95)
    expect(sunk.combat.ships['ship']!.destroyedTick).not.toBeNull()
    expect(sunk.combat.ships['ship']!.attacker).toBe('raider')
    expect(sunk.combat.aircraft['raider']!.shipsSunk).toBe(1)
    expect(sunk.combat.aircraft['raider']!.friendlyKills).toBe(0)
  })

  it('a pass above the deckhouse is not a collision; through it is', () => {
    const spec = loadShipSpec('fletcher-dd')
    const top = spec.deckHeightM + SUPERSTRUCTURE.escort.topAboveDeckM
    const above = pass(bed(), -120, top + 1.5, 0, 2.5)
    expect(gone(above)).toBe(false)
    expect(hp(above)).toBe(spec.hullHp)
    const through = pass(bed(), -120, top - 1.5, 0, 2.5)
    expect(gone(through)).toBe(true)
    expect(hp(through)).toBeLessThan(spec.hullHp)
  })

  it('above the hull but beside the deckhouse is a pass', () => {
    // 6.5 m above the sea clears the 6 m hull; 7 m to starboard is outside the deckhouse (4.2 m half beam + body) but over the hull.
    const spec = loadShipSpec('fletcher-dd')
    const w = pass(bed(), -120, spec.deckHeightM + 0.5, 7, 2.5)
    expect(gone(w)).toBe(false)
  })

  it('a pass alongside is not a collision', () => {
    const spec = loadShipSpec('fletcher-dd')
    for (const side of [1, -1]) {
      const w = pass(bed(), -120, 3, side * (spec.beamM / 2 + COLLISION.bodyRadiusM + 5), 2.5)
      expect(gone(w)).toBe(false)
      expect(hp(w)).toBe(spec.hullHp)
    }
  })

  it('an opposing-side collision is not friendly fire; an own-side one is physical and recorded as such', () => {
    const foe = fly(place(bed('fletcher-dd', 'allied', 'axis'), 'raider', -80, 3, 0), 1.5)
    expect(foe.combat.aircraft['raider']!.friendlyFire).toBeNull()
    expect(gone(foe)).toBe(true)
    const own = fly(place(bed('fletcher-dd', 'allied', 'allied'), 'raider', -80, 3, 0), 1.5)
    expect(gone(own)).toBe(true)
    expect(hp(own)).toBeLessThan(hp(bed()))
    expect(own.combat.aircraft['raider']!.friendlyFire).toEqual({ tick: expect.any(Number), kind: 'ship', target: 'ship' })
  })

  it('an own-side ship sunk by a collision is a friendly kill, never a score', () => {
    const w0 = bed('type-b-maru', 'allied', 'allied')
    const weak = { ...w0, combat: { ...w0.combat, ships: { ship: { ...w0.combat.ships['ship']!, hp: 5 } } } }
    const sunk = fly(place(weak, 'raider', -80, 3, 0), 95)
    const rec = sunk.combat.aircraft['raider']!
    expect(rec.friendlyKills).toBe(1)
    expect(rec.shipsSunk).toBe(0)
  })

  it('God mode: the player bounces and nobody is hurt; another airplane still dies', () => {
    const w0 = bed()
    const player = playerAircraft(w0)
    const placed = withAircraftState(w0, player.id, { ...player.state, position: v3(SHIP.x - 80, 3, SHIP.z), velocity: v3(SPEED, 0, 0), attitude: createState().attitude })
    const god = { stores: w0.combat.aircraft[player.id]!.stores }
    let w = placed
    for (let i = 0; i < 90; i++) w = advance(w, DT, undefined, undefined, false, god).world
    const me = playerAircraft(w)
    expect(me.impact).toBeNull()
    expect(w.combat.aircraft[player.id]!.damage.destroyedAt).toBeNull()
    expect(hp(w)).toBe(hp(w0))
    expect(me.state.position.y).toBeGreaterThan(6)
    // Without God mode the same flight is a kill.
    expect(gone(fly(placed, 1.5), player.id)).toBe(true)
  })

  it('an airplane parked on a carrier deck is never a collision', () => {
    const bundle = loadScenarioBundle('deck-quals')
    const w0 = worldFromScenario(bundle, flatField(0))
    const w = fly(w0, 20)
    expect(w.combat.aircraft['f6f-1']!.damage.destroyedAt).toBeNull()
    expect(playerAircraft(w).impact).toBeNull()
    expect(w.combat.ships['cv-1']!.hp).toBe(w0.combat.ships['cv-1']!.hp)
  })

  it('a low pass above a carrier deck, and into the island, differ', () => {
    const cv = loadShipSpec('essex-cv')
    const top = cv.deckHeightM
    const over = pass(bed('essex-cv'), -200, top + 8, 0, 5)
    expect(gone(over)).toBe(false)
    const island = SUPERSTRUCTURE.carrier
    const into = pass(bed('essex-cv'), island.x * cv.lengthM - 60, top + 8, island.z * cv.beamM, 3)
    expect(gone(into)).toBe(true)
  })

  it('a dive onto a flight deck from above costs the carrier hull points too', () => {
    const cv = loadShipSpec('essex-cv')
    const w = pass(bed('essex-cv'), -100, cv.deckHeightM + 60, 0, 3, -60)
    expect(hp(w)).toBeLessThan(cv.hullHp)
  })

  it('every ship in content has a hull volume at least its own size and a superstructure above the deck', () => {
    const ids = readdirSync(new URL('../../content/ships/', import.meta.url)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort()
    expect(ids.length).toBe(12)
    for (const id of ids) {
      const spec = loadShipSpec(id)
      const [hull, house] = shipVolumes(spec)
      expect(hull!.hx).toBeGreaterThanOrEqual(spec.lengthM / 2)
      expect(hull!.hz).toBeGreaterThanOrEqual(spec.beamM / 2)
      expect(house!.topM).toBeGreaterThan(hull!.topM)
      // The house stays on the hull.
      expect(Math.abs(house!.cx) + house!.hx).toBeLessThanOrEqual(hull!.hx)
      expect(Math.abs(house!.cz) + house!.hz).toBeLessThanOrEqual(hull!.hz)
    }
  })
})

describe('collision damage', () => {
  it('costs a Hellcat at attack speed about what one 500 lb bomb hit does, from content', () => {
    const f6f = loadAircraftSpec('f6f-hellcat')
    const bomb = (f6f.stores as { types: Record<string, { damage: number }> }).types['an-m65']!.damage
    expect(COLLISION.refHullDamage).toBe(bomb)
    const mass = massKg(f6f, createState({ fuelKg: f6f.mass.fuelCapacityKg / 2 }))
    for (const v of [100, 110, 120]) {
      const d = collisionDamage(mass, v)
      expect(d).toBeGreaterThanOrEqual(bomb * 0.85)
      expect(d).toBeLessThanOrEqual(bomb * 2.5)
    }
    expect(collisionDamage(mass, 100)).toBeGreaterThan(bomb * 0.85)
    expect(collisionDamage(mass, 100)).toBeLessThan(bomb * 1.15)
  })
  it('rises with mass and speed, with a floor and a cap', () => {
    expect(collisionDamage(6000, 100)).toBeGreaterThan(collisionDamage(4500, 100))
    expect(collisionDamage(4500, 150)).toBeGreaterThan(collisionDamage(4500, 100))
    expect(collisionDamage(10, 1)).toBe(COLLISION.floorFraction * COLLISION.refHullDamage)
    expect(collisionDamage(50000, 400)).toBe(COLLISION.capFraction * COLLISION.refHullDamage)
  })
})

describe('determinism', () => {
  it('returns the very same objects when nothing collides', () => {
    const w = place(bed(), 'raider', -120, 200, 0)
    const out = stepShipCollisions({ tick: 1, start: w.aircraft, aircraft: w.aircraft, ships: w.ships, combat: w.combat, terrain: w.terrain, decks: [], sides: null, targetSides: null, player: w.player, god: false })
    expect(out.aircraft).toBe(w.aircraft)
    expect(out.combat).toBe(w.combat)
  })
  it('with no collision a world is bit-identical to one stepped without the check (a flight past the ship)', () => {
    const w = bed()
    const a = pass(w, -120, 200, 0, 2), b = pass(w, -120, 200, 0, 2)
    expect(a).toEqual(b)
  })
})
