import { describe, expect, it } from 'vitest'
import { aircraftById, type World } from '../../../src/sim/loop.js'
import { HOLD_RADIUS_M, initialPoint, IP_HEIGHT_M, recoveryGeometry } from '../../../src/sim/ai/recovery.js'
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
    // 4 km past the IP, both out of ammunition so they go home at once.
    let w = withGunsEmpty(withGunsEmpty(buildRecovery([
      homed('ai-1', { ship: 'cv-1' }, [0, 1000, 12000]),
      homed('ai-2', { ship: 'cv-1' }, [400, 1000, 12000]),
    ]), 'ai-1'), 'ai-2')
    let reachedHold = false
    w = fly(w, 120, (x) => { reachedHold = phaseOf(x, 'ai-2') === 'hold'; return reachedHold })
    expect(reachedHold).toBe(true)
    let worst = 0
    const end = fly(w, 60, (x) => {
      expect(phaseOf(x, 'ai-2')).toBe('hold')
      worst = Math.max(worst, distanceToIp(x, 'ai-2'))
    })
    expect(worst).toBeLessThan(HOLD_RADIUS_M + 300)
    // IP_HEIGHT_M above the flight deck, within the ingress orbit's own 100 m.
    const deckY = recoveryGeometry(aircraftById(end, 'ai-2')!.pilot!.home!, end)!.touchdownM
    expect(Math.abs(aircraftById(end, 'ai-2')!.state.position.y - (deckY + IP_HEIGHT_M))).toBeLessThan(100)
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
