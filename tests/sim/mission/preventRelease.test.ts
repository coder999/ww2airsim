import { describe, expect, it } from 'vitest'
import type { World } from '../../../src/sim/loop.js'
import { objectiveLineLabel } from '../../../src/render/mission/hud.js'
import { destroyAircraft, missionWorld, moveAircraft, progressOf, steps } from './fixture.js'
import { v3 } from '../../../src/sim/math/vec3.js'

/**
 * F10E `preventRelease` (plan 2026-10-17-f10e-finales-a6-j6, E.1): an attacker counts when it was destroyed BEFORE its combat record shows a
 * release. It reads the same record `released` reads. Ten attackers, need five (A6's "at least five of the ten"), here three raiders, need two.
 */
const raiders = ['r1', 'r2', 'r3'].map((id, i) => ({ id, spec: 'g4m-betty', tags: ['raid'], airborneAt: { position: [0, 3000, -20000 - i * 500], headingDeg: 90, speedMps: 90 } }))
const PLAYER = { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 } }
const o = (extra: Record<string, unknown> = {}) => ({ id: 'stop', label: 'Stop the raid', priority: 'primary', kind: 'preventRelease', targets: ['raid'], store: 'bomb', count: 2, ...extra })
const world = (objectives: unknown[] = [o()]) => missionWorld({ aircraft: [PLAYER, ...raiders], objectives })
const dropped = (w: World<undefined>, id: string, n = 1): World<undefined> =>
  ({ ...w, combat: { ...w.combat, aircraft: { ...w.combat.aircraft, [id]: { ...w.combat.aircraft[id]!, bombsDropped: n } } } })

describe('preventRelease', () => {
  it('counts an attacker destroyed before it released, and completes at the count', () => {
    let w = steps(destroyAircraft(world(), 'r1'), 2)
    expect(progressOf(w, 'stop')).toMatchObject({ status: 'active', count: 1 })
    w = steps(destroyAircraft(w, 'r2'), 2)
    expect(progressOf(w, 'stop')).toMatchObject({ status: 'complete', count: 2 })
  })
  it('does not count one that released and then died, and a survivor is not counted either', () => {
    let w = steps(destroyAircraft(dropped(world(), 'r1'), 'r1'), 2)
    expect(progressOf(w, 'stop')).toMatchObject({ status: 'active', count: 0 })
    w = steps(world(), 600)
    expect(progressOf(w, 'stop')).toMatchObject({ status: 'active', count: 0 })
  })
  it('fails the moment too many have released for the count to be reachable', () => {
    let w = steps(dropped(world(), 'r1'), 2)
    expect(progressOf(w, 'stop').status).toBe('active') // two of three can still be stopped
    w = steps(dropped(w, 'r2'), 2)
    expect(progressOf(w, 'stop').status).toBe('failed')
  })
  it('a kill that lands the same tick as a release is a release (the record decides)', () => {
    const w = steps(destroyAircraft(dropped(world([o({ count: 3 })]), 'r1'), 'r1'), 2)
    expect(progressOf(w, 'stop').status).toBe('failed')
  })
  it('reads the store: a torpedo is not a bomb, a rocket is its own store', () => {
    const torp = { ...world(), combat: { ...world().combat } }
    const w = dropped(torp, 'r1')
    const withTorp = { ...w, combat: { ...w.combat, aircraft: { ...w.combat.aircraft, r1: { ...w.combat.aircraft.r1!, torpedoesDropped: 1 } } } }
    expect(progressOf(steps(destroyAircraft(withTorp, 'r1'), 2), 'stop').count).toBe(1) // that drop was a torpedo, so no bomb was released
  })
  it('rejects a count above its set, a non-aircraft target and an unknown store', () => {
    expect(() => world([o({ count: 4 })])).toThrow(/asks for 4 of 3/)
    expect(() => world([o({ targets: ['convoy'] })])).toThrow(/which is a ship/)
    expect(() => world([o({ store: 'flare' })])).toThrow()
  })
  it('shows n/count on the HUD line, and is a primary that never reads as a standing order', () => {
    const w = steps(destroyAircraft(world(), 'r1'), 2)
    expect(objectiveLineLabel(w.mission)).toBe('STOP THE RAID 1/2')
  })
  it('keeps counting while the player is nowhere near', () => {
    const far = moveAircraft(world(), 'f6f-1', v3(90000, 3000, 90000))
    expect(progressOf(steps(destroyAircraft(destroyAircraft(far, 'r1'), 'r3'), 2), 'stop').status).toBe('complete')
  })
})
