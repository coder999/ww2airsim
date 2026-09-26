import { describe, expect, it } from 'vitest'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { createState } from '../../../src/sim/flight/state.js'
import { advance, createWorldOf, type AircraftEntity, type Stepper, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { creditDownedAircraft, isAircraftDown, type CombatState } from '../../../src/sim/weapons/combat.js'
import { flatField } from '../mission/fixture.js'

/**
 * Mark, 2026-09-25: "an enemy plane that is destroyed for any reason after
 * being hit by the player should count as a kill". Before this, a kill was
 * credited only on the killing hit, so a damaged plane that then crashed, or
 * broke up under its own overload (`damageFromStructuralOverload` records no
 * attacker), credited nobody.
 */
const f6f = loadAircraftSpec('f6f-hellcat')
const plane = (id: string, position = v3(0, 1000, 0), velocity = v3(0, 0, 0)): AircraftEntity => {
  const state = createState({ position, velocity })
  return { id, spec: f6f, state, previous: state, controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0 }, assistMemory: undefined, impact: null, parked: false }
}
/** Holds every airplane where it is: the gunnery is what is under test. */
const still: Stepper = (_spec, state, _controls, ctx) => ({ ...state, tick: ctx.tick })

const withRecord = <M>(world: World<M>, id: string, patch: Partial<CombatState['aircraft'][string]>): World<M> => ({
  ...world,
  combat: { ...world.combat, aircraft: { ...world.combat.aircraft, [id]: { ...world.combat.aircraft[id]!, ...patch } } },
})

describe('lastHitBy', () => {
  it('records the shooter on the target the moment a round lands', () => {
    let world = createWorldOf({ aircraft: [plane('f6f-1'), plane('bandit', v3(300, 1000, 0))], player: 'f6f-1' })
    expect(world.combat.aircraft['bandit']!.lastHitBy).toBeNull()
    world = { ...world, aircraft: world.aircraft.map((a) => a.id === 'f6f-1' ? { ...a, controls: { ...a.controls, fire: true } } : a) }
    for (let i = 0; i < 60 && world.combat.aircraft['f6f-1']!.hits === 0; i++) world = advance(world, DT, still).world
    expect(world.combat.aircraft['f6f-1']!.hits).toBeGreaterThan(0)
    expect(world.combat.aircraft['bandit']!.lastHitBy).toBe('f6f-1')
    // Not enough to destroy it: this is the "damaged, not yet a kill" state.
    expect(world.combat.aircraft['bandit']!.damage.destroyedAt).toBeNull()
    expect(world.combat.aircraft['f6f-1']!.kills).toBe(0)
  })
})

describe('a plane that crashes after being hit is a kill', () => {
  // A bandit 5 m over a flat sea, sinking at 20 m/s: the real stepper and
  // impact test put it in the water within a second.
  const crashing = (lastHitBy: string | null) => {
    const world = createWorldOf({
      aircraft: [plane('f6f-1', v3(0, 3000, 0), v3(120, 0, 0)), plane('bandit', v3(2000, 5, 0), v3(80, -20, 0))],
      player: 'f6f-1',
      terrain: flatField(0),
    })
    return withRecord(world, 'bandit', { lastHitBy })
  }
  const fly = (world: World) => {
    let w = world
    for (let i = 0; i < 120; i++) w = advance(w, DT).world
    expect(w.aircraft.find((a) => a.id === 'bandit')!.impact).not.toBeNull()
    return w
  }

  it('credits whoever hit it last, by type', () => {
    const after = fly(crashing('f6f-1'))
    expect(after.combat.aircraft['f6f-1']!.kills).toBe(1)
    expect(after.combat.aircraft['f6f-1']!.killsByType.fighter).toBe(1)
  })

  it('credits nobody when nothing had hit it', () => {
    const after = fly(crashing(null))
    expect(after.combat.aircraft['f6f-1']!.kills).toBe(0)
  })

  it('credits it once, not on every tick the wreck lies there', () => {
    let w = fly(crashing('f6f-1'))
    for (let i = 0; i < 60; i++) w = advance(w, DT).world
    expect(w.combat.aircraft['f6f-1']!.kills).toBe(1)
  })
})

describe('creditDownedAircraft', () => {
  const world = createWorldOf({ aircraft: [plane('f6f-1'), plane('bandit', v3(500, 1000, 0))], player: 'f6f-1' })
  const hit = withRecord(world, 'bandit', { lastHitBy: 'f6f-1' })
  const destroyedBy = (attacker: string | null) =>
    withRecord(hit, 'bandit', { damage: { ...hit.combat.aircraft['bandit']!.damage, destroyedAt: 5, attacker } })

  it('credits a structural break-up after a hit (overload records no attacker)', () => {
    const after = destroyedBy(null)
    const credited = creditDownedAircraft(hit.combat, after.combat, hit.aircraft, after.aircraft)
    expect(credited.aircraft['f6f-1']!.kills).toBe(1)
    expect(credited.aircraft['f6f-1']!.killsByType.fighter).toBe(1)
  })

  it('leaves a killing hit alone: stepCombat already credited it', () => {
    const after = destroyedBy('f6f-1')
    expect(creditDownedAircraft(hit.combat, after.combat, hit.aircraft, after.aircraft)).toBe(after.combat)
  })

  it('returns the same object when nothing went down', () => {
    expect(creditDownedAircraft(hit.combat, hit.combat, hit.aircraft, hit.aircraft)).toBe(hit.combat)
  })

  it('treats crashed and destroyed alike as down', () => {
    const bandit = hit.aircraft[1]!
    expect(isAircraftDown(hit.combat.aircraft, bandit)).toBe(false)
    expect(isAircraftDown(destroyedBy(null).combat.aircraft, bandit)).toBe(true)
    expect(isAircraftDown(hit.combat.aircraft, { ...bandit, impact: { tick: 1, position: bandit.state.position } as never })).toBe(true)
  })
})
