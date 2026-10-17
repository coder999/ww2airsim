import { describe, expect, it } from 'vitest'
import { lastLanding } from '../../../src/sim/mission/state.js'
import { loadAirfield } from '../../../tools/content/load.js'
import { destroyStructure, flatField, landOnce, missionWorld, progressOf, steps } from './fixture.js'

/**
 * F10-0, Decision 13 (Mark, 2026-10-17): after the landing that completes the mission, the script freezes and Continue Sortie is a free sortie. A
 * landing that does not qualify leaves the script running. Opt-in per scenario (`freezeOnSuccess`), so every pooled mission is as it was.
 */
const tac = loadAirfield('tacloban').runway.center
const HANGAR = 'dulag-hangar-1'
const kill = { id: 'kill', label: 'Kill', priority: 'primary', kind: 'destroy', targets: [HANGAR] }
const home = { id: 'home', label: 'Home', priority: 'primary', kind: 'land', at: 'tacloban', suggestedRecovery: true }
const WAVE = { id: 'w-1', spec: 'f6f-hellcat', tags: ['wave'], airborneAt: { position: [-20000, 3000, -16479], headingDeg: 90, speedMps: 130 }, pilot: { target: 'f6f-1' } }
// The wave is due 20 minutes in, long after the landing.
const script = { ships: [], heldGroups: [{ id: 'wave', aircraft: [WAVE] }], triggers: [{ id: 'later', when: { at: 1200 }, then: [{ spawn: 'wave' }, { message: 'second wave' }] }] }
const world = (freeze: boolean, killed: boolean) => {
  const w = missionWorld({ objectives: [kill, home], ...script, ...(freeze ? { freezeOnSuccess: true } : {}) }, flatField(100))
  return landOnce(killed ? destroyStructure(w, HANGAR) : w, tac.x, 100, tac.z)
}
const later = <M>(w: Parameters<typeof steps<M>>[0]) => steps(w, 60 * 1300)

describe('the Continue latch', () => {
  it('after the qualifying landing the script is frozen: no wave, no message, no objective change', () => {
    const w = world(true, true)
    expect(w.mission!.latched).toBe(true)
    const done = later(w)
    expect(done.mission!.spawned).toEqual([])
    expect(done.mission!.fired).toEqual([])
    expect(done.aircraft.some((a) => a.id === 'w-1')).toBe(false)
    expect(progressOf(done, 'kill').status).toBe('complete')
    expect(progressOf(done, 'home').status).toBe('complete')
  })
  it('without the flag the script runs on, exactly as every mission did before', () => {
    const w = world(false, true)
    expect(w.mission!.latched).toBeUndefined()
    const done = later(w)
    expect(done.mission!.spawned).toEqual(['wave'])
    expect(done.aircraft.some((a) => a.id === 'w-1')).toBe(true)
  })
  it('a landing that does not qualify does not latch; the attack window goes on', () => {
    const w = world(true, false) // landed, but the hangar still stands
    expect(w.mission!.latched).toBeUndefined()
    expect(progressOf(w, 'home').status).toBe('complete') // the landing objective itself is met; the kill is not
    const done = later(w)
    expect(done.mission!.spawned).toEqual(['wave'])
  })
  it('a later stop is still logged, so the debrief reads the right landing', () => {
    const w = world(true, true)
    const before = w.mission!.log.filter((e) => e.kind === 'landing').length
    const again = landOnce(w, tac.x, 100, tac.z)
    expect(again.mission!.latched).toBe(true)
    expect(again.mission!.log.filter((e) => e.kind === 'landing').length).toBeGreaterThan(before)
    expect(lastLanding(again.mission!)!.tick).toBeGreaterThan(lastLanding(w.mission!)!.tick)
  })
})
