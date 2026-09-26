import { describe, it, expect } from 'vitest'
import { advance, aircraftById } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { radioMessages } from '../../../src/sim/mission/state.js'
import { REACH_FAR, destroyAircraft, destroyShip, missionWorld, putPlayer, steps } from './fixture.js'

const RAID_2 = { id: 'raid-2', spec: 'f6f-hellcat', tags: ['raid'], airborneAt: { position: [-20000, 3000, -16479], headingDeg: 90, speedMps: 130 }, pilot: { target: 'f6f-1' } }
const station = { point: { x: 0, z: 0 }, radiusM: 2000 }

describe('triggers (spec 2026-09-25 §2.2)', () => {
  it('when.at fires on the exact tick (ruling R10), exactly once', () => {
    let w = missionWorld({ objectives: [REACH_FAR], triggers: [{ id: 'one', when: { at: 1 }, then: [{ message: 'one second' }] }] })
    w = steps(w, 59)
    expect(w.mission!.fired).toEqual([])
    w = steps(w, 1)
    expect(w.mission!.log).toEqual([
      { tick: 60, kind: 'trigger', id: 'one' },
      { tick: 60, kind: 'message', text: 'one second' },
    ])
    w = steps(w, 200)
    expect(w.mission!.fired).toEqual(['one'])
    expect(w.mission!.log).toHaveLength(2)
  })

  it('when.completed fires in the same tick as the objective, after it (objectives first)', () => {
    let w = missionWorld({
      objectives: [{ id: 'kill', label: 'Kill', priority: 'primary', kind: 'destroy', targets: ['maru-1'] }],
      triggers: [{ id: 'well-done', when: { completed: 'kill' }, then: [{ message: 'Maru sunk' }] }],
    })
    w = steps(destroyShip(w, 'maru-1'), 1)
    expect(w.mission!.log.map((e) => e.kind)).toEqual(['objective', 'trigger', 'message'])
    expect(new Set(w.mission!.log.map((e) => e.tick))).toEqual(new Set([w.tick]))
  })

  it('when.failed fires on a protect failure, after the failure announcement', () => {
    let w = missionWorld({
      objectives: [{ id: 'carrier', label: 'Carrier', priority: 'primary', kind: 'protect', targets: ['cv-1'] }],
      triggers: [{ id: 'lost', when: { failed: 'carrier' }, then: [{ message: 'Carrier lost' }] }],
    })
    w = steps(destroyShip(w, 'cv-1'), 1)
    expect(radioMessages(w.mission!).map((m) => m.text)).toEqual(['Carrier: failed', 'Carrier lost'])
  })

  it('when.enters fires when the player enters, and never for a dead player (Review Focus 3)', () => {
    const trig = { objectives: [REACH_FAR], triggers: [{ id: 'overhead', when: { enters: station }, then: [{ message: 'Overhead' }] }] }
    let w = missionWorld(trig)
    w = steps(putPlayer(w, v3(0, 3000, 5000), 120, 0), 1)
    expect(w.mission!.fired).toEqual([])
    w = steps(putPlayer(w, v3(0, 3000, 0), 120, 0), 1)
    expect(w.mission!.fired).toEqual(['overhead'])

    let dead = destroyAircraft(missionWorld(trig), 'f6f-1')
    dead = steps(putPlayer(dead, v3(0, 3000, 0), 120, 0), 30)
    expect(dead.mission!.fired).toEqual([])
  })

  it('fires two triggers of one tick in file order', () => {
    let w = missionWorld({ objectives: [REACH_FAR], triggers: [
      { id: 'b', when: { at: 0.5 }, then: [{ message: 'first' }] },
      { id: 'a', when: { at: 0.5 }, then: [{ message: 'second' }] },
    ] })
    w = steps(w, 30)
    expect(w.mission!.fired).toEqual(['b', 'a'])
    expect(radioMessages(w.mission!).map((m) => m.text)).toEqual(['first', 'second'])
  })

  it('spawn brings the group in on its tick; the spawned pilot flies from the next', () => {
    let w = missionWorld({
      objectives: [REACH_FAR],
      triggers: [{ id: 'launch', when: { at: 0.5 }, then: [{ message: 'Bandits inbound' }, { spawn: 'wave-1' }] }],
      heldGroups: [{ id: 'wave-1', aircraft: [RAID_2] }],
    })
    w = steps(w, 30)
    expect(w.mission!.log).toEqual([
      { tick: 30, kind: 'trigger', id: 'launch' },
      { tick: 30, kind: 'message', text: 'Bandits inbound' },
      { tick: 30, kind: 'spawn', group: 'wave-1' },
    ])
    expect(aircraftById(w, 'raid-2')!.state.tick).toBe(30)
    w = steps(w, 1)
    expect(aircraftById(w, 'raid-2')!.state.tick).toBe(31)
  })

  it('a spawn inside a five-step advance is stepped by the rest of that call (Review Focus 4)', () => {
    let w = missionWorld({
      objectives: [REACH_FAR],
      triggers: [{ id: 'launch', when: { at: 0.5 }, then: [{ spawn: 'wave-1' }] }],
      heldGroups: [{ id: 'wave-1', aircraft: [RAID_2] }],
    })
    w = steps(w, 28)
    const r = advance(w, 5 * DT)
    expect(r.stepsRun).toBe(5)
    expect(r.world.tick).toBe(33)
    for (const e of [...r.world.aircraft, ...r.world.ships]) expect(e.state.tick, e.id).toBe(33)
    const raid = aircraftById(r.world, 'raid-2')!
    expect(raid.state.position).not.toEqual(r.world.mission!.held[0]!.aircraft[0]!.state.position)
  })

  it('two runs of the same inputs write identical logs and worlds', () => {
    const run = () => {
      let w = missionWorld({
        objectives: [
          { id: 'kill', label: 'Kill', priority: 'primary', kind: 'destroy', targets: ['raid'] },
          { id: 'convoy', label: 'Convoy', priority: 'secondary', kind: 'protect', targets: ['convoy'] },
        ],
        triggers: [
          { id: 'launch', when: { at: 0.5 }, then: [{ spawn: 'wave-1' }, { message: 'Inbound' }] },
          { id: 'lost', when: { failed: 'convoy' }, then: [{ message: 'Convoy hit' }] },
        ],
        heldGroups: [{ id: 'wave-1', aircraft: [RAID_2] }],
      })
      w = steps(w, 40)
      w = steps(destroyShip(w, 'maru-2'), 200)
      return w
    }
    const a = run()
    const b = run()
    expect(a.mission!.log).toEqual(b.mission!.log)
    expect(a.aircraft).toEqual(b.aircraft)
    expect(a.mission!.log.length).toBeGreaterThanOrEqual(6)
  })
})
