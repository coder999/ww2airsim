import { describe, expect, it } from 'vitest'
import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { aircraftById } from '../../../src/sim/loop.js'
import { bundleForScenario } from '../../../tools/content/load.js'
import { REACH_FAR, scenario } from '../mission/fixture.js'

/** 7f spec §1: `pilot.leader` and `pilot.slot`, each rule rejected by name. */
const PLAYER = { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 } }
const at = (x: number, z = 0) => ({ position: [x, 3000, z], headingDeg: 90, speedMps: 120 })
const wing = (id: string, pilot: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  ({ id, spec: 'f6f-hellcat', side: 'allied', airborneAt: at(-100, 100), pilot: { skill: 'green', ...pilot }, ...extra })
const raw = (aircraft: unknown[]) => ({ id: 'formation-schema', player: 'f6f-1', airfields: ['tacloban'], aircraft, ships: [], weather: { windFromDeg: 0, windMps: 0 } })

describe('pilot.leader and pilot.slot (7f spec §1)', () => {
  it('accepts the player as leader and builds a formation pilot', () => {
    const w = worldFromScenario(bundleForScenario(parseScenario(raw([PLAYER, wing('wing-1', { leader: 'f6f-1', slot: 1 })]))), null)
    const p = aircraftById(w, 'wing-1')!.pilot!
    expect(p.formation).toEqual({ leader: 'f6f-1', slot: 1 })
    expect(p.target).toBeNull()
    expect(p.ingress).toBeUndefined()
    expect(p.decision.mode).toBe('formation')
  })

  it('accepts an AI leader with three wingmen in slots 1-3', () => {
    const lead = { id: 'lead-1', spec: 'f6f-hellcat', side: 'allied', airborneAt: at(-500), pilot: { skill: 'veteran' } }
    expect(() => parseScenario(raw([PLAYER, lead,
      wing('w1', { leader: 'lead-1', slot: 1 }), wing('w2', { leader: 'lead-1', slot: 2 }), wing('w3', { leader: 'lead-1', slot: 3 })]))).not.toThrow()
  })

  it('requires leader and slot together', () => {
    expect(() => parseScenario(raw([PLAYER, wing('w1', { leader: 'f6f-1' })]))).toThrow(/leader and slot go together/)
    expect(() => parseScenario(raw([PLAYER, wing('w1', { slot: 1 })]))).toThrow(/leader and slot go together/)
  })

  it('rejects a slot outside 1-3', () => {
    expect(() => parseScenario(raw([PLAYER, wing('w1', { leader: 'f6f-1', slot: 4 })]))).toThrow()
  })

  it('rejects leader with target or ingress', () => {
    const route = { route: [{ x: 0, z: -9000, altitudeM: 3000, speedMps: 120 }] }
    expect(() => parseScenario(raw([PLAYER, { ...wing('w1', { leader: 'f6f-1', slot: 1, target: 'b1' }) },
      { id: 'b1', spec: 'f6f-hellcat', airborneAt: at(5000) }]))).toThrow(/wingman goes where its leader goes/)
    expect(() => parseScenario(raw([PLAYER, wing('w1', { leader: 'f6f-1', slot: 1, ingress: route })]))).toThrow(/wingman goes where its leader goes/)
  })

  it('rejects a self-leading pilot, an unknown leader, a cross-side leader, a chain and a taken slot', () => {
    expect(() => parseScenario(raw([PLAYER, wing('w1', { leader: 'w1', slot: 1 })]))).toThrow(/cannot lead itself/)
    expect(() => parseScenario(raw([PLAYER, wing('w1', { leader: 'nobody', slot: 1 })]))).toThrow(/leader must name a starting aircraft/)
    expect(() => parseScenario(raw([PLAYER, { ...wing('w1', { leader: 'f6f-1', slot: 1 }), side: 'axis' }]))).toThrow(/leader must be on the same side/)
    expect(() => parseScenario(raw([PLAYER, wing('w1', { leader: 'f6f-1', slot: 1 }), wing('w2', { leader: 'w1', slot: 1 })]))).toThrow(/cannot itself be a wingman/)
    expect(() => parseScenario(raw([PLAYER, wing('w1', { leader: 'f6f-1', slot: 1 }), wing('w2', { leader: 'f6f-1', slot: 1 })]))).toThrow(/slot 1 of leader "f6f-1" is taken/)
  })

  it('lets a held wingman follow a starting leader or one in its own group, and nothing else', () => {
    const raider = (id: string, pilot: Record<string, unknown>) => ({ id, spec: 'f6f-hellcat', airborneAt: at(-20000), pilot: { skill: 'green', ...pilot } })
    // Each held group needs exactly one spawning trigger (unrelated schema
    // rule, `checkMission`'s spawnCount check) or parseScenario throws for
    // that reason before the leader rule under test is ever reached.
    const ok = scenario({
      objectives: [REACH_FAR],
      triggers: [{ id: 'launch-1', when: { at: 60 }, then: [{ spawn: 'wave-1' }] }],
      heldGroups: [{ id: 'wave-1', aircraft: [raider('r1', {}), raider('r2', { leader: 'r1', slot: 1 })] }],
    })
    expect(() => parseScenario(ok)).not.toThrow()
    const other = scenario({
      objectives: [REACH_FAR],
      triggers: [
        { id: 'launch-1', when: { at: 60 }, then: [{ spawn: 'wave-1' }] },
        { id: 'launch-2', when: { at: 60 }, then: [{ spawn: 'wave-2' }] },
      ],
      heldGroups: [
        { id: 'wave-1', aircraft: [raider('r1', {})] }, { id: 'wave-2', aircraft: [raider('r2', { leader: 'r1', slot: 1 })] }],
    })
    expect(() => parseScenario(other)).toThrow(/held pilot's leader must be a starting aircraft or one in its own group/)
  })
})
