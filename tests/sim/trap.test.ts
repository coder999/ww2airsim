import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { loadAircraftSpec, loadShipSpec } from '../../tools/content/load.js'
import { createState, step, DT, TRAP_DECEL_MPS2, type AircraftState, type Controls } from '../../src/sim/flight/model.js'
import type { AircraftSpec } from '../../src/sim/flight/schema.js'
import { deckOf, deckWorld, deckLocal, type Deck } from '../../src/sim/world/deck.js'
import { createShipState } from '../../src/sim/world/ships.js'
import { SEA_LEVEL_M } from '../../src/sim/world/terrain.js'
import { v3, sub, length } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import type { ShipEntity } from '../../src/sim/loop.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const cv = loadShipSpec('essex-cv')

const carrier = (ship = cv): ShipEntity => {
  const state = createShipState({ position: v3(0, SEA_LEVEL_M, 0), headingRad: 0, speedMps: 7.717 })
  return { id: 'cv-1', spec: ship, state, previous: state, orders: { waypoints: [{ x: 0, z: 0 }, { x: 0, z: -9000 }], speedMps: 7.717 } }
}

/** Wheels just touching the deck at `fromSternM` forward of the stern, rolling toward the bow at `relMps` over the deck. */
const arriving = (deck: Deck, fromSternM: number, relMps: number, sinkMps = 1.0, spec: AircraftSpec = f6f): AircraftState => {
  const at = deckWorld(deck, 0, -deck.lengthM / 2 + fromSternM)
  return createState({
    position: v3(at.x, deck.center.y + spec.gear.heightM + 0.05, at.z),
    velocity: v3(deck.velocity.x, -sinkMps, deck.velocity.z - relMps),
    attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2),
    gearFraction: 1,
    flapFraction: 1,
  })
}

const HOOK: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0, gearDown: true, flapDown: true, hookDown: true }
const NO_HOOK: Controls = { ...HOOK, hookDown: false }

function run(state: AircraftState, controls: Controls, seconds: number, spec: AircraftSpec = f6f, deck: Deck = deckOf(carrier())!): { state: AircraftState; ticks: number } {
  let s = state
  let tick = 0
  for (; tick < 60 * seconds; tick++) {
    s = step(spec, s, controls, { dt: DT, tick: tick + 1, decks: [deck] })
    if (s.arrested && length(sub(s.velocity, deck.velocity)) < 0.05) break
  }
  return { state: s, ticks: tick }
}

/** Every carrier in content, so a new flight deck is landed on without a new file (M1e, Zuikaku). */
const carriers = readdirSync('content/ships').filter((f) => f.endsWith('.json'))
  .map((f) => loadShipSpec(f.replace(/\.json$/, ''))).filter((ship) => ship.flightDeck !== undefined && ship.trapZone !== undefined)

it('the carrier list is every flight deck with a trap zone, so an empty filter cannot pass silently', () => {
  expect(carriers.map((ship) => ship.id).sort()).toEqual(['casablanca-cve', 'essex-cv', 'zuikaku-cv'])
})

describe.each(carriers.map((ship) => [ship.id, ship] as const))('the arcade trap on %s (Plan 8)', (_id, ship) => {
  it('hook down inside the zone arrests: deck-relative speed decays at TRAP_DECEL_MPS2 to rest on the deck', () => {
    const deck = deckOf(carrier(ship))!
    const { state, ticks } = run(arriving(deck, 60, 34), HOOK, 10, f6f, deck)
    expect(state.arrested).toBe(true)
    expect(length(sub(state.velocity, deck.velocity))).toBeLessThan(0.05)
    expect(ticks / 60).toBeCloseTo(34 / TRAP_DECEL_MPS2, 0)
    const local = deckLocal(deck, state.position.x, state.position.z)
    expect(local.z + deck.lengthM / 2).toBeLessThan(deck.trapToSternM + 40)
    expect(Math.abs(local.x)).toBeLessThan(2)
  })

  it('hook up rolls: no arrest, and full throttle takes it off the bow', () => {
    const deck = deckOf(carrier(ship))!
    const { state } = run(arriving(deck, 60, 34), { ...NO_HOOK, throttle: 1 }, 6, f6f, deck)
    expect(state.arrested).toBe(false)
    const local = deckLocal(deck, state.position.x, state.position.z)
    expect(local.z).toBeGreaterThan(deck.lengthM / 2)
  })

  it('hook down but short of the zone rolls into it and traps there; past the zone never traps', () => {
    const deck = deckOf(carrier(ship))!
    const short = run(arriving(deck, 10, 34), HOOK, 10, f6f, deck)
    expect(short.state.arrested).toBe(true)
    const past = run(arriving(deck, deck.trapToSternM + 5, 34), HOOK, 4, f6f, deck)
    expect(past.state.arrested).toBe(false)
  })

  it('an arrival outside the sink gate is not a trap', () => {
    const deck = deckOf(carrier(ship))!
    const s = step(f6f, arriving(deck, 60, 34, 6.0), HOOK, { dt: DT, tick: 1, decks: [deck] })
    expect(s.arrested).toBe(false)
  })

  it('leaving the deck clears the arrest flag', () => {
    const deck = deckOf(carrier(ship))!
    const trapped = run(arriving(deck, 60, 34), HOOK, 10, f6f, deck).state
    // Teleport the trapped airplane's position off the side: the rule is about where the wheels are.
    const side = deckWorld(deck, deck.widthM, 0)
    const off = step(f6f, { ...trapped, position: v3(side.x, trapped.position.y + 5, side.z) }, HOOK, { dt: DT, tick: 9999, decks: [deck] })
    expect(off.arrested).toBe(false)
  })
})

/**
 * Every carrier-capable airframe on its own side's fleet carrier's arresting
 * gear (the Essex, or the Zuikaku for a Japanese airframe; D1, 2026-10-09),
 * enrolled from content so a new one is covered without a new file. Replaces
 * trapCorsair.test.ts and trapVal.test.ts (2026-10-08), which were copies of
 * this file differing only in the airframe and approach speed. The approach
 * is 1.15 x the landing-configuration stall the graded card holds.
 */
const carrierCapable = readdirSync('content/aircraft').filter((f) => f.endsWith('.json'))
  .map((f) => loadAircraftSpec(f.replace(/\.json$/, ''))).filter((spec) => spec.carrierCapable)

const homeDeck = (spec: AircraftSpec) => loadShipSpec(spec.side === 'japanese' ? 'zuikaku-cv' : 'essex-cv')
describe.each(carrierCapable.map((spec) => [spec.id, homeDeck(spec).id, spec] as const))('%s on the %s arresting gear', (_id, _ship, spec) => {
  const approachMps = 1.15 * spec.reference.stallSpeedFlapMps
  const carrier_ = () => carrier(homeDeck(spec))

  it('hook down arrests to rest on the deck at TRAP_DECEL_MPS2', () => {
    const deck = deckOf(carrier_())!
    const { state, ticks } = run(arriving(deck, 60, approachMps, 1.0, spec), HOOK, 12, spec, deck)
    expect(state.arrested).toBe(true)
    expect(length(sub(state.velocity, deck.velocity))).toBeLessThan(0.05)
    expect(ticks / 60).toBeCloseTo(approachMps / TRAP_DECEL_MPS2, 0)
    expect(Math.abs(deckLocal(deck, state.position.x, state.position.z).x)).toBeLessThan(2)
  })

  it('hook up rolls: no arrest, and full throttle takes it off the bow', () => {
    const deck = deckOf(carrier_())!
    const { state } = run(arriving(deck, 60, approachMps, 1.0, spec), { ...NO_HOOK, throttle: 1 }, 8, spec, deck)
    expect(state.arrested).toBe(false)
    expect(deckLocal(deck, state.position.x, state.position.z).z).toBeGreaterThan(deck.lengthM / 2)
  })
})

it('the carrier-capable list is the seven carrier airframes, so an empty filter cannot pass silently', () => {
  expect(carrierCapable.map((spec) => spec.id).sort()).toEqual(['a6m2-zero', 'b5n2-kate', 'd3a-val', 'f4f-wildcat', 'f4u-corsair', 'f6f-hellcat', 'tbm-3-avenger'])
})
