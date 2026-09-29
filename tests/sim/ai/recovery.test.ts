import { describe, expect, it } from 'vitest'
import { aircraftById, withAircraftState, type World } from '../../../src/sim/loop.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { DT } from '../../../src/sim/flight/model.js'
import { HOLD_RADIUS_M, initialPoint, IP_ARRIVAL_M, IP_HEIGHT_M, recoveryGeometry } from '../../../src/sim/ai/recovery.js'
import { localToWorld } from '../../../src/sim/world/airfields.js'
import { loadAirfield } from '../../../tools/content/load.js'
import { terrainOrSkip } from '../mission/fly.js'
import {
  axis, buildRecovery, fly, homed, phaseOf, withDestroyed, withFuel, withGunsEmpty, withHostileAstern, withShipSunk, withStructure,
  worldWithHostileAbeam, worldWithHostileAstern,
} from './recoveryWorlds.js'

type W = World<undefined>

const terrain = terrainOrSkip()

describe('the return-to-base decision (7g spec §1)', () => {
  it('30 s without a contact sends a homed pilot home; a pilot without a home loiters', () => {
    const w0 = buildRecovery([homed('ai-1', { ship: 'cv-1' }, [0, 1500, 12000]), { ...homed('ai-2', { ship: 'cv-1' }, [500, 1500, 12000]), pilot: { skill: 'veteran' } }])
    const w = fly(w0, 31)
    expect(aircraftById(w, 'ai-1')!.pilot!.decision.mode).toBe('rtb')
    expect(aircraftById(w, 'ai-2')!.pilot!.decision.mode).toBe('loiter')
  })

  it('does not go home before 30 s without a contact', () => {
    const w = fly(buildRecovery([homed('ai-1', { ship: 'cv-1' }, [0, 1500, 12000])]), 29)
    expect(aircraftById(w, 'ai-1')!.pilot!.decision.mode).toBe('loiter')
  })

  it.each([
    ['ammunition exhausted', (w: W) => withGunsEmpty(w, 'ai-1')],
    ['structure below 0.5', (w: W) => withStructure(w, 'ai-1', 0.49)],
  ])('%s sends it home at the next rescore, even with a hostile in range', (_label, set) => {
    // a hostile axis AI 3 km away, not pointing at ai-1 (no threat astern)
    const w = fly(set(worldWithHostileAbeam()), 2)
    expect(aircraftById(w, 'ai-1')!.pilot!.decision.mode).toBe('rtb')
  })

  it('with a hostile in range and nothing spent, it engages (the control case)', () => {
    const w = fly(worldWithHostileAbeam(), 2)
    expect(aircraftById(w, 'ai-1')!.pilot!.decision.mode).toBe('engage')
  })

  it('the fuel trigger fires on a hand-set fuel load (practically dormant in play, spec §1)', () => {
    const w = fly(withFuel(worldWithHostileAbeam(), 'ai-1', 0.2), 2)
    expect(aircraftById(w, 'ai-1')!.pilot!.decision.mode).toBe('rtb')
  })

  it('a threat astern keeps a spent pilot from going home in the first place', () => {
    // ai-1 out of ammo; an axis veteran 600 m behind it from the start.
    const w = fly(withGunsEmpty(worldWithHostileAstern(), 'ai-1'), 2)
    expect(aircraftById(w, 'ai-1')!.pilot!.decision.mode).toBe('engage')
  })

  it('a threat astern pre-empts a recovery under way; once clear it resumes at transit (Review Focus 4)', () => {
    // ai-1 out of ammo and alone: axis-1 is 30+ km off, outside detection range.
    const w0 = withGunsEmpty(buildRecovery([homed('ai-1', { ship: 'cv-1' }, [0, 1500, 12000]), axis('axis-1', [30000, 1500, 40000], 0)]), 'ai-1')
    const w1 = fly(w0, 2)
    expect(aircraftById(w1, 'ai-1')!.pilot!.decision.mode).toBe('rtb')
    expect(phaseOf(w1, 'ai-1')).toBe('transit')
    // Now axis-1 is 600 m dead astern, on its tail.
    const w2 = fly(withHostileAstern(w1, 'ai-1', 'axis-1'), 2)
    expect(aircraftById(w2, 'ai-1')!.pilot!.decision.mode).toBe('engage')
    expect(aircraftById(w2, 'ai-1')!.pilot!.decision.recovery).toBeUndefined()
    const w3 = fly(withDestroyed(w2, 'axis-1'), 3)
    expect(aircraftById(w3, 'ai-1')!.pilot!.decision.mode).toBe('rtb')
    expect(phaseOf(w3, 'ai-1')).toBe('transit')
    expect(aircraftById(w3, 'ai-1')!.pilot!.decision.targetId).toBeNull()
  })

  it('a threat astern its orders will not engage does not drop it out of rtb', () => {
    // A static target that is down: chooseTarget returns null whatever is
    // astern, so there is nothing to pre-empt the recovery for.
    const w0 = buildRecovery([
      { ...homed('ai-1', { ship: 'cv-1' }, [0, 1500, 12000]), pilot: { skill: 'veteran', target: 'axis-2', home: { ship: 'cv-1' } } },
      axis('axis-1', [0, 1500, 12600], 0, 125),
      axis('axis-2', [30000, 1500, 40000], 0),
    ])
    const w = fly(withDestroyed(withGunsEmpty(w0, 'ai-1'), 'axis-2'), 2)
    expect(aircraftById(w, 'ai-1')!.pilot!.decision.mode).toBe('rtb')
  })

  it('a pilot spawned by a trigger at 60 s starts its idle clock then, not at 0 (ruling P10)', () => {
    const w0 = buildRecovery([], {
      objectives: [{ id: 'far', label: 'Far', priority: 'primary', kind: 'reach', point: { x: 90000, z: 90000 }, radiusM: 100 }],
      triggers: [{ id: 'launch', when: { at: 60 }, then: [{ spawn: 'wave-1' }] }],
      heldGroups: [{ id: 'wave-1', aircraft: [homed('ai-9', { ship: 'cv-1' }, [0, 1500, 12000])] }],
    })
    const w1 = fly(w0, 62)
    expect(aircraftById(w1, 'ai-9')).toBeDefined()
    expect(aircraftById(w1, 'ai-9')!.pilot!.decision.mode).toBe('loiter')
    expect(aircraftById(fly(w1, 27), 'ai-9')!.pilot!.decision.mode).toBe('loiter')
    expect(aircraftById(fly(w1, 30), 'ai-9')!.pilot!.decision.mode).toBe('rtb')
  })
})

/** Horizontal distance from `id` to its initial point, from the live deck. */
function distanceToIp(w: W, id: string): number {
  const a = aircraftById(w, id)!
  const geo = recoveryGeometry(a.pilot!.home!, { terrain: w.terrain, ships: w.ships, combat: w.combat })!
  const ip = initialPoint(geo)
  return Math.hypot(a.state.position.x - ip.x, a.state.position.z - ip.z)
}

describe('transit and hold (7g spec, 7c-7g §6 phases 1)', () => {
  it('flies to the initial point 8 km astern of the deck at 600 m, and holds there when the approach is taken', () => {
    // 4 km past the IP, both out of ammunition so they go home at once. The
    // landing interval (Task 8): the lower id joins, the higher id holds,
    // orbiting the IP, for as long as the lower is on the approach.
    const w = withGunsEmpty(withGunsEmpty(buildRecovery([
      homed('ai-1', { ship: 'cv-1' }, [0, 1000, 12000]),
      homed('ai-2', { ship: 'cv-1' }, [400, 1000, 12000]),
    ]), 'ai-1'), 'ai-2')
    let joined: { ipM: number; heightM: number } | null = null
    let holdTicks = 0
    let notHolding = 0
    let worstHoldIpM = 0
    fly(w, 150, (x) => {
      if (joined === null && phaseOf(x, 'ai-1') === 'join') {
        const deckY = recoveryGeometry(aircraftById(x, 'ai-1')!.pilot!.home!, x)!.touchdownM
        joined = { ipM: distanceToIp(x, 'ai-1'), heightM: aircraftById(x, 'ai-1')!.state.position.y - deckY }
      }
      if (joined !== null) {
        if (phaseOf(x, 'ai-2') === 'hold') {
          holdTicks++
          worstHoldIpM = Math.max(worstHoldIpM, distanceToIp(x, 'ai-2'))
        } else if (phaseOf(x, 'ai-2') !== 'transit' || holdTicks > 0) {
          notHolding++
        }
      }
      return phaseOf(x, 'ai-1') === 'final'
    })
    expect(joined, 'ai-1 never reached join').not.toBeNull()
    expect(joined!.ipM).toBeLessThanOrEqual(IP_ARRIVAL_M)
    // Transit's 10 m/s vertical cap arrives high (Task 5: about 115 m).
    expect(Math.abs(joined!.heightM - IP_HEIGHT_M)).toBeLessThan(150)
    // ai-2 reached the IP and orbits it the whole time ai-1 is on the approach.
    expect(holdTicks * DT).toBeGreaterThan(30)
    expect(notHolding).toBe(0)
    expect(worstHoldIpM).toBeLessThan(HOLD_RADIUS_M + 300)
  })

  it('home ship gone: drops home and loiters, no throw', () => {
    const w1 = fly(withGunsEmpty(buildRecovery([homed('ai-1', { ship: 'cv-1' }, [0, 1500, 12000])]), 'ai-1'), 2)
    expect(aircraftById(w1, 'ai-1')!.pilot!.decision.mode).toBe('rtb')
    const w2 = fly({ ...w1, ships: w1.ships.filter((s) => s.id !== 'cv-1') }, 5)
    const pilot = aircraftById(w2, 'ai-1')!.pilot!
    expect(pilot.decision.mode).toBe('loiter')
    expect(pilot.home).toBeUndefined()
    expect(pilot.decision.recovery).toBeUndefined()
  })

  it('home ship sunk: drops home and loiters, no throw', () => {
    const w1 = fly(withGunsEmpty(buildRecovery([homed('ai-1', { ship: 'cv-1' }, [0, 1500, 12000])]), 'ai-1'), 2)
    expect(aircraftById(w1, 'ai-1')!.pilot!.decision.mode).toBe('rtb')
    const w2 = fly(withShipSunk(w1, 'cv-1'), 5)
    const pilot = aircraftById(w2, 'ai-1')!.pilot!
    expect(pilot.decision.mode).toBe('loiter')
    expect(pilot.home).toBeUndefined()
    expect(pilot.decision.recovery).toBeUndefined()
  })

  it('a runway home without terrain: it holds at the IP until terrain arrives, never joins (7c-7g §6)', () => {
    // 4 km outside Tacloban's IP (sea-level geometry), out of ammunition.
    const w0 = withGunsEmpty(buildRecovery([homed('ai-1', { airfield: 'tacloban' }, [0, 1000, 20000])], { ships: [] }), 'ai-1')
    const home = aircraftById(w0, 'ai-1')!.pilot!.home!
    if (home.kind !== 'runway') throw new Error('expected a runway home')
    const ip = initialPoint({ aimX: home.aimX, aimZ: home.aimZ, headingRad: home.headingRad, touchdownM: 0, deck: null, paddles: null })
    const w1 = withAircraftState(w0, 'ai-1', { ...aircraftById(w0, 'ai-1')!.state, position: v3(home.aimX - Math.sin(home.headingRad) * 12000, 1000, home.aimZ + Math.cos(home.headingRad) * 12000) })
    const phases = new Set<string>()
    const w = fly(w1, 15 * 60, (x) => { phases.add(phaseOf(x, 'ai-1') ?? 'none') })
    expect([...phases].filter((p) => p !== 'none' && p !== 'transit' && p !== 'hold')).toEqual([])
    expect(phaseOf(w, 'ai-1')).toBe('hold')
    expect(Math.hypot(aircraftById(w, 'ai-1')!.state.position.x - ip.x, aircraftById(w, 'ai-1')!.state.position.z - ip.z)).toBeLessThan(HOLD_RADIUS_M + 300)
  })

  it.skipIf(terrain === null)('a Dulag-to-Tacloban transit over real terrain never impacts (Review Focus 1)', () => {
    const dulag = loadAirfield('dulag')
    const over = localToWorld(dulag, 0, 0)
    // No carrier: cv-1's loop would cross Leyte, which a terrain world rejects.
    const w0 = withGunsEmpty(buildRecovery([homed('ai-1', { airfield: 'tacloban' }, [over.x, 500, over.z])], { ships: [] }, terrain), 'ai-1')
    let sawTransit = false
    let sawFloor = false
    const w = fly(w0, 180, (x) => {
      const a = aircraftById(x, 'ai-1')!
      sawTransit ||= phaseOf(x, 'ai-1') === 'transit'
      // The line crosses a 291 m hill (measured 2026-09-28): transit keeps the floor.
      sawFloor ||= phaseOf(x, 'ai-1') === 'transit' && a.pilot!.decision.safety !== 'none'
      return a.impact !== null
    })
    expect(sawTransit).toBe(true)
    expect(sawFloor).toBe(true)
    expect(aircraftById(w, 'ai-1')!.impact).toBeNull()
  })
})
