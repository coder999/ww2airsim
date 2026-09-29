import { describe, it, expect } from 'vitest'
import { parseScenario, worldFromScenario } from '../../src/sim/scenario.js'
import { aircraftById } from '../../src/sim/loop.js'
import { spawnHeldGroup } from '../../src/sim/mission/spawn.js'
import { groundUnder } from '../../src/sim/world/ground.js'
import { bundleForScenario } from '../../tools/content/load.js'
import { REACH_FAR, scenario } from './mission/fixture.js'
import { terrainOrSkip } from './mission/fly.js'

const terrain = terrainOrSkip()

type Over = { readonly chocked?: boolean; readonly takeoff?: boolean; readonly ship?: string }
/** A Zero parked on Dulag's runway, in a held group. */
const parked = (o: Over) => ({
  id: 'ai-1', spec: 'a6m2-zero', side: 'axis',
  parkedAt: o.ship !== undefined ? { ship: o.ship, spot: { x: 0, z: 0 } } : { airfield: 'dulag', spot: { x: 0, z: 0 } },
  chocked: o.chocked ?? false,
  pilot: o.takeoff === false ? { skill: 'green' } : { takeoff: true },
})
const heldRaw = (o: Over): Record<string, unknown> => scenario({
  objectives: [REACH_FAR],
  triggers: [{ id: 'launch', when: { at: 100000 }, then: [{ spawn: 'defenders' }] }],
  heldGroups: [{ id: 'defenders', aircraft: [parked(o)] }],
})
const startRaw = (o: Over): Record<string, unknown> => scenario({
  aircraft: [
    { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 } },
    parked(o),
  ],
})

describe('takeoff scenarios', () => {
  it('accepts a held aircraft parked on an airfield with pilot.takeoff', () => {
    expect(() => parseScenario(heldRaw({ takeoff: true }))).not.toThrow()
  })
  it('still rejects a held aircraft parked without takeoff (R3)', () => {
    expect(() => parseScenario(heldRaw({ takeoff: false }))).toThrow(/held aircraft must start airborne/)
  })
  it('rejects a held ship park even with takeoff', () => {
    expect(() => parseScenario(heldRaw({ ship: 'cv-1', takeoff: true }))).toThrow(/held aircraft must start airborne/)
  })
  it('rejects a chocked takeoff pilot, held or at start', () => {
    expect(() => parseScenario(heldRaw({ chocked: true, takeoff: true }))).toThrow(/takeoff.*chocked/)
    expect(() => parseScenario(startRaw({ chocked: true, takeoff: true }))).toThrow(/takeoff.*chocked/)
  })
  it('rejects takeoff on an airborne aircraft and takeoff with a leader', () => {
    const airborne = { id: 'f6f-2', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 500], headingDeg: 90, speedMps: 120 }, pilot: { takeoff: true } }
    expect(() => parseScenario(scenario({ aircraft: [...(scenario({}).aircraft as unknown[]), airborne] }))).toThrow(/takeoff needs a parkedAt airfield/)
    const led = { ...parked({}), pilot: { takeoff: true, leader: 'f6f-1', slot: 1 } }
    expect(() => parseScenario(scenario({ aircraft: [...(scenario({}).aircraft as unknown[]), led] }))).toThrow(/takeoff excludes leader/)
  })
  it('seeds mode takeoff and phase wait', () => {
    const w = worldFromScenario(bundleForScenario(parseScenario(startRaw({ takeoff: true }))), null)
    const d = aircraftById(w, 'ai-1')!.pilot!.decision
    expect(d.mode).toBe('takeoff')
    expect(d.takeoff).toMatchObject({ phase: 'wait', sinceS: 0, headingRad: null, pitchIntegral: 0 })
  })
  it.skipIf(terrain === null)('a spawned parked aircraft rests on the terrain', () => {
    let w = worldFromScenario(bundleForScenario(parseScenario(heldRaw({ takeoff: true }))), terrain)
    w = spawnHeldGroup(w, 'defenders')
    const a = aircraftById(w, 'ai-1')!
    const ground = groundUnder(terrain, [], a.state.position.x, a.state.position.z)!
    expect(a.state.position.y).toBeCloseTo(ground.heightM + a.spec.gear.heightM, 6)
  })
})
