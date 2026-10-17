import { describe, expect, it } from 'vitest'
import { parseScenario } from '../../../src/sim/scenario.js'
import type { World } from '../../../src/sim/loop.js'
import { loadAirfield } from '../../../tools/content/load.js'
import { noseHeadingDeg } from '../../../src/sim/mission/step.js'
import {
  REACH_FAR, destroyAircraft, destroyShip, destroyStructure, flatField, landOnce, missionWorld, moveAircraft, progressOf, putPlayer, scenario, steps,
} from './fixture.js'
import { v3 } from '../../../src/sim/math/vec3.js'

/**
 * F10-0 mission vocabulary (plan 2026-10-17-f10-0): arrive, released, damage, atLeast, field, windows, fresh, dwell and corridor, heading and
 * ground speed, annulus stations, hold relativeTo, `gone`, the complete/fail/setServiceable/setSide actions, and land.requires.
 * The fixture is tests/sim/mission/fixture.ts: the player flies east at 3,000 m from the origin; `raid` is bandit-1 20 km north;
 * cv-1 is allied; `convoy` is maru-1 and maru-2, a kilometer apart, at anchor.
 */
const obj = (extra: Record<string, unknown>) => ({ id: 'o', label: 'O', priority: 'primary', ...extra })
const world = (objectives: unknown[], extra: Record<string, unknown> = {}, terrain = null as ReturnType<typeof flatField> | null) =>
  missionWorld({ objectives, ...extra }, terrain)
const tickOf = (w: World<undefined>, id: string) => w.mission!.log.find((e) => e.kind === 'objective' && e.id === id)?.tick
const withCombat = (w: World<undefined>, patch: (c: World<undefined>['combat']) => World<undefined>['combat']): World<undefined> => ({ ...w, combat: patch(w.combat) })
const hurt = (w: World<undefined>, id: string, fraction: number): World<undefined> => withCombat(w, (c) => ({
  ...c, ships: { ...c.ships, [id]: { ...c.ships[id]!, hp: w.ships.find((s) => s.id === id)!.spec.hullHp * fraction } },
}))
const MARU1 = { x: -25000, z: -10000 } // `maru-1` at anchor (tests/sim/mission/fixture.ts)

describe('arrive (an AI entity set reaches a zone)', () => {
  const zone = (radiusM: number, at = MARU1) => ({ point: at, radiusM })
  it('counts the named entities inside the zone, not others', () => {
    let w = steps(world([obj({ kind: 'arrive', targets: ['convoy'], count: 2, zone: zone(500) })]), 2)
    expect(progressOf(w, 'o')).toMatchObject({ status: 'active', count: 1 }) // maru-1 is inside, maru-2 is a kilometer away
    w = steps(world([obj({ kind: 'arrive', targets: ['convoy'], count: 2, zone: zone(1500) })]), 2)
    expect(progressOf(w, 'o').status).toBe('complete')
  })
  it('remembers an entity that has been there, and does not count the dead', () => {
    let w = world([obj({ kind: 'arrive', targets: ['raid'], zone: { point: { x: 0, z: 0 }, radiusM: 400 } })])
    w = steps(w, 2)
    expect(progressOf(w, 'o').status).toBe('active') // bandit-1 is 20 km away
    w = steps(moveAircraft(w, 'bandit-1', v3(0, 3000, 0)), 1)
    expect(progressOf(w, 'o').status).toBe('complete')
    w = steps(moveAircraft(w, 'bandit-1', v3(0, 3000, -20000)), 5)
    expect(progressOf(w, 'o').status).toBe('complete') // it left; it still arrived
    const dead = steps(destroyAircraft(moveAircraft(world([obj({ kind: 'arrive', targets: ['raid'], zone: { point: { x: 0, z: 0 }, radiusM: 400 } })]), 'bandit-1', v3(0, 3000, 0)), 'bandit-1'), 2)
    expect(progressOf(dead, 'o').status).toBe('active')
  })
  it('a tag minimum composes with a second objective (ten powered, including two of the tanks)', () => {
    const w = steps(destroyShip(world([
      obj({ id: 'any2', kind: 'destroy', targets: ['convoy'], count: 2 }),
      obj({ id: 'tankish', kind: 'destroy', targets: ['maru-1'] }),
    ]), 'maru-2'), 2)
    expect(progressOf(w, 'any2').status).toBe('active')
    expect(progressOf(w, 'tankish').status).toBe('active')
    const both = steps(destroyShip(destroyShip(world([
      obj({ id: 'any2', kind: 'destroy', targets: ['convoy'], count: 2 }),
      obj({ id: 'tankish', kind: 'destroy', targets: ['maru-1'] }),
    ]), 'maru-2'), 'maru-1'), 2)
    expect([progressOf(both, 'any2').status, progressOf(both, 'tankish').status]).toEqual(['complete', 'complete'])
  })
})

describe('released (AI release counts)', () => {
  const dropped = (w: World<undefined>, id: string, field: 'bombsDropped' | 'torpedoesDropped' | 'rocketsFired', n = 1) =>
    withCombat(w, (c) => ({ ...c, aircraft: { ...c.aircraft, [id]: { ...c.aircraft[id]!, [field]: n } } }))
  it('reads another aircraft\'s own combat record, by store', () => {
    const o = obj({ kind: 'released', targets: ['raid'], store: 'bomb' })
    expect(progressOf(steps(world([o]), 2), 'o').status).toBe('active')
    expect(progressOf(steps(dropped(world([o]), 'bandit-1', 'bombsDropped'), 2), 'o').status).toBe('complete')
    // a torpedo is not a bomb (bombsDropped includes torpedoes: the same subtraction the player's `release` uses)
    const torp = dropped(dropped(world([o]), 'bandit-1', 'bombsDropped'), 'bandit-1', 'torpedoesDropped')
    expect(progressOf(steps(torp, 2), 'o').status).toBe('active')
  })
  it('counts aircraft, not stores, and rejects a count larger than its set', () => {
    const o = obj({ kind: 'released', targets: ['raid'], store: 'rocket' })
    const w = steps(dropped(world([o]), 'bandit-1', 'rocketsFired', 9), 2)
    expect(progressOf(w, 'o')).toMatchObject({ status: 'complete', count: 1 }) // nine rockets from one raider is one aircraft
    expect(() => world([obj({ kind: 'released', targets: ['raid'], store: 'rocket', count: 2 })])).toThrow(/asks for 2 of 1/)
    expect(() => world([obj({ kind: 'arrive', targets: ['raid'], count: 2, zone: { point: { x: 0, z: 0 }, radiusM: 100 } })])).toThrow(/asks for 2 of 1/)
  })
})

describe('damage (a hit, not a sinking)', () => {
  const o = obj({ kind: 'damage', targets: ['convoy'], belowHpFraction: 0.5 })
  it('is below the fraction, not at or above it, and sunk counts', () => {
    expect(progressOf(steps(hurt(world([o]), 'maru-1', 0.6), 2), 'o').status).toBe('active')
    expect(progressOf(steps(hurt(world([o]), 'maru-1', 0.49), 2), 'o').status).toBe('complete')
    expect(progressOf(steps(destroyShip(world([o]), 'maru-2'), 2), 'o').status).toBe('complete')
  })
  it('names ships only, on the other side', () => {
    expect(() => world([obj({ kind: 'damage', targets: ['raid'], belowHpFraction: 0.5 })])).toThrow(/not a ship/)
    expect(() => world([obj({ kind: 'damage', targets: ['cv-1'], belowHpFraction: 0.5 })])).toThrow(/other side/)
  })
})

describe('windows (until)', () => {
  // The player's own side: the carrier and the player's airplane. Losing both is more than the one it may lose.
  const protect = obj({ kind: 'protect', targets: ['cv-1', 'f6f-1'], maxLost: 1, until: { at: 5 } })
  const lose = (w: World<undefined>) => destroyAircraft(destroyShip(w, 'cv-1'), 'f6f-1')
  it('a protect completes when its window closes, not at mission end', () => {
    expect(progressOf(steps(world([protect]), 299), 'o').status).toBe('active')
    const w = steps(world([protect]), 300)
    expect(progressOf(w, 'o').status).toBe('complete')
    expect(tickOf(w, 'o')).toBe(300)
  })
  it('a loss past the cap inside the window fails it at once; after the window it changes nothing', () => {
    const two = steps(lose(world([protect])), 2)
    expect(progressOf(two, 'o').status).toBe('failed')
    const late = lose(steps(world([protect]), 300))
    expect(progressOf(steps(late, 2), 'o').status).toBe('complete')
  })
  it('anything but a standing order fails when its window closes unmet', () => {
    const o = obj({ kind: 'destroy', targets: ['convoy'], until: { at: 2 } })
    expect(progressOf(steps(world([o]), 119), 'o').status).toBe('active')
    expect(progressOf(steps(world([o]), 120), 'o').status).toBe('failed')
    expect(progressOf(steps(destroyShip(destroyShip(world([o]), 'maru-1'), 'maru-2'), 121), 'o').status).toBe('complete')
  })
  it('a standing field order completes when its window closes, and fails at once when a loss breaks it (F10E: the F10-0 window code omitted it)', () => {
    const keep = obj({ kind: 'field', airfields: ['tacloban', 'dulag'], min: 2, keep: true, until: { at: 2 } })
    expect(progressOf(steps(world([keep]), 119), 'o').status).toBe('active')
    expect(progressOf(steps(world([keep]), 121), 'o').status).toBe('complete')
    const ruin = { triggers: [{ id: 'ruin', when: { at: 0 }, then: [{ setServiceable: { airfield: 'dulag', value: false } }] }] }
    expect(progressOf(steps(world([keep], ruin), 3), 'o').status).toBe('failed')
  })
  it('a window can close on an entity event (the raid withdraws)', () => {
    const o = obj({ kind: 'protect', targets: ['cv-1'], until: { gone: { targets: ['raid'] } } })
    expect(progressOf(steps(world([o]), 5), 'o').status).toBe('active')
    expect(progressOf(steps(destroyAircraft(world([o]), 'bandit-1'), 2), 'o').status).toBe('complete')
  })
})

describe('fresh (count from when the objective woke up)', () => {
  const objectives = (fresh: boolean) => [
    obj({ id: 'first', kind: 'destroy', targets: ['maru-1'] }),
    obj({ id: 'later', kind: 'destroy', targets: ['convoy'], count: 1, after: 'first', ...(fresh ? { fresh: true } : {}) }),
  ]
  it('a kill from before the gate does not count when fresh, and does without it', () => {
    expect(progressOf(steps(destroyShip(world(objectives(false)), 'maru-1'), 3), 'later').status).toBe('complete')
    const w = steps(destroyShip(world(objectives(true)), 'maru-1'), 3)
    expect(progressOf(w, 'later').status).toBe('active')
    expect(progressOf(steps(destroyShip(w, 'maru-2'), 2), 'later').status).toBe('complete')
  })
})

describe('atLeast', () => {
  const kids = ['maru-1', 'maru-2', 'cv-1-never'].slice(0, 2).map((t, i) => obj({ id: `k${i}`, priority: 'secondary', kind: 'destroy', targets: [t] }))
  const parent = (n: number) => obj({ id: 'p', kind: 'atLeast', n, of: ['k0', 'k1'] })
  // Standing orders on the player's side: the carrier (k0) and the player's own airplane (k1).
  const protects = [['cv-1', 'k0'], ['f6f-1', 'k1']].map(([target, id]) => obj({ id, priority: 'secondary', kind: 'protect', targets: [target] }))
  const lose = (w: World<undefined>) => destroyAircraft(destroyShip(w, 'cv-1'), 'f6f-1')
  it('completes on the n-th child; any is 1 and all is the number', () => {
    const one = steps(destroyShip(world([...kids, parent(1)]), 'maru-1'), 2)
    expect(progressOf(one, 'p').status).toBe('complete')
    expect(progressOf(steps(destroyShip(world([...kids, parent(2)]), 'maru-1'), 2), 'p').status).toBe('active')
    expect(progressOf(steps(destroyShip(destroyShip(world([...kids, parent(2)]), 'maru-1'), 'maru-2'), 2), 'p').status).toBe('complete')
  })
  it('fails when too many children have failed for n to be possible', () => {
    const w = steps(lose(world([...protects, parent(2)])), 2)
    expect(progressOf(w, 'p').status).toBe('failed')
  })
  it('a standing protect child counts at the end (the outcome reads final statuses)', async () => {
    const { missionOutcome } = await import('../../../src/sim/mission/outcome.js')
    const w = steps(destroyShip(world([...protects, parent(1)]), 'cv-1'), 2)
    const out = missionOutcome(w.mission!, { kind: 'landed', at: null, base: null })
    expect(out.objectives.find((o) => o.id === 'p')!.final).toBe('complete') // k1 never failed
    const all = steps(lose(world([...protects, parent(1)])), 2)
    expect(missionOutcome(all.mission!, { kind: 'landed', at: null, base: null }).objectives.find((o) => o.id === 'p')!.final).toBe('failed')
  })
})

describe('plane state: heading, ground speed, dwell and corridor', () => {
  it('reads the nose compass heading and the horizontal ground speed', () => {
    expect(progressOf(steps(world([obj({ kind: 'state', headingDeg: [80, 100] })]), 2), 'o').status).toBe('complete') // east
    expect(progressOf(steps(world([obj({ kind: 'state', headingDeg: [350, 10] })]), 2), 'o').status).toBe('active')
    expect(progressOf(steps(world([obj({ kind: 'state', headingDeg: [300, 100] })]), 2), 'o').status).toBe('complete') // through north
    expect(progressOf(steps(world([obj({ kind: 'state', groundSpeedMps: [100, 140] })]), 2), 'o').status).toBe('complete')
    expect(progressOf(steps(world([obj({ kind: 'state', groundSpeedMps: [0, 10] })]), 2), 'o').status).toBe('active')
    expect(noseHeadingDeg(steps(world([REACH_FAR]), 1).aircraft[0]!.state.attitude)).toBeCloseTo(90, 0)
  })
  const dwell = (extra: Record<string, unknown> = {}) => world([obj({ kind: 'state', altitudeM: [2000, 4000], dwellS: 2, ...extra })])
  const high = (w: World<undefined>) => putPlayer(w, v3(0, 6000, 0), 120, 0)
  it('requires a continuous match and a break zeroes it', () => {
    expect(progressOf(steps(dwell(), 119), 'o').status).toBe('active')
    expect(progressOf(steps(dwell(), 120), 'o').status).toBe('complete')
    let w = steps(dwell(), 90)
    w = steps(high(w), 1)
    expect(progressOf(w, 'o').heldTicks).toBe(0)
    w = steps(putPlayer(w, v3(0, 3000, 0), 120, 0), 119)
    expect(progressOf(w, 'o').status).toBe('active') // 90 + 119 would have completed without the reset
    expect(progressOf(steps(w, 2), 'o').status).toBe('complete')
  })
  it('a corridor fails when a begun match breaks, only if it says so', () => {
    const strict = steps(high(steps(dwell({ failOnExit: true }), 30)), 1)
    expect(progressOf(strict, 'o').status).toBe('failed')
    expect(progressOf(steps(high(steps(dwell(), 30)), 1), 'o').status).toBe('active')
    expect(progressOf(steps(high(dwell({ failOnExit: true })), 5), 'o').status).toBe('active') // never began
  })
})

describe('stations: annulus, hold resetOnExit, hold relativeTo', () => {
  const at = (x: number, innerRadiusM?: number) => ({ point: { x, z: 0 }, radiusM: 5000, ...(innerRadiusM === undefined ? {} : { innerRadiusM }) })
  it('an annulus is satisfied only outside its inner radius', () => {
    expect(progressOf(steps(world([obj({ kind: 'reach', ...at(0, 1000) })]), 2), 'o').status).toBe('active') // the player starts at its center
    expect(progressOf(steps(world([obj({ kind: 'reach', ...at(3000, 1000) })]), 2), 'o').status).toBe('complete')
    expect(() => parseScenario(scenario({ objectives: [obj({ kind: 'reach', ...at(0, 5000) })] }))).toThrow(/innerRadiusM must be less/)
  })
  it('resetOnExit zeroes the held time when the player leaves', () => {
    const hold = (extra: Record<string, unknown>) => world([obj({ kind: 'hold', point: { x: 0, z: 0 }, radiusM: 20000, altitudeM: [2900, 3100], seconds: 2, ...extra })])
    const run = (w: World<undefined>) => steps(putPlayer(steps(putPlayer(steps(w, 90), v3(0, 6000, 0), 120, 0), 1), v3(0, 3000, 0), 120, 0), 119)
    expect(progressOf(run(hold({})), 'o').status).toBe('complete') // 90 + 119 accumulates
    expect(progressOf(run(hold({ resetOnExit: true })), 'o').status).toBe('active')
  })
  it('relativeTo follows the group, and nobody is inside a station with nothing to follow', () => {
    const o = obj({ kind: 'hold', point: { x: 0, z: 0 }, radiusM: 500, seconds: 1, relativeTo: 'raid' })
    expect(progressOf(steps(world([o]), 70), 'o').status).toBe('active') // the raid is 20 km away
    const near = steps(moveAircraft(world([o]), 'bandit-1', v3(0, 3000, 0)), 70)
    expect(progressOf(near, 'o').status).toBe('complete')
    const dead = steps(destroyAircraft(moveAircraft(world([o]), 'bandit-1', v3(0, 3000, 0)), 'bandit-1'), 70)
    expect(progressOf(dead, 'o').status).toBe('active')
  })
})

describe('when.gone and the trigger actions', () => {
  const msg = (when: unknown) => ({ id: 'gone', when, then: [{ message: 'raid gone' }] })
  const fired = (w: World<undefined>) => w.mission!.fired.includes('gone')
  it('fires when the named entities are destroyed, on the ground, or beyond a radius', () => {
    const w = world([REACH_FAR], { triggers: [msg({ gone: { targets: ['raid'] } })] })
    expect(fired(steps(w, 5))).toBe(false)
    expect(fired(steps(destroyAircraft(w, 'bandit-1'), 2))).toBe(true)
    const away = world([REACH_FAR], { triggers: [msg({ gone: { targets: ['raid'], awayFrom: { x: 0, z: 0 }, beyondM: 10000 } })] })
    expect(fired(steps(away, 2))).toBe(true) // bandit-1 is 20 km north of the origin
    const near = world([REACH_FAR], { triggers: [msg({ gone: { targets: ['raid'], awayFrom: { x: 0, z: -20000 }, beyondM: 10000 } })] })
    expect(fired(steps(near, 2))).toBe(false)
  })
  it('an unspawned held entity has not left', () => {
    const wave = { id: 'w-1', spec: 'f6f-hellcat', tags: ['wave'], airborneAt: { position: [-20000, 3000, -16479], headingDeg: 90, speedMps: 130 }, pilot: { target: 'f6f-1' } }
    const w = world([REACH_FAR], {
      heldGroups: [{ id: 'g', aircraft: [wave] }],
      triggers: [{ id: 'launch', when: { at: 100000 }, then: [{ spawn: 'g' }] }, msg({ gone: { targets: ['wave'] } })],
    })
    expect(fired(steps(w, 5))).toBe(false)
  })
  it('complete and fail close a phase; a finished objective is left alone', () => {
    const objectives = [obj({ id: 'a', kind: 'destroy', targets: ['convoy'] }), obj({ id: 'b', kind: 'destroy', targets: ['convoy'] })]
    const w = steps(world(objectives, { triggers: [{ id: 'close', when: { at: 1 }, then: [{ complete: 'a' }, { fail: 'b' }, { fail: 'a' }] }] }), 61)
    expect(progressOf(w, 'a').status).toBe('complete') // the later `fail: a` found it done
    expect(progressOf(w, 'b').status).toBe('failed')
    expect(w.mission!.log.filter((e) => e.kind === 'objective').map((e) => e.kind === 'objective' && `${e.id}:${e.status}`)).toEqual(['a:complete', 'b:failed'])
    expect(w.mission!.log.some((e) => e.kind === 'message' && e.text === 'O: failed')).toBe(true)
  })
})

describe('mutable airfield state', () => {
  const tac = () => loadAirfield('tacloban').runway.center
  const home = (extra: Record<string, unknown> = {}) => obj({ id: 'home', kind: 'land', at: 'tacloban', ...extra })
  const landed = (objectives: unknown[], extra: Record<string, unknown> = {}) => landOnce(world(objectives, { ships: [], ...extra }, flatField(100)), tac().x, 100, tac().z)
  it('a trigger can make a field unserviceable or change its side, and the recovery rule sees it', () => {
    const recovery = obj({ id: 'home', kind: 'land', at: 'tacloban', suggestedRecovery: true })
    expect(progressOf(landed([recovery]), 'home').status).toBe('complete')
    const bombed = landed([recovery], { triggers: [{ id: 'ruin', when: { at: 0 }, then: [{ setServiceable: { airfield: 'tacloban', value: false } }] }] })
    expect(progressOf(bombed, 'home').status).toBe('active')
    const taken = landed([recovery], { triggers: [{ id: 'take', when: { at: 0 }, then: [{ setSide: { airfield: 'tacloban', side: 'axis' } }] }] })
    expect(progressOf(taken, 'home').status).toBe('active')
    const land = taken.mission!.log.find((e) => e.kind === 'landing')
    expect(land).toMatchObject({ kind: 'landing', base: null })
  })
  it('land.requires counts a landing only while the named fields are (un)serviceable', () => {
    const gone = { triggers: [{ id: 'ruin', when: { at: 0 }, then: [{ setServiceable: { airfield: 'dulag', value: false } }] }] }
    const needsDulag = home({ requires: { serviceable: ['dulag'] } })
    const onlyIfDulagDown = home({ requires: { unserviceable: ['dulag'] } })
    expect(progressOf(landed([needsDulag]), 'home').status).toBe('complete')
    expect(progressOf(landed([needsDulag], gone), 'home').status).toBe('active')
    expect(progressOf(landed([onlyIfDulagDown]), 'home').status).toBe('active')
    expect(progressOf(landed([onlyIfDulagDown], gone), 'home').status).toBe('complete')
  })
  it('fieldRules derive serviceability from the field\'s own structures', () => {
    const ids = loadAirfield('dulag').buildings.map((b) => b.id)
    expect(ids.length).toBeGreaterThanOrEqual(2)
    const rules = { fieldRules: [{ airfield: 'dulag', structures: ids, minFraction: 0.5 }] }
    const keep = obj({ id: 'keep', kind: 'field', airfields: ['dulag'], keep: true })
    let w = steps(world([keep], rules), 2)
    expect(progressOf(w, 'keep').status).toBe('active')
    const kill = (n: number) => ids.slice(0, n).reduce((acc, id) => destroyStructure(acc, id), world([keep], rules))
    expect(progressOf(steps(kill(Math.floor(ids.length / 2)), 2), 'keep').status).toBe('active') // exactly half is still enough
    w = steps(kill(Math.floor(ids.length / 2) + 1), 2)
    expect(progressOf(w, 'keep').status).toBe('failed')
  })
  it('a field objective counts fields by serviceability and who holds them; keep completes at the end', async () => {
    const take = { triggers: [{ id: 'take', when: { at: 0 }, then: [{ setSide: { airfield: 'tacloban', side: 'allied' } }, { setSide: { airfield: 'dulag', side: 'axis' } }] }] }
    const both = (extra: Record<string, unknown>) => obj({ id: 'f', kind: 'field', airfields: ['tacloban', 'dulag'], ...extra })
    expect(progressOf(steps(world([both({ heldBy: 'player' })], take), 2), 'f')).toMatchObject({ status: 'active', count: 1 })
    expect(progressOf(steps(world([both({ heldBy: 'player', min: 1 })], take), 2), 'f').status).toBe('complete')
    expect(progressOf(steps(world([both({ heldBy: 'enemy', min: 1 })], take), 2), 'f').status).toBe('complete')
    const { finalStatus } = await import('../../../src/sim/mission/outcome.js')
    const w = steps(world([both({ keep: true, min: 1, heldBy: 'player' })], take), 5)
    expect(finalStatus(w.mission!.objectives[0]!, w.mission!.progress[0]!)).toBe('complete')
  })
})

describe('the scenario validator', () => {
  const bad = (o: Record<string, unknown>) => () => parseScenario(scenario({ objectives: [REACH_FAR, obj(o)] }))
  it('rejects the new misuses at load', () => {
    expect(bad({ kind: 'atLeast', n: 3, of: ['far'] })).toThrow(/asks for 3 of 1/)
    expect(bad({ kind: 'atLeast', n: 1, of: ['later'] })).toThrow(/earlier objectives/)
    expect(bad({ kind: 'destroy', targets: ['convoy'], fresh: true })).toThrow(/needs an after/)
    expect(bad({ kind: 'field', airfields: ['nowhere'] })).toThrow(/not one of airfields/)
    expect(bad({ kind: 'land', at: 'tacloban', requires: { serviceable: ['nowhere'] } })).toThrow(/not one of airfields/)
    expect(bad({ kind: 'state', headingDeg: [400, 10] })).toThrow(/headingDeg/)
    expect(bad({ kind: 'protect', targets: ['convoy'], until: { completed: 'ghost' } })).toThrow(/not an objective/)
    expect(() => parseScenario(scenario({ objectives: [REACH_FAR], triggers: [{ id: 't', when: { at: 1 }, then: [{ complete: 'ghost' }] }] }))).toThrow(/not an objective/)
    expect(() => parseScenario(scenario({ objectives: [REACH_FAR], triggers: [{ id: 't', when: { at: 1 }, then: [{ setSide: { airfield: 'nowhere', side: 'axis' } }] }] }))).toThrow(/not one of airfields/)
    expect(() => parseScenario(scenario({ objectives: [REACH_FAR], fieldRules: [{ airfield: 'nowhere', structures: ['x'], minFraction: 0.5 }] }))).toThrow(/not one of airfields/)
  })
  it('a when.failed may name an objective that can fail by window, corridor or standing order', () => {
    const w = (o: Record<string, unknown>) => () => parseScenario(scenario({ objectives: [REACH_FAR, obj(o)], triggers: [{ id: 't', when: { failed: 'o' }, then: [{ message: 'm' }] }] }))
    expect(w({ kind: 'destroy', targets: ['convoy'] })).toThrow(/can never fail/)
    expect(w({ kind: 'destroy', targets: ['convoy'], until: { at: 5 } })).not.toThrow()
    expect(w({ kind: 'state', altitudeM: [0, 1], dwellS: 1, failOnExit: true })).not.toThrow()
    expect(w({ kind: 'field', airfields: ['tacloban'], keep: true })).not.toThrow()
  })
})
