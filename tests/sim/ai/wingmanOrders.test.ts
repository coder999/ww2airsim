import { describe, expect, it } from 'vitest'
import { advance, aircraftById, withControls, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { length, sub } from '../../../src/sim/math/vec3.js'
import { stationPoint, STATIONS, TRAIL_COVER } from '../../../src/sim/ai/formation.js'
import { orderWingmen, playerAttackTarget } from '../../../src/sim/ai/wingmanOrders.js'
import { initialFrameStateFor, nextFrameState, WINGMAN_RADIO } from '../../../src/render/frame.js'
import { radioFeed } from '../../../src/render/mission/hud.js'
import { BINDINGS } from '../../../src/input/bindings.js'
import { runCanned, straight } from './maneuverWorlds.js'
import { buildFormation, PLAYER_EAST, wingman } from './formationWorlds.js'

/**
 * E4: the player's calls to his wingmen (Mark, 2026-10-10): Attack, Cover me,
 * Form up. Through production `advance`; the player flies straight and level
 * east at 3,000 m, its wingman `ally-1` in slot 1.
 */
const WING = wingman('ally-1', 'f6f-1', 1, [-80, 3000, 100])
/** An axis airplane with no pilot: it flies on straight, threatening nobody. */
const bandit = (id: string, x: number, z: number, headingDeg = 90) =>
  ({ id, spec: 'a6m2-zero', side: 'axis', airborneAt: { position: [x, 3000, z], headingDeg, speedMps: 110 } })
/** An axis fighter attacking the player. */
const attacker = (id: string, x: number, z: number) =>
  ({ ...bandit(id, x, z), pilot: { skill: 'green', target: 'f6f-1' } })

const wing = (w: World<undefined>) => aircraftById(w, 'ally-1')!
/** One tick, the player flying straight. */
const tick = (w: World<undefined>) => advance(withControls(w, 'f6f-1', straight(aircraftById(w, 'f6f-1')!, w)), DT).world

describe('orderWingmen', () => {
  it('puts the call on the player\'s wingmen only, and has them rescore this tick', () => {
    const w = tick(buildFormation([PLAYER_EAST, WING, attacker('a-1', -3000, 0)]))
    const ordered = orderWingmen(w, { kind: 'cover' })
    expect(wing(ordered).pilot!.formation!.order).toEqual({ kind: 'cover' })
    expect(wing(ordered).pilot!.decision.nextRescoreS).toBeCloseTo(w.tick * DT, 9)
    expect(aircraftById(ordered, 'a-1')).toBe(aircraftById(w, 'a-1'))
  })

  it('with no wingman, nothing changes', () => {
    const w = buildFormation([PLAYER_EAST, bandit('b-1', 3000, 0)])
    expect(orderWingmen(w, { kind: 'form' })).toBe(w)
  })
})

describe('playerAttackTarget', () => {
  const w = buildFormation([PLAYER_EAST, WING, bandit('ahead', 5000, 0), bandit('behind', -1500, 0), bandit('abeam', 0, 2000)])
  it('names the nearest enemy within 60° of the nose, not a nearer one behind or abeam', () => {
    expect(playerAttackTarget(w, null)).toBe('ahead')
  })
  it('the autopilot\'s target wins while it has one', () => {
    expect(playerAttackTarget(w, 'behind')).toBe('behind')
  })
  it('none ahead: null (the wingman is cleared to engage anything)', () => {
    expect(playerAttackTarget(buildFormation([PLAYER_EAST, WING, bandit('behind', -1500, 0)]), null)).toBeNull()
  })
})

describe('Attack', () => {
  it('the wingman leaves the nearer contact for the named target, and the call lapses once it is down', () => {
    let w = tick(tick(buildFormation([PLAYER_EAST, WING, bandit('near', -1500, 600), bandit('named', 6000, 0)])))
    // 7f's own rule takes the near one: within COVER_RANGE_M of the leader.
    expect(wing(w).pilot!.decision.targetId).toBe('near')
    w = tick(orderWingmen(w, { kind: 'attack', target: playerAttackTarget(w, null) }))
    expect(wing(w).pilot!.decision.targetId).toBe('named')
    expect(wing(w).pilot!.decision.mode).toBe('engage')
    // Shot down: the call lapses and the wingman is back on 7f's rule.
    const rec = w.combat.aircraft['named']!
    w = { ...w, combat: { ...w.combat, aircraft: { ...w.combat.aircraft, named: { ...rec, damage: { ...rec.damage, destroyedAt: w.tick } } } } }
    w = tick(w)
    expect(wing(w).pilot!.formation!.order).toBeUndefined()
    expect(wing(w).pilot!.decision.targetId).toBe('near')
  })
})

describe('Form up', () => {
  it('the wingman drops a target that is not attacking it and takes its slot', () => {
    let w = tick(tick(buildFormation([PLAYER_EAST, WING, bandit('near', -1500, 600)])))
    expect(wing(w).pilot!.decision.targetId).toBe('near')
    w = tick(orderWingmen(w, { kind: 'form' }))
    expect(wing(w).pilot!.decision.targetId).toBeNull()
    expect(wing(w).pilot!.decision.mode).toBe('formation')
  })

  it('still fights one that is attacking it', () => {
    const w = tick(orderWingmen(tick(buildFormation([PLAYER_EAST, WING, { ...bandit('hunter', -1500, 100), pilot: { skill: 'green', target: 'ally-1' } }])), { kind: 'form' }))
    expect(wing(w).pilot!.decision.targetId).toBe('hunter')
  })
})

describe('the keys (production frame path)', () => {
  const keys = (...k: string[]) => new Set(k)
  it('one call per press, answered on the radio line; held, it is not repeated', () => {
    let f = initialFrameStateFor(buildFormation([PLAYER_EAST, WING, bandit('ahead', 5000, 0)]))
    f = nextFrameState(f, DT, keys(...BINDINGS.wingmanCover))
    expect(wing(f.world).pilot!.formation!.order).toEqual({ kind: 'cover' })
    expect(f.wingmanCalls.map((c) => c.text)).toEqual([WINGMAN_RADIO.cover])
    f = nextFrameState(f, DT, keys(...BINDINGS.wingmanCover))
    expect(f.wingmanCalls).toHaveLength(1)
    f = nextFrameState(nextFrameState(f, DT, keys()), DT, keys(...BINDINGS.wingmanAttack))
    expect(wing(f.world).pilot!.formation!.order).toEqual({ kind: 'attack', target: 'ahead' })
    f = nextFrameState(f, DT, keys(...BINDINGS.wingmanFormUp))
    expect(wing(f.world).pilot!.formation!.order).toEqual({ kind: 'form' })
    expect(radioFeed(null, null, f.wingmanCalls).map((x) => x.text)).toEqual([WINGMAN_RADIO.cover, WINGMAN_RADIO.attack, WINGMAN_RADIO.form])
  })

  it('with no wingman, a call goes unanswered', () => {
    const f = nextFrameState(initialFrameStateFor(buildFormation([PLAYER_EAST, bandit('ahead', 5000, 0)])), DT, keys(...BINDINGS.wingmanAttack))
    expect(f.wingmanCalls).toEqual([])
  })
})

describe('Cover me', () => {
  it('the wingman leaves a contact that attacks nobody, and takes one attacking the player', () => {
    let w = tick(orderWingmen(tick(buildFormation([PLAYER_EAST, WING, bandit('near', -1500, 600)])), { kind: 'cover' }))
    expect(wing(w).pilot!.decision.targetId).toBeNull()
    w = tick(orderWingmen(tick(buildFormation([PLAYER_EAST, WING, bandit('near', -1500, 600), attacker('hunter', -2500, -300)])), { kind: 'cover' }))
    expect(wing(w).pilot!.decision.targetId).toBe('hunter')
  })

  it('it flies trail cover on the player\'s tail, not its slot', () => {
    let w = orderWingmen(tick(buildFormation([PLAYER_EAST, WING])), { kind: 'cover' })
    w = runCanned(w, { 'f6f-1': straight }, 60, () => {})
    const leader = aircraftById(w, 'f6f-1')!
    const trail = length(sub(stationPoint(leader, TRAIL_COVER), wing(w).state.position))
    const slot = length(sub(stationPoint(leader, STATIONS[1]), wing(w).state.position))
    expect(trail).toBeLessThan(100)
    expect(slot).toBeGreaterThan(400)
  })
})
