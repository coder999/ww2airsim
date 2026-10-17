import { describe, expect, it } from 'vitest'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { createState } from '../../../src/sim/flight/state.js'
import { advance, createWorldOf, type AircraftEntity, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { damageFromHit, healthyDamage } from '../../../src/sim/damage/model.js'
import { creditDownedAircraft, type CombatState } from '../../../src/sim/weapons/combat.js'
import { aircraftTargetType } from '../../../src/sim/weapons/targetType.js'
import { flatField } from '../mission/fixture.js'

/**
 * F10-0 T0.11 (2026-10-17): the Ki-57 is a transport AIRCRAFT. GAMEPLAY.md's scoring table pays "bomber or transport aircraft" 750; the plain
 * `transport` row (500) is the merchant ships'. Combat used to credit `spec.role` directly, so a Ki-57 (A6, J5, J6 all shoot them) paid 500.
 */
const ki57 = loadAircraftSpec('ki-57-ii-topsy')
const f6f = loadAircraftSpec('f6f-hellcat')
const plane = (id: string, spec: typeof f6f, position = v3(0, 1000, 0), velocity = v3(0, 0, 0)): AircraftEntity => {
  const state = createState({ position, velocity })
  return { id, spec, state, previous: state, controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0 }, assistMemory: undefined, impact: null, parked: false }
}
const withRecord = <M>(world: World<M>, id: string, patch: Partial<CombatState['aircraft'][string]>): World<M> => ({
  ...world, combat: { ...world.combat, aircraft: { ...world.combat.aircraft, [id]: { ...world.combat.aircraft[id]!, ...patch } } },
})

describe('the Ki-57 can be hurt at all (it had no combat block until F10-0)', () => {
  it('a hit on a wing takes structure, and it is unarmed', () => {
    expect(ki57.combat).toBeDefined()
    expect(ki57.combat!.guns).toEqual([])
    expect(ki57.combat!.gunners).toEqual([])
    expect(damageFromHit(ki57, healthyDamage(2), 'roll', 1, 'shooter').structure).toBeLessThan(1)
    expect(damageFromHit(ki57, healthyDamage(2), 'engine', 1, 'shooter', 1, 0).engines![0]).toBeLessThan(1)
  })
})

describe('transport aircraft score as the bomber row', () => {
  it('maps a transport aircraft to the bomber row and leaves the others alone', () => {
    expect(aircraftTargetType('transport')).toBe('bomber')
    expect(aircraftTargetType('bomber')).toBe('bomber')
    expect(aircraftTargetType('fighter')).toBe('fighter')
    expect(ki57.role).toBe('transport') // the premise: if this ever changes, so does the rule
  })
  it('a Ki-57 downed after the shooter hit it credits the bomber row, not the merchant row', () => {
    const world = createWorldOf({ aircraft: [plane('f6f-1', f6f), plane('topsy', ki57, v3(500, 1000, 0))], player: 'f6f-1' })
    const hit = withRecord(world, 'topsy', { lastHitBy: 'f6f-1' })
    // `attacker: null`: a break-up or crash after a hit, credited to whoever hit it last (a direct killing hit is credited by `stepCombat` itself)
    const down = withRecord(hit, 'topsy', { damage: { ...hit.combat.aircraft['topsy']!.damage, destroyedAt: 5, attacker: null } })
    const credited = creditDownedAircraft(hit.combat, down.combat, hit.aircraft, down.aircraft)
    expect(credited.aircraft['f6f-1']!.killsByType.bomber).toBe(1)
    expect(credited.aircraft['f6f-1']!.killsByType.transport).toBe(0)
  })
  it('and so does one that crashes after being hit', () => {
    const w0 = createWorldOf({
      aircraft: [plane('f6f-1', f6f, v3(0, 3000, 0), v3(120, 0, 0)), plane('topsy', ki57, v3(2000, 5, 0), v3(80, -20, 0))],
      player: 'f6f-1', terrain: flatField(0),
    })
    let w = withRecord(w0, 'topsy', { lastHitBy: 'f6f-1' })
    for (let i = 0; i < 120; i++) w = advance(w, DT).world
    expect(w.combat.aircraft['f6f-1']!.killsByType.bomber).toBe(1)
    expect(w.combat.aircraft['f6f-1']!.tagCredits.transport).toBe(0)
  })
})
