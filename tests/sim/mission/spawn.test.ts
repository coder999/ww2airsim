import { describe, it, expect } from 'vitest'
import { spawnHeldGroup } from '../../../src/sim/mission/spawn.js'
import { aircraftById } from '../../../src/sim/loop.js'
import { BASE, REACH_FAR, missionWorld, steps } from './fixture.js'

const RAID_2 = { id: 'raid-2', spec: 'f6f-hellcat', tags: ['raid'], airborneAt: { position: [-20000, 3000, -16479], headingDeg: 90, speedMps: 130 }, pilot: { target: 'f6f-1' } }
const DD_9 = { id: 'dd-9', spec: 'fletcher-dd', waypoints: [[-24000, -9000], [-23000, -9000]], speedMps: 7 }
const HELD = {
  objectives: [REACH_FAR],
  // Far in the future, so a direct spawn below never collides with it.
  triggers: [{ id: 'launch', when: { at: 100000 }, then: [{ spawn: 'wave-1' }] }],
  heldGroups: [{ id: 'wave-1', aircraft: [RAID_2], ships: [DD_9] }],
}

describe('spawnHeldGroup (spec 2026-09-25 §1)', () => {
  it('builds exactly what worldFromScenario builds for the same entity at start', () => {
    const spawned = spawnHeldGroup(missionWorld(HELD), 'wave-1')
    const atStart = missionWorld({ aircraft: [...BASE.aircraft, RAID_2], ships: [...BASE.ships, DD_9] })
    expect(aircraftById(spawned, 'raid-2')).toEqual(aircraftById(atStart, 'raid-2'))
    expect(spawned.ships.find((s) => s.id === 'dd-9')).toEqual(atStart.ships.find((s) => s.id === 'dd-9'))
    expect(spawned.combat.aircraft['raid-2']).toEqual(atStart.combat.aircraft['raid-2'])
    expect(spawned.combat.ships['dd-9']).toEqual(atStart.combat.ships['dd-9'])
  })

  it('stamps the world tick, starts at rest in time (previous = state), and appends after existing entities', () => {
    const before = steps(missionWorld(HELD), 600)
    const w = spawnHeldGroup(before, 'wave-1')
    expect(w.aircraft.map((a) => a.id)).toEqual(['f6f-1', 'bandit-1', 'raid-2'])
    expect(w.ships.map((s) => s.id)).toEqual(['cv-1', 'maru-1', 'maru-2', 'dd-9'])
    const raid = aircraftById(w, 'raid-2')!
    expect(raid.state.tick).toBe(600)
    expect(raid.previous).toBe(raid.state)
    expect(w.ships.at(-1)!.state.tick).toBe(600)
    expect(w.mission!.spawned).toEqual(['wave-1'])
    // Everything else is the same object: the spawn touched nothing else.
    expect(w.aircraft[0]).toBe(before.aircraft[0])
    expect(w.combat.projectiles).toBe(before.combat.projectiles)
  })

  it('the spawned group steps on the world clock from the next tick', () => {
    const w = steps(spawnHeldGroup(steps(missionWorld(HELD), 600), 'wave-1'), 1)
    for (const e of [...w.aircraft, ...w.ships]) expect(e.state.tick, e.id).toBe(601)
    expect(aircraftById(w, 'raid-2')!.state.position).not.toEqual(aircraftById(w, 'raid-2')!.previous.position)
  })

  it('refuses an unknown group, a second spawn, and a world with no mission', () => {
    const w = missionWorld(HELD)
    expect(() => spawnHeldGroup(w, 'wave-9')).toThrow('spawnHeldGroup: no held group "wave-9"')
    expect(() => spawnHeldGroup(spawnHeldGroup(w, 'wave-1'), 'wave-1')).toThrow('spawnHeldGroup: held group "wave-1" has already spawned')
    expect(() => spawnHeldGroup(missionWorld({}), 'wave-1')).toThrow('spawnHeldGroup: this world has no mission')
  })
})
