import { describe, it, expect } from 'vitest'
import { loadAircraftSpec, loadShipSpec } from '../../tools/content/load.js'
import { createState, step, DT, TRAP_DECEL_MPS2, type AircraftState, type Controls } from '../../src/sim/flight/model.js'
import { deckOf, deckWorld, deckLocal, type Deck } from '../../src/sim/world/deck.js'
import { createShipState } from '../../src/sim/world/ships.js'
import { SEA_LEVEL_M } from '../../src/sim/world/terrain.js'
import { v3, sub, length } from '../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../src/sim/math/quat.js'
import type { ShipEntity } from '../../src/sim/loop.js'

const f4u = loadAircraftSpec('f4u-corsair')
const cv = loadShipSpec('essex-cv')

const carrier = (): ShipEntity => {
  const state = createShipState({ position: v3(0, SEA_LEVEL_M, 0), headingRad: 0, speedMps: 7.717 })
  return { id: 'cv-1', spec: cv, state, previous: state, orders: { waypoints: [{ x: 0, z: 0 }, { x: 0, z: -9000 }], speedMps: 7.717 } }
}

/** Wheels just touching the deck at `fromSternM` forward of the stern, rolling toward the bow at `relMps` over the deck. */
const arriving = (deck: Deck, fromSternM: number, relMps: number, sinkMps = 1.0): AircraftState => {
  const at = deckWorld(deck, 0, -deck.lengthM / 2 + fromSternM)
  return createState({
    position: v3(at.x, deck.center.y + f4u.gear.heightM + 0.05, at.z),
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
    s = step(f4u, s, controls, { dt: DT, tick: tick + 1, decks: [deck] })
    if (s.arrested && length(sub(s.velocity, deck.velocity)) < 0.05) break
  }
  return { state: s, ticks: tick }
}

/**
 * The F4U-1D's carrier recovery (onboarding run 2026-09-29): the arcade trap
 * applies to any carrier-capable airplane, but `trap.test.ts` only ever flew
 * the Hellcat. The approach speed is 1.15 x the landing-configuration stall
 * the graded card holds (37.5 m/s), about 43 m/s over the deck.
 */
const APPROACH_MPS = 43

describe('the F4U-1D on the essex-cv arresting gear', () => {
  it('is carrier capable', () => {
    expect(f4u.carrierCapable).toBe(true)
  })

  it('hook down inside the zone arrests: deck-relative speed decays at TRAP_DECEL_MPS2 to rest on the deck', () => {
    const deck = deckOf(carrier())!
    const { state, ticks } = run(arriving(deck, 60, APPROACH_MPS), HOOK, 12)
    expect(state.arrested).toBe(true)
    expect(length(sub(state.velocity, deck.velocity))).toBeLessThan(0.05)
    expect(ticks / 60).toBeCloseTo(APPROACH_MPS / TRAP_DECEL_MPS2, 0)
    const local = deckLocal(deck, state.position.x, state.position.z)
    expect(Math.abs(local.x)).toBeLessThan(2)
  })

  it('hook up rolls: no arrest, and full throttle takes it off the bow', () => {
    const deck = deckOf(carrier())!
    const { state } = run(arriving(deck, 60, APPROACH_MPS), { ...NO_HOOK, throttle: 1 }, 8)
    expect(state.arrested).toBe(false)
    const local = deckLocal(deck, state.position.x, state.position.z)
    expect(local.z).toBeGreaterThan(deck.lengthM / 2)
  })
})
