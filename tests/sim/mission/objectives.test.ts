import { describe, it, expect } from 'vitest'
import { advance, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { deckOf, deckWorld } from '../../../src/sim/world/deck.js'
import { radioMessages } from '../../../src/sim/mission/state.js'
import { loadAirfield } from '../../../tools/content/load.js'
import {
  BASE, REACH_FAR, deepFreeze, destroyAircraft, destroyShip, destroyStructure, flatField, landOnce,
  missionWorld, moveAircraft, progressOf, putPlayer, steps,
} from './fixture.js'

const CV = { x: -25629, z: -16479 }
const station = { point: { x: 0, z: 0 }, radiusM: 2000 }
const cvDeck = (w: World<undefined>) => deckOf(w.ships.find((s) => s.id === 'cv-1')!)!
const entries = (w: World<undefined>) => w.mission!.log

describe('destroy', () => {
  it('counts destroyed targets across ships and structures and completes at count', () => {
    let w = missionWorld({ objectives: [{ id: 'kill', label: 'Kill', priority: 'primary', kind: 'destroy', targets: ['convoy', 'dulag-hangar-1'], count: 2 }] })
    w = steps(destroyShip(w, 'maru-1'), 1)
    expect(progressOf(w, 'kill')).toEqual({ status: 'active', count: 1, heldTicks: 0 })
    w = steps(destroyStructure(w, 'dulag-hangar-1'), 1)
    expect(progressOf(w, 'kill')).toEqual({ status: 'complete', count: 2, heldTicks: 0 })
    expect(entries(w)).toEqual([{ tick: w.tick, kind: 'objective', id: 'kill', status: 'complete' }])
  })

  it('defaults count to all, and counts a crashed or shot-down aircraft (ruling R13)', () => {
    let w = missionWorld({ objectives: [{ id: 'kill', label: 'Kill', priority: 'primary', kind: 'destroy', targets: ['raid'] }] })
    w = steps(destroyAircraft(w, 'bandit-1'), 1)
    expect(progressOf(w, 'kill').status).toBe('complete')
  })

  it('a held target counts as not destroyed until it exists (spec §2.3)', () => {
    const w = steps(missionWorld({
      objectives: [{ id: 'kill', label: 'Kill', priority: 'primary', kind: 'destroy', targets: ['raid-2'] }],
      triggers: [{ id: 'launch', when: { at: 100000 }, then: [{ spawn: 'wave-1' }] }],
      heldGroups: [{ id: 'wave-1', aircraft: [{ id: 'raid-2', spec: 'f6f-hellcat', airborneAt: { position: [-20000, 3000, -16479], headingDeg: 90, speedMps: 130 } }] }],
    }), 60)
    expect(progressOf(w, 'kill')).toEqual({ status: 'active', count: 0, heldTicks: 0 })
  })
})

describe('protect', () => {
  it('fails the moment losses exceed maxLost, announces it, and the flight goes on (spec §0.6)', () => {
    let w = missionWorld({ objectives: [
      { id: 'convoy', label: 'Convoy', priority: 'primary', kind: 'protect', targets: ['convoy'], maxLost: 1 },
      { ...REACH_FAR },
    ] })
    w = steps(destroyShip(w, 'maru-1'), 1)
    expect(progressOf(w, 'convoy')).toEqual({ status: 'active', count: 1, heldTicks: 0 })
    w = steps(destroyShip(w, 'maru-2'), 1)
    expect(progressOf(w, 'convoy').status).toBe('failed')
    expect(radioMessages(w.mission!).map((m) => m.text)).toEqual(['Convoy: failed'])
    const later = steps(w, 60)
    expect(later.tick).toBe(w.tick + 60)
    expect(progressOf(later, 'far').status).toBe('active')
  })
})

describe('deny', () => {
  const DENY = { id: 'screen', label: 'Screen', priority: 'primary', kind: 'deny', hostiles: ['raid'], around: 'cv-1', radiusM: 5000 }

  it('fails when a live hostile comes inside the radius, measured horizontally (ruling R9)', () => {
    let w = missionWorld({ objectives: [DENY] })
    w = steps(moveAircraft(w, 'bandit-1', v3(CV.x + 6000, 9000, CV.z)), 1)
    expect(progressOf(w, 'screen').status).toBe('active')
    w = steps(moveAircraft(w, 'bandit-1', v3(CV.x + 4000, 9000, CV.z)), 1)
    expect(progressOf(w, 'screen').status).toBe('failed')
  })

  it('a destroyed hostile inside the ring is not a breach (Review Focus 5)', () => {
    let w = missionWorld({ objectives: [DENY] })
    w = destroyAircraft(w, 'bandit-1')
    w = steps(moveAircraft(w, 'bandit-1', v3(CV.x + 1000, 3000, CV.z)), 30)
    expect(progressOf(w, 'screen').status).toBe('active')
  })

  it('an unspawned hostile is not a breach, whatever its template says (Review Focus 5)', () => {
    const w = steps(missionWorld({
      objectives: [DENY],
      triggers: [{ id: 'launch', when: { at: 100000 }, then: [{ spawn: 'wave-1' }] }],
      heldGroups: [{ id: 'wave-1', aircraft: [{ id: 'raid-2', spec: 'f6f-hellcat', tags: ['raid'], airborneAt: { position: [CV.x + 100, 3000, CV.z], headingDeg: 90, speedMps: 130 } }] }],
    }), 30)
    expect(progressOf(w, 'screen').status).toBe('active')
  })

  it('accepts a fixed point as the center', () => {
    let w = missionWorld({ objectives: [{ ...DENY, around: { x: 0, z: -20000 } }] })
    w = steps(w, 1)
    expect(progressOf(w, 'screen').status).toBe('failed') // bandit-1 starts on that point
  })
})

describe('reach and hold', () => {
  it('reach completes on the first tick inside, altitude band included', () => {
    let w = missionWorld({ objectives: [{ id: 'gate', label: 'Gate', priority: 'primary', kind: 'reach', ...station, altitudeM: [100, 600] }] })
    w = steps(putPlayer(w, v3(0, 3000, 0), 120, 0), 1)
    expect(progressOf(w, 'gate').status).toBe('active') // inside the circle, above the band
    w = steps(putPlayer(w, v3(0, 400, 0), 120, 0), 1)
    expect(progressOf(w, 'gate').status).toBe('complete')
  })

  it('hold accumulates time inside across an excursion (spec §0.9) and completes on the exact tick', () => {
    let w = missionWorld({ objectives: [{ id: 'cap', label: 'CAP', priority: 'primary', kind: 'hold', ...station, seconds: 1 }] })
    const inside = v3(0, 3000, 0)
    const outside = v3(0, 3000, 5000)
    for (let i = 0; i < 30; i++) w = steps(putPlayer(w, inside, 120, 0), 1)
    expect(progressOf(w, 'cap')).toEqual({ status: 'active', count: 0, heldTicks: 30 })
    for (let i = 0; i < 10; i++) w = steps(putPlayer(w, outside, 120, 0), 1)
    expect(progressOf(w, 'cap').heldTicks).toBe(30)
    for (let i = 0; i < 29; i++) w = steps(putPlayer(w, inside, 120, 0), 1)
    expect(progressOf(w, 'cap')).toEqual({ status: 'active', count: 0, heldTicks: 59 })
    w = steps(putPlayer(w, inside, 120, 0), 1)
    expect(progressOf(w, 'cap')).toEqual({ status: 'complete', count: 0, heldTicks: 60 })
  })

  it('a destroyed player accumulates nothing more (Review Focus 3)', () => {
    let w = missionWorld({ objectives: [{ id: 'cap', label: 'CAP', priority: 'primary', kind: 'hold', ...station, seconds: 10 }] })
    w = steps(putPlayer(w, v3(0, 3000, 0), 120, 0), 10)
    const held = progressOf(w, 'cap').heldTicks
    w = steps(destroyAircraft(w, 'f6f-1'), 120)
    expect(progressOf(w, 'cap').heldTicks).toBe(held)
  })
})

describe('after', () => {
  it('gates an objective, and one activated this tick is evaluated this tick, in file order (ruling R8)', () => {
    let w = missionWorld({ objectives: [
      { id: 'gate', label: 'Gate', priority: 'primary', kind: 'reach', ...station },
      { id: 'kill', label: 'Kill', priority: 'primary', kind: 'destroy', targets: ['maru-1'], after: 'gate' },
    ] })
    w = steps(putPlayer(destroyShip(w, 'maru-1'), v3(0, 3000, 9000), 120, 0), 1)
    expect(progressOf(w, 'kill')).toEqual({ status: 'inactive', count: 0, heldTicks: 0 })
    w = steps(putPlayer(w, v3(0, 3000, 0), 120, 0), 1)
    expect(entries(w)).toEqual([
      { tick: w.tick, kind: 'objective', id: 'gate', status: 'complete' },
      { tick: w.tick, kind: 'objective', id: 'kill', status: 'complete' },
    ])
  })
})

describe('takeoff and land (the recovery signal, ruling R1)', () => {
  const TRAPS = { id: 'trap', label: 'Trap', priority: 'primary', kind: 'land', at: 'cv-1', count: 2 }

  it('takeoff completes once the player is airborne off the deck it started on', () => {
    let w = missionWorld({
      aircraft: [{ id: 'f6f-1', spec: 'f6f-hellcat', parkedAt: { ship: 'cv-1', spot: { x: 0, z: -110 } }, chocked: false }, BASE.aircraft[1]],
      objectives: [{ id: 'up', label: 'Launch', priority: 'primary', kind: 'takeoff', from: 'cv-1' }],
    })
    w = steps(w, 5)
    expect(progressOf(w, 'up').status).toBe('active')
    const d = cvDeck(w)
    const p = deckWorld(d, 0, 0)
    w = steps(putPlayer(w, v3(p.x, d.center.y + 50, p.z), 60, 0), 1)
    expect(progressOf(w, 'up').status).toBe('complete')
  })

  it('counts traps on the named deck, logs each landing, and says "Trap n of 2" (spec §2.4)', () => {
    let w = missionWorld({ objectives: [TRAPS] })
    const d = cvDeck(w)
    const p = deckWorld(d, 0, 0)
    w = landOnce(w, p.x, d.center.y, p.z)
    expect(progressOf(w, 'trap')).toEqual({ status: 'active', count: 1, heldTicks: 0 })
    const first = entries(w).find((e) => e.kind === 'landing')
    expect(first).toEqual({ tick: expect.any(Number), kind: 'landing', at: { kind: 'carrier', id: 'cv-1', name: 'cv-1' }, advanced: 'trap', intermediate: true })
    w = landOnce(w, p.x, d.center.y, p.z)
    expect(progressOf(w, 'trap')).toEqual({ status: 'complete', count: 2, heldTicks: 0 })
    const landings = entries(w).filter((e) => e.kind === 'landing')
    expect(landings.map((e) => (e.kind === 'landing' ? e.intermediate : null))).toEqual([true, false])
    expect(radioMessages(w.mission!).map((m) => m.text)).toEqual(['Trap 1 of 2', 'Trap 2 of 2'])
  })

  it('a landing before the objective is active advances nothing (Review Focus 1)', () => {
    let w = missionWorld({ objectives: [{ ...REACH_FAR, id: 'gate' }, { ...TRAPS, after: 'gate' }] })
    const d = cvDeck(w)
    const p = deckWorld(d, 0, 0)
    w = landOnce(w, p.x, d.center.y, p.z)
    expect(progressOf(w, 'trap')).toEqual({ status: 'inactive', count: 0, heldTicks: 0 })
    expect(entries(w).filter((e) => e.kind === 'landing')).toEqual([
      { tick: expect.any(Number), kind: 'landing', at: { kind: 'carrier', id: 'cv-1', name: 'cv-1' }, advanced: null, intermediate: false },
    ])
  })

  it('an airfield landing counts for land at that airfield; an off-field one does not', () => {
    const tac = loadAirfield('tacloban').runway.center
    const home = { id: 'home', label: 'Home', priority: 'primary', kind: 'land', at: 'tacloban' }
    let w = missionWorld({ ships: [], objectives: [home] }, flatField(100))
    w = landOnce(w, 0, 100, 0)
    expect(progressOf(w, 'home').status).toBe('active')
    w = landOnce(w, tac.x, 100, tac.z)
    expect(progressOf(w, 'home').status).toBe('complete')
  })
})

describe('the engine and the world', () => {
  it('a mission that never progresses leaves every entity and the combat state identical (spec §1 gate)', () => {
    const plain = steps(missionWorld({}), 600)
    const withMission = steps(missionWorld({ objectives: [REACH_FAR] }), 600)
    expect(withMission.aircraft).toEqual(plain.aircraft)
    expect(withMission.ships).toEqual(plain.ships)
    expect(withMission.combat).toEqual(plain.combat)
    expect(plain.mission).toBeNull()
  })

  it('advance does not write into a frozen mission world', () => {
    const w = deepFreeze(missionWorld({ objectives: [REACH_FAR, { id: 'kill', label: 'Kill', priority: 'primary', kind: 'destroy', targets: ['convoy'] }] }))
    expect(() => advance(w, 5 * DT)).not.toThrow()
  })

  it('an unchanged tick returns the same mission object', () => {
    const w = steps(missionWorld({ objectives: [REACH_FAR] }), 1)
    expect(advance(w, DT).world.mission).toBe(w.mission)
  })
})
