import { describe, expect, it } from 'vitest'
import { parseScenario } from '../../../src/sim/scenario.js'
import type { World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { missionWorld, moveAircraft, progressOf, putPlayer, scenario, steps } from './fixture.js'

/**
 * F10D D.3: a VALID release (J4's torpedo): counted only inside a range of its targets, inside a window on the mission clock, inside the torpedo's own
 * drop envelope, and only if it left after the objective woke up. The combat counter is set by hand (the fixture's player flies a Hellcat); the
 * judging reads where the player was on the tick the counter rose. `maru-1` lies at (-25000, -10000), at anchor.
 */
const MARU1 = { x: -25000, z: -10000 }
const obj = (extra: Record<string, unknown> = {}) => ({ id: 'tp', label: 'Torpedo', priority: 'primary', kind: 'release', store: 'torpedo', targets: ['maru-1'], withinM: 1800, ...extra })
const KATE = { id: 'f6f-1', spec: 'b5n2-kate', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 } }
const world = (objectives: unknown[], aircraft?: unknown[]): World<undefined> => missionWorld({ objectives, ...(aircraft === undefined ? {} : { aircraft }) })
const dropped = (w: World<undefined>, n = 1): World<undefined> => {
  const r = w.combat.aircraft['f6f-1']!
  return { ...w, combat: { ...w.combat, aircraft: { ...w.combat.aircraft, 'f6f-1': { ...r, torpedoesDropped: r.torpedoesDropped + n, bombsDropped: r.bombsDropped + n } } } }
}
/** The player 1 km from maru-1 at 60 m/s and 50 m, inside the Type 91's envelope (91.7 m/s, 100 m); `put` places and `ticks` steps. */
const at = (w: World<undefined>, p: { x: number; z: number }, speed = 60, altM = 50): World<undefined> => putPlayer(w, v3(p.x, altM, p.z), speed, 0)
const NEAR = { x: MARU1.x, z: MARU1.z + 1000 }
const FAR = { x: MARU1.x, z: MARU1.z + 9000 }

describe('release validity: range', () => {
  it('a release inside the range counts; the same release from far away counts for nothing and is not judged again', () => {
    let near = steps(dropped(at(world([obj()], [KATE]), NEAR)), 2)
    expect(progressOf(near, 'tp')).toMatchObject({ status: 'complete', count: 1 })
    let far = steps(dropped(at(world([obj()], [KATE]), FAR)), 2)
    expect(progressOf(far, 'tp')).toMatchObject({ status: 'active', count: 0 })
    far = steps(at(far, NEAR), 5)
    expect(progressOf(far, 'tp').status, 'flying closer afterwards does not redeem the earlier release').toBe('active')
    near = steps(near, 1)
  })
  it('a destroyed target is not a target', () => {
    const w = world([obj()], [KATE])
    const rec = w.combat.ships['maru-1']!
    const sunk = { ...w, combat: { ...w.combat, ships: { ...w.combat.ships, 'maru-1': { ...rec, hp: 0, destroyedTick: 0 } } } }
    expect(progressOf(steps(dropped(at(sunk, NEAR)), 2), 'tp').status).toBe('active')
  })
  it('any one of the named targets will do (a tag)', () => {
    const w = steps(dropped(at(world([obj({ targets: ['convoy'] })], [KATE]), { x: MARU1.x, z: MARU1.z + 1900 })), 2) // maru-2 is a kilometer farther south: 900 m away
    expect(progressOf(w, 'tp').status).toBe('complete')
  })
})

describe('release validity: the torpedo\'s own drop envelope', () => {
  it('too fast or too high is a dud and does not count; inside it does', () => {
    expect(progressOf(steps(dropped(at(world([obj()], [KATE]), NEAR, 95)), 2), 'tp').status, 'over 91.7 m/s').toBe('active')
    expect(progressOf(steps(dropped(at(world([obj()], [KATE]), NEAR, 60, 150)), 2), 'tp').status, 'over 100 m').toBe('active')
    expect(progressOf(steps(dropped(at(world([obj()], [KATE]), NEAR, 90, 99)), 2), 'tp').status).toBe('complete')
  })
})

describe('release validity: the window', () => {
  const win = (from: number, to: number) => obj({ window: [from, to] })
  const tickAt = (s: number) => Math.round(s / DT)
  it('a release before the window opens counts for nothing; one inside it completes', () => {
    let w = at(world([win(2, 4)], [KATE]), NEAR)
    w = steps(dropped(w), 2)
    expect(progressOf(w, 'tp')).toMatchObject({ status: 'active', count: 0 })
    w = steps(at(w, NEAR), tickAt(2.2))
    expect(progressOf(w, 'tp').status).toBe('active')
    w = steps(dropped(at(w, NEAR)), 2)
    expect(progressOf(w, 'tp').status).toBe('complete')
  })
  it('the window closing unmet fails the objective (so a when.failed can name it)', () => {
    let w = at(world([win(0, 1)], [KATE]), NEAR)
    w = steps(at(w, NEAR), tickAt(1.2))
    expect(progressOf(w, 'tp').status).toBe('failed')
    const bundle = parseScenario(scenario({ objectives: [win(0, 1), { id: 'x', label: 'X', priority: 'secondary', kind: 'reach', point: { x: 90000, z: 90000 }, radiusM: 100 }], triggers: [{ id: 't', when: { failed: 'tp' }, then: [{ message: 'missed' }] }], aircraft: [KATE] }))
    expect(bundle.objectives).toHaveLength(2)
  })
})

describe('release validity: only releases after the objective woke up', () => {
  it('a torpedo dropped before its gate completed is not judged', () => {
    const gate = { id: 'gate', label: 'Gate', priority: 'primary', kind: 'reach', point: { x: NEAR.x, z: NEAR.z }, radiusM: 300 }
    let w = at(world([gate, obj({ after: 'gate' })], [KATE]), FAR)
    w = steps(dropped(w), 2) // released early, far from everything, before the gate
    w = steps(at(w, NEAR), 2) // the gate wakes the release objective here, in range
    expect(progressOf(w, 'gate').status).toBe('complete')
    w = steps(at(w, NEAR), 5)
    expect(progressOf(w, 'tp'), 'the earlier release must not complete it just because the player is now in range').toMatchObject({ status: 'active', count: 0 })
    w = steps(dropped(at(w, NEAR)), 2)
    expect(progressOf(w, 'tp').status).toBe('complete')
  })
})

describe('release validity: the validator', () => {
  it('a range needs targets and the other way round', () => {
    expect(() => parseScenario(scenario({ objectives: [{ ...obj(), targets: undefined }] }))).toThrow(/withinM and targets go together/)
    expect(() => parseScenario(scenario({ objectives: [{ ...obj(), withinM: undefined }] }))).toThrow(/withinM and targets go together/)
  })
  it('targets must be ships', () => {
    expect(() => missionWorld({ objectives: [obj({ targets: ['bandit-1'] })] })).toThrow(/which is a aircraft, not a ship/)
  })
  void moveAircraft
})
