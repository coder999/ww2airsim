import { describe, it, expect } from 'vitest'
import { groundUnder } from '../../../src/sim/world/ground.js'
import { deckOf, deckWorld, deckAxes } from '../../../src/sim/world/deck.js'
import { createShipState, shipVelocity } from '../../../src/sim/world/ships.js'
import { createTerrainField, SEA_LEVEL_M } from '../../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../../src/sim/world/schema.js'
import { loadShipSpec } from '../../../tools/content/load.js'
import { v3, sub, dot, length, ZERO } from '../../../src/sim/math/vec3.js'
import type { ShipEntity } from '../../../src/sim/loop.js'

const cv = loadShipSpec('essex-cv')
const header = parseTerrainHeader({ centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000, finestSamples: 8193, levels: 13, encoding: 'int16-decimetres' })
const sea = createTerrainField(header, 12, new Int16Array(9).fill(0))
const land = createTerrainField(header, 12, new Int16Array(9).fill(10))

const carrier = (headingRad: number): ShipEntity => {
  const state = createShipState({ position: v3(500, SEA_LEVEL_M, 500), headingRad, speedMps: 7.717 })
  return { id: 'cv-1', spec: cv, state, previous: state, orders: { waypoints: [{ x: 500, z: 500 }, { x: 500, z: 0 }], speedMps: 7.717 } }
}

describe('groundUnder', () => {
  it('is null with no terrain and no decks, and terrain without decks is what heightAt says', () => {
    expect(groundUnder(null, [], 0, 0)).toBeNull()
    expect(groundUnder(sea, [], 0, 0)).toEqual({ heightM: 0, surface: 'water', velocity: ZERO, deck: null })
    expect(groundUnder(land, [], 0, 0)).toEqual({ heightM: 1, surface: 'land', velocity: ZERO, deck: null })
  })

  it('a deck wins over the water under it, with the ship velocity, and only inside its rectangle', () => {
    const deck = deckOf(carrier(0.7))!
    const on = deckWorld(deck, 5, -40)
    const g = groundUnder(sea, [deck], on.x, on.z)!
    expect(g.surface).toBe('deck')
    expect(g.heightM).toBe(SEA_LEVEL_M + cv.flightDeck!.heightM)
    expect(g.velocity).toEqual(shipVelocity(0.7, 7.717))
    expect(g.deck).toBe(deck)
    const off = deckWorld(deck, deck.widthM, 0)
    expect(groundUnder(sea, [deck], off.x, off.z)).toEqual({ heightM: 0, surface: 'water', velocity: ZERO, deck: null })
  })

  it('a deck exists even with no terrain field yet: a deck spawn needs no heightfield', () => {
    const deck = deckOf(carrier(0))!
    const on = deckWorld(deck, 0, 0)
    expect(groundUnder(null, [deck], on.x, on.z)!.surface).toBe('deck')
    expect(groundUnder(null, [deck], on.x + 1000, on.z)).toBeNull()
  })

  it('a turning ship adds the rigid-body rotational term at an off-center point, and none at the center', () => {
    // 1 deg/s at DT = 1/60: previous heading is one tick's worth less than
    // state's, so deckOf's wrapPi(state - previous) / DT recovers it.
    const yawStepRad = 0.0174533 / 60
    const state = createShipState({ position: v3(500, SEA_LEVEL_M, 500), headingRad: 0, speedMps: 7.717 })
    const previous = createShipState({ ...state, headingRad: state.headingRad - yawStepRad })
    const turning: ShipEntity = {
      id: 'cv-1',
      spec: cv,
      state,
      previous,
      orders: { waypoints: [{ x: 500, z: 500 }, { x: 500, z: 0 }], speedMps: 7.717 },
    }
    const deck = deckOf(turning)!
    expect(deck.yawRateRadPerS).toBeCloseTo(0.0174533, 6)

    // At the center, the rotational term is zero: the point velocity is
    // exactly the deck's own.
    const atCenter = groundUnder(null, [deck], deck.center.x, deck.center.z)!
    expect(atCenter.velocity).toEqual(deck.velocity)

    // 110 m aft on the centerline: a ship turning to starboard (heading
    // increasing) swings its stern to port.
    const spot = deckWorld(deck, 0, -110)
    const g = groundUnder(null, [deck], spot.x, spot.z)!
    const vRot = sub(g.velocity, deck.velocity)
    expect(length(vRot)).toBeCloseTo(0.0174533 * 110, 3)
    const { starboard } = deckAxes(deck)
    expect(dot(vRot, v3(starboard.x, 0, starboard.z))).toBeLessThan(0)
  })
})
