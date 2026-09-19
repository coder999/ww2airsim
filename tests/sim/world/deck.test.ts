import { describe, it, expect } from 'vitest'
import { deckOf, decksOf, deckLocal, deckWorld, insideDeck, insideTrapZone } from '../../../src/sim/world/deck.js'
import { createShipState, shipVelocity } from '../../../src/sim/world/ships.js'
import { SEA_LEVEL_M } from '../../../src/sim/world/terrain.js'
import { loadShipSpec } from '../../../tools/content/load.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import type { ShipEntity } from '../../../src/sim/loop.js'
import { advance, createWorldOf, withControls } from '../../../src/sim/loop.js'
import { createState, DT } from '../../../src/sim/flight/model.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'

const cv = loadShipSpec('essex-cv')
const dd = loadShipSpec('fletcher-dd')

const ship = (spec: typeof cv, headingRad: number, x = 1000, z = -2000, speedMps = 7.717): ShipEntity => {
  const state = createShipState({ position: v3(x, SEA_LEVEL_M, z), headingRad, speedMps })
  return { id: spec.id === 'essex-cv' ? 'cv-1' : 'dd-1', spec, state, previous: state, orders: { waypoints: [{ x, z }, { x, z: z - 1 }], speedMps } }
}

describe('deckOf', () => {
  it('derives a deck from a carrier and nothing from an escort', () => {
    const deck = deckOf(ship(cv, 0))!
    expect(deck).not.toBeNull()
    expect(deck.shipId).toBe('cv-1')
    expect(deck.center).toEqual(v3(1000, SEA_LEVEL_M + cv.flightDeck!.heightM, -2000))
    expect(deck.lengthM).toBe(cv.flightDeck!.lengthM)
    expect(deck.widthM).toBe(cv.flightDeck!.widthM)
    expect(deck.velocity).toEqual(shipVelocity(0, 7.717))
    expect(deck.trapFromSternM).toBe(cv.trapZone!.fromSternM)
    expect(deckOf(ship(dd, 0))).toBeNull()
    expect(decksOf([ship(cv, 0), ship(dd, 0)])).toHaveLength(1)
  })
})

describe('deck frames', () => {
  it('local z runs toward the bow along the heading, local x to starboard, at every heading', () => {
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 2.8, -1.1]) {
      const deck = deckOf(ship(cv, heading))!
      const bow = deckWorld(deck, 0, 100)
      // 100 m toward the bow is 100 m along the heading: north is -z, east is +x.
      expect(bow.x - deck.center.x).toBeCloseTo(Math.sin(heading) * 100, 9)
      expect(bow.z - deck.center.z).toBeCloseTo(-Math.cos(heading) * 100, 9)
      const stbd = deckWorld(deck, 10, 0)
      // Starboard is the heading rotated a quarter turn clockwise seen from above.
      expect(stbd.x - deck.center.x).toBeCloseTo(Math.cos(heading) * 10, 9)
      expect(stbd.z - deck.center.z).toBeCloseTo(Math.sin(heading) * 10, 9)
      const back = deckLocal(deck, bow.x, bow.z)
      expect(back.x).toBeCloseTo(0, 9)
      expect(back.z).toBeCloseTo(100, 9)
    }
  })

  it('insideDeck is the rectangle, insideTrapZone the band measured from the stern', () => {
    const deck = deckOf(ship(cv, 1.0))!
    const half = deck.lengthM / 2
    const on = deckWorld(deck, 0, 0)
    expect(insideDeck(deck, on.x, on.z)).toBe(true)
    const offBow = deckWorld(deck, 0, half + 0.5)
    expect(insideDeck(deck, offBow.x, offBow.z)).toBe(false)
    const offSide = deckWorld(deck, deck.widthM / 2 + 0.5, 0)
    expect(insideDeck(deck, offSide.x, offSide.z)).toBe(false)
    // The trap zone: `fromSternM` to `toSternM` measured forward from the stern (local z = -half).
    const inZone = deckWorld(deck, 3, -half + (deck.trapFromSternM + deck.trapToSternM) / 2)
    expect(insideTrapZone(deck, inZone.x, inZone.z)).toBe(true)
    const shortOfZone = deckWorld(deck, 0, -half + deck.trapFromSternM - 1)
    expect(insideTrapZone(deck, shortOfZone.x, shortOfZone.z)).toBe(false)
    const pastZone = deckWorld(deck, 0, -half + deck.trapToSternM + 1)
    expect(insideTrapZone(deck, pastZone.x, pastZone.z)).toBe(false)
    expect(insideTrapZone(deck, offSide.x, offSide.z)).toBe(false)
  })
})

describe('an airplane on a moving deck', () => {
  it('a chocked airplane holds station on the deck through 60 s of sailing including a turn', () => {
    const f6f = loadAircraftSpec('f6f-hellcat')
    // A tight loop so the ship turns inside the minute: 1 deg/s is 60 deg.
    const state = createShipState({ position: v3(0, SEA_LEVEL_M, 0), headingRad: 0, speedMps: 7.717 })
    const carrier: ShipEntity = { id: 'cv-1', spec: cv, state, previous: state, orders: { waypoints: [{ x: 0, z: 0 }, { x: 3000, z: -3000 }, { x: 0, z: -6000 }], speedMps: 7.717 } }
    const deck = deckOf(carrier)!
    const spot = deckWorld(deck, 0, -110)
    const plane = createState({
      position: v3(spot.x, deck.center.y + f6f.gear.heightM, spot.z),
      velocity: deck.velocity,
      attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - deck.headingRad),
      gearFraction: 1,
    })
    let world = createWorldOf({
      aircraft: [{ id: 'f6f-1', spec: f6f, state: plane, previous: plane, controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0, gearDown: true, brake: 1 }, assistMemory: undefined, impact: null, parked: true }],
      ships: [carrier],
      player: 'f6f-1',
    })
    world = withControls(world, 'f6f-1', { pitch: 0, roll: 0, yaw: 0, throttle: 0, gearDown: true, brake: 1 })
    let worstDriftM = 0
    for (let i = 0; i < 60 * 60; i++) {
      world = advance(world, DT).world
      const ship = world.ships[0]!
      const now = deckOf(ship)!
      const p = world.aircraft[0]!.state.position
      const local = deckLocal(now, p.x, p.z)
      worstDriftM = Math.max(worstDriftM, Math.hypot(local.x - 0, local.z - -110))
      expect(world.aircraft[0]!.impact, `impact at tick ${world.tick}`).toBeNull()
    }
    expect(Math.abs(world.ships[0]!.state.headingRad)).toBeGreaterThan(0.5)
    expect(worstDriftM).toBeLessThan(0.5)
    expect(world.aircraft[0]!.state.position.y).toBeCloseTo(deck.center.y + f6f.gear.heightM, 3)
  })
})
