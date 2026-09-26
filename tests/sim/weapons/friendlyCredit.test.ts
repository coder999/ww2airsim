import { describe, expect, it } from 'vitest'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { createState } from '../../../src/sim/flight/state.js'
import { advance, createWorldOf, type AircraftEntity, type Stepper, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import type { Side } from '../../../src/sim/sides.js'
import { missionScore } from '../../../src/render/debrief.js'
import { TARGET_TYPES } from '../../../src/sim/weapons/targetType.js'
import { flatField } from '../mission/fixture.js'

/**
 * 7e spec §4.3: friendly fire stays physical -- a round hits whatever it
 * hits -- but a same-side hit or kill is counted only in `friendlyHits` /
 * `friendlyKills`, never in `hits`, `kills` or `killsByType` (ruling W1), so
 * Plan 9's score cannot reward a teamkill.
 */
const f6f = loadAircraftSpec('f6f-hellcat')
const plane = (id: string, position = v3(0, 1000, 0), velocity = v3(0, 0, 0), side?: Side): AircraftEntity => {
  const state = createState({ position, velocity })
  return {
    id, spec: f6f, state, previous: state, controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0 }, assistMemory: undefined, impact: null, parked: false,
    ...(side === undefined ? {} : { side }),
  }
}
/** Holds every airplane where it is: the gunnery is what is under test. */
const still: Stepper = (_spec, state, _controls, ctx) => ({ ...state, tick: ctx.tick })

/** The player holds the trigger on an aircraft 300 m off its nose until it is destroyed. */
function shootDown(targetSide: Side | undefined): World {
  let world = createWorldOf({ aircraft: [plane('f6f-1'), plane('other', v3(300, 1000, 0), v3(0, 0, 0), targetSide)], player: 'f6f-1' })
  world = { ...world, aircraft: world.aircraft.map((a) => a.id === 'f6f-1' ? { ...a, controls: { ...a.controls, fire: true } } : a) }
  for (let i = 0; i < 1200 && world.combat.aircraft['other']!.damage.destroyedAt === null; i++) world = advance(world, DT, still).world
  expect(world.combat.aircraft['other']!.damage.destroyedAt, 'the target was never destroyed').not.toBeNull()
  return world
}

describe('friendly fire (7e spec §4.3)', () => {
  it('an allied aircraft takes the rounds, and they count only as friendly hits and one friendly kill', () => {
    const w = shootDown('allied')
    const me = w.combat.aircraft['f6f-1']!
    expect(w.combat.aircraft['other']!.damage.attacker).toBe('f6f-1')
    expect(me.friendlyHits).toBeGreaterThan(0)
    expect(me.friendlyKills).toBe(1)
    expect(me.hits).toBe(0)
    expect(me.kills).toBe(0)
    for (const t of TARGET_TYPES) expect(me.killsByType[t], t).toBe(0)
  })

  it("Plan 9's missionScore for shooting down an allied AI adds nothing", () => {
    const me = shootDown('allied').combat.aircraft['f6f-1']!
    expect(missionScore(me.killsByType, 'landed').total).toBe(0)
  })

  it('an axis aircraft is credited exactly as before 7e', () => {
    const me = shootDown(undefined).combat.aircraft['f6f-1']!
    expect(me.hits).toBeGreaterThan(0)
    expect(me.kills).toBe(1)
    expect(me.killsByType.fighter).toBe(1)
    expect(me.friendlyHits).toBe(0)
    expect(me.friendlyKills).toBe(0)
    expect(missionScore(me.killsByType, 'landed').total).toBeGreaterThan(0)
  })

  it('an ally that crashes after a friendly hit is a friendly kill, not a kill', () => {
    let world = createWorldOf({
      aircraft: [plane('f6f-1', v3(0, 3000, 0), v3(120, 0, 0)), plane('ally', v3(2000, 5, 0), v3(80, -20, 0), 'allied')],
      player: 'f6f-1',
      terrain: flatField(0),
    })
    world = { ...world, combat: { ...world.combat, aircraft: { ...world.combat.aircraft, ally: { ...world.combat.aircraft['ally']!, lastHitBy: 'f6f-1' } } } }
    for (let i = 0; i < 120; i++) world = advance(world, DT).world
    expect(world.aircraft.find((a) => a.id === 'ally')!.impact).not.toBeNull()
    const me = world.combat.aircraft['f6f-1']!
    expect(me.friendlyKills).toBe(1)
    expect(me.kills).toBe(0)
    expect(me.killsByType.fighter).toBe(0)
  })

  it('every new combat record starts with zero friendly hits and kills', () => {
    const w = createWorldOf({ aircraft: [plane('f6f-1')], player: 'f6f-1' })
    expect(w.combat.aircraft['f6f-1']!.friendlyHits).toBe(0)
    expect(w.combat.aircraft['f6f-1']!.friendlyKills).toBe(0)
  })
})
