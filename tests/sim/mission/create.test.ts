import { describe, it, expect } from 'vitest'
import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { bundleForScenario } from '../../../tools/content/load.js'
import { ticksFor } from '../../../src/sim/mission/state.js'
import { NO_LANDING } from '../../../src/sim/landing.js'
import { BASE, REACH_FAR, missionWorld, scenario } from './fixture.js'

const destroy = (targets: string[], count?: number) =>
  ({ id: 'kill', label: 'Kill', priority: 'primary', kind: 'destroy', targets, ...(count === undefined ? {} : { count }) })

describe('createMission (spec 2026-09-25 §1, §2)', () => {
  it('a scenario without objectives gets no mission', () => {
    expect(missionWorld({}).mission).toBeNull()
  })

  it('resolves ids and tags, across ships, aircraft and airfield structures, in first-seen order', () => {
    const w = missionWorld({ objectives: [destroy(['convoy', 'dulag-hangar-2', 'raid', 'maru-1'])] })
    expect(w.mission!.objectives[0]!.resolved).toEqual(['maru-1', 'maru-2', 'dulag-hangar-2', 'bandit-1'])
  })

  it('resolves a structure tag carried by the base content', () => {
    const bundle = bundleForScenario(parseScenario(scenario({ objectives: [destroy(['dulag-hangars'])] })))
    const dulag = bundle.airfields['dulag']!
    const tagged = { ...bundle, airfields: { ...bundle.airfields, dulag: { ...dulag, buildings: dulag.buildings.map((b) => ({ ...b, tags: ['dulag-hangars'] })) } } }
    expect(worldFromScenario(tagged, null).mission!.objectives[0]!.resolved).toEqual(['dulag-hangar-1', 'dulag-hangar-2'])
  })

  it('fails the load when a tag or id matches nothing (spec §2.1: a parse error, not an empty set)', () => {
    expect(() => missionWorld({ objectives: [destroy(['dulag-aaa'])] }))
      .toThrow('scenario "mission-fixture": objective "kill" names "dulag-aaa", which matches no entity id or tag')
  })

  it('fails the load when a string is both an id and a tag', () => {
    const aircraft = [BASE.aircraft[0], { ...BASE.aircraft[1], tags: ['maru-1'] }]
    expect(() => missionWorld({ aircraft, objectives: [destroy(['maru-1'])] }))
      .toThrow('objective "kill" names "maru-1", which is both an entity id and a tag')
  })

  it('fails the load when destroy asks for more than exist', () => {
    expect(() => missionWorld({ objectives: [destroy(['convoy'], 3)] })).toThrow('objective "kill" asks for 3 of 2 targets')
  })

  it('fails the load when land.at names a ship with no flight deck', () => {
    expect(() => missionWorld({ objectives: [{ id: 'home', label: 'Home', priority: 'primary', kind: 'land', at: 'maru-1' }] }))
      .toThrow('objective "home" lands on "maru-1", which has no flight deck')
  })

  it('a held entity resolves before it exists', () => {
    const w = missionWorld({
      objectives: [destroy(['raid'])],
      triggers: [{ id: 'launch', when: { at: 60 }, then: [{ spawn: 'wave-1' }] }],
      heldGroups: [{ id: 'wave-1', aircraft: [{ id: 'raid-2', spec: 'f6f-hellcat', tags: ['raid'], airborneAt: { position: [-20000, 3000, -16479], headingDeg: 90, speedMps: 130 } }] }],
    })
    expect(w.mission!.objectives[0]!.resolved).toEqual(['bandit-1', 'raid-2'])
    expect(w.aircraft.map((a) => a.id)).toEqual(['f6f-1', 'bandit-1'])
    expect(w.mission!.held[0]!.aircraft[0]!.id).toBe('raid-2')
    expect(w.combat.aircraft['raid-2']).toBeUndefined()
  })

  it('starts every objective active unless it waits on another, with nothing logged', () => {
    const w = missionWorld({ objectives: [REACH_FAR, { ...REACH_FAR, id: 'next', after: 'far' }], badge: { id: 'b', name: 'B' } })
    const m = w.mission!
    expect(m.progress).toEqual([
      { status: 'active', count: 0, heldTicks: 0 },
      { status: 'inactive', count: 0, heldTicks: 0 },
    ])
    expect(m.badge).toEqual({ id: 'b', name: 'B' })
    expect(m.recovery).toBe(NO_LANDING)
    expect(m.log).toEqual([])
    expect(m.fired).toEqual([])
    expect(m.spawned).toEqual([])
  })

  it('a mission world survives structuredClone, as every World must', () => {
    const w = missionWorld({ objectives: [REACH_FAR] })
    expect(structuredClone(w)).toEqual(w)
  })
})

describe('ticksFor (plan ruling R10)', () => {
  it('counts whole ticks, rounding up, without float drift', () => {
    expect(ticksFor(180)).toBe(10800)
    expect(ticksFor(60)).toBe(3600)
    expect(ticksFor(0.5)).toBe(30)
    expect(ticksFor(0.001)).toBe(1)
    expect(ticksFor(0)).toBe(0)
  })
})
