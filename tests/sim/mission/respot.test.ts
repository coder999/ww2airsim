import { describe, it, expect } from 'vitest'
import { missionWorld, steps, deepFreeze, scenario } from './fixture.js'
import { advance, playerAircraft, withAircraftState, withControls, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { deckOf, deckLocal } from '../../../src/sim/world/deck.js'
import { ticksFor, lastLanding } from '../../../src/sim/mission/state.js'
import { RESPOT_DELAY_S, RESPOT_MESSAGE, stateOnDeck } from '../../../src/sim/mission/respot.js'
import { parseScenario } from '../../../src/sim/scenario.js'
import { v3 } from '../../../src/sim/math/vec3.js'

const ON_DECK = { id: 'f6f-1', spec: 'f6f-hellcat', parkedAt: { ship: 'cv-1', spot: { x: 0, z: -110 } }, chocked: false }
const TRAPS = { id: 'traps', label: 'Trap', priority: 'primary', kind: 'land', at: 'cv-1', count: 3, respot: true }
const TRAPS_FINAL = { id: 'traps', label: 'Trap', priority: 'primary', kind: 'land', at: 'cv-1', count: 1, respot: true }
const TRAPS_NO_RESPOT = { id: 'traps', label: 'Trap', priority: 'primary', kind: 'land', at: 'cv-1', count: 3 }
const deckWorldOf = (patch: Record<string, unknown> = {}) =>
  missionWorld({ aircraft: [ON_DECK], objectives: [TRAPS], ...patch })

/** Puts the player at rest in the trap zone, arrested, and steps until the
 *  mission logs the landing: the same "at rest on the deck" state a real
 *  trap ends in (Measured: 102 m from the stern). */
function trappedAt(w: World<undefined>): World<undefined> {
  const p = playerAircraft(w)
  const deck = deckOf(w.ships.find((s) => s.id === 'cv-1')!)!
  const base = stateOnDeck(p.spec, deck, { x: 0, z: -29 })
  let world = withControls(w, p.id, { pitch: 0, roll: 0, yaw: 0, throttle: 0, gearDown: true, hookDown: true, brake: 1 })
  // Step 1 note: an already-at-rest, already-arrested state never crosses
  // AIRBORNE_LATCH_M, so `nextLandingTracking` never latches `airborne` and
  // never records a touchdown, and no landing is ever reported. This first
  // puts the airplane 50 m up (comfortably past the 10 m latch) for one
  // step, then settles it from 0.3 m above the deck at a 1 m/s sink -- the
  // same settle `recoveryAgreement.test.ts` uses -- which gives the tracker
  // a genuine touchdown to detect before the airplane comes to rest.
  const high = { ...base, position: v3(base.position.x, base.position.y + 50, base.position.z), velocity: v3(0, 0, 0) }
  world = steps(withAircraftState(world, p.id, high), 1)
  const settling = { ...base, position: v3(base.position.x, base.position.y + 0.3, base.position.z), velocity: v3(0, -1, 0) }
  world = withAircraftState(world, p.id, settling)
  for (let i = 0; i < 600 && lastLanding(world.mission!) === undefined; i++) world = steps(world, 1)
  expect(lastLanding(world.mission!), 'no landing recorded').toBeDefined()
  return world
}

describe('respot (M3-R1..R3)', () => {
  it('schema: respot needs the player parked on that ship', () => {
    expect(() => parseScenario(scenario({ objectives: [TRAPS] }))).toThrow(/respot.*parked on "cv-1"/)
  })

  it('after an intermediate trap: RESPOT_DELAY_S later, the player is on his start spot, unarrested, moving with the deck', () => {
    let w = trappedAt(deckWorldOf())
    const landedAt = w.tick
    w = steps(w, ticksFor(RESPOT_DELAY_S))
    const p = playerAircraft(w)
    const deck = deckOf(w.ships.find((s) => s.id === 'cv-1')!)!
    const local = deckLocal(deck, p.state.position.x, p.state.position.z)
    expect(local.x).toBeCloseTo(0, 1)
    expect(local.z).toBeCloseTo(-110, 0)
    expect(p.state.arrested).toBe(false)
    expect(p.previous).toBe(p.state)
    expect(w.mission!.log.filter((e) => e.kind === 'respot').map((e) => e.tick)).toEqual([landedAt + ticksFor(RESPOT_DELAY_S)])
    expect(w.mission!.log.some((e) => e.kind === 'message' && e.text === RESPOT_MESSAGE)).toBe(true)
  })

  it('no respot after the FINAL trap (count reached)', () => {
    let w = trappedAt(deckWorldOf({ objectives: [TRAPS_FINAL] }))
    w = steps(w, ticksFor(RESPOT_DELAY_S))
    expect(w.mission!.log.some((e) => e.kind === 'respot')).toBe(false)
  })

  it('no respot without respot: true', () => {
    let w = trappedAt(deckWorldOf({ objectives: [TRAPS_NO_RESPOT] }))
    w = steps(w, ticksFor(RESPOT_DELAY_S))
    expect(w.mission!.log.some((e) => e.kind === 'respot')).toBe(false)
  })

  it('killed during the delay: no respot, no throw (Review Focus 3)', () => {
    let w = trappedAt(deckWorldOf())
    const rec = w.combat.aircraft[w.player]!
    w = {
      ...w,
      combat: {
        ...w.combat,
        aircraft: { ...w.combat.aircraft, [w.player]: { ...rec, damage: { ...rec.damage, destroyedAt: w.tick, attacker: null } } },
      },
    }
    expect(() => { w = steps(w, ticksFor(RESPOT_DELAY_S)) }).not.toThrow()
    expect(w.mission!.log.some((e) => e.kind === 'respot')).toBe(false)
  })

  it('hook-down roll after respot re-arrests in the zone and logs no landing (Review Focus 1)', () => {
    let w = trappedAt(deckWorldOf())
    w = steps(w, ticksFor(RESPOT_DELAY_S))
    const landingsBefore = w.mission!.log.filter((e) => e.kind === 'landing').length
    w = withControls(w, w.player, { pitch: 0, roll: 0, yaw: 0, throttle: 1, gearDown: true, hookDown: true })
    let arrestedAtSomeTick = false
    for (let i = 0; i < 600; i++) {
      w = steps(w, 1)
      if (playerAircraft(w).state.arrested) { arrestedAtSomeTick = true; break }
    }
    expect(arrestedAtSomeTick).toBe(true)
    const landingsAfter = w.mission!.log.filter((e) => e.kind === 'landing').length
    expect(landingsAfter).toBe(landingsBefore)
  })

  it('advance does not write into its input across a respot', () => {
    let w = trappedAt(deckWorldOf())
    w = steps(w, ticksFor(RESPOT_DELAY_S) - 1)
    deepFreeze(w)
    expect(() => advance(w, DT)).not.toThrow()
  })
})
