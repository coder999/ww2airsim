import { describe, it, expect } from 'vitest'
import { loadAircraftSpec, loadShipSpec } from '../../tools/content/load.js'
import { createState, step, DT, TRAP_DECEL_MPS2, type AircraftState, type Controls } from '../../src/sim/flight/model.js'
import { deckOf, deckWorld, deckLocal, type Deck } from '../../src/sim/world/deck.js'
import { createShipState } from '../../src/sim/world/ships.js'
import { SEA_LEVEL_M } from '../../src/sim/world/terrain.js'
import { v3, sub, length } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import type { ShipEntity } from '../../src/sim/loop.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const cv = loadShipSpec('essex-cv')

const carrier = (): ShipEntity => {
  const state = createShipState({ position: v3(0, SEA_LEVEL_M, 0), headingRad: 0, speedMps: 7.717 })
  return { id: 'cv-1', spec: cv, state, previous: state, orders: { waypoints: [{ x: 0, z: 0 }, { x: 0, z: -9000 }], speedMps: 7.717 } }
}

/** Wheels just touching the deck at `fromSternM` forward of the stern, rolling toward the bow at `relMps` over the deck. */
const arriving = (deck: Deck, fromSternM: number, relMps: number, sinkMps = 1.0): AircraftState => {
  const at = deckWorld(deck, 0, -deck.lengthM / 2 + fromSternM)
  return createState({
    position: v3(at.x, deck.center.y + f6f.gear.heightM + 0.05, at.z),
    velocity: v3(deck.velocity.x, -sinkMps, deck.velocity.z - relMps),
    attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2),
    gearFraction: 1,
    flapFraction: 1,
  })
}

const HOOK: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0, gearDown: true, flapDown: true, hookDown: true }
const NO_HOOK: Controls = { ...HOOK, hookDown: false }

function run(state: AircraftState, controls: Controls, seconds: number): { state: AircraftState; ticks: number } {
  const deck = deckOf(carrier())!
  let s = state
  let tick = 0
  for (; tick < 60 * seconds; tick++) {
    s = step(f6f, s, controls, { dt: DT, tick: tick + 1, decks: [deck] })
    if (s.arrested && length(sub(s.velocity, deck.velocity)) < 0.05) break
  }
  return { state: s, ticks: tick }
}

describe('the arcade trap (Plan 8)', () => {
  it('hook down inside the zone arrests: deck-relative speed decays at TRAP_DECEL_MPS2 to rest on the deck', () => {
    const deck = deckOf(carrier())!
    const { state, ticks } = run(arriving(deck, 60, 34), HOOK, 10)
    expect(state.arrested).toBe(true)
    expect(length(sub(state.velocity, deck.velocity))).toBeLessThan(0.05)
    expect(ticks / 60).toBeCloseTo(34 / TRAP_DECEL_MPS2, 0)
    const local = deckLocal(deck, state.position.x, state.position.z)
    expect(local.z + deck.lengthM / 2).toBeLessThan(deck.trapToSternM + 40)
    expect(Math.abs(local.x)).toBeLessThan(2)
  })

  it('hook up rolls: no arrest, and full throttle takes it off the bow', () => {
    const deck = deckOf(carrier())!
    const { state } = run(arriving(deck, 60, 34), { ...NO_HOOK, throttle: 1 }, 6)
    expect(state.arrested).toBe(false)
    const local = deckLocal(deck, state.position.x, state.position.z)
    expect(local.z).toBeGreaterThan(deck.lengthM / 2)
  })

  it('hook down but short of the zone rolls into it and traps there; past the zone never traps', () => {
    const deck = deckOf(carrier())!
    const short = run(arriving(deck, 10, 34), HOOK, 10)
    expect(short.state.arrested).toBe(true)
    const past = run(arriving(deck, deck.trapToSternM + 5, 34), HOOK, 4)
    expect(past.state.arrested).toBe(false)
  })

  it('an arrival outside the sink gate is not a trap', () => {
    const deck = deckOf(carrier())!
    const s = step(f6f, arriving(deck, 60, 34, 6.0), HOOK, { dt: DT, tick: 1, decks: [deck] })
    expect(s.arrested).toBe(false)
  })

  it('leaving the deck clears the arrest flag', () => {
    const deck = deckOf(carrier())!
    const trapped = run(arriving(deck, 60, 34), HOOK, 10).state
    // Teleport the trapped airplane's position off the side: the rule is about where the wheels are.
    const side = deckWorld(deck, deck.widthM, 0)
    const off = step(f6f, { ...trapped, position: v3(side.x, trapped.position.y + 5, side.z) }, HOOK, { dt: DT, tick: 9999, decks: [deck] })
    expect(off.arrested).toBe(false)
  })
})
