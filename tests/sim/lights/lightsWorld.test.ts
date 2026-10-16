import { describe, expect, it } from 'vitest'
import { loadScenario, loadScenarioBundle } from '../../../tools/content/load.js'
import { parseScenario, worldFromScenario, type ScenarioBundle } from '../../../src/sim/scenario.js'
import { worldChecksum } from '../../../src/flightRecorder/checksum.js'
import { DT } from '../../../src/sim/flight/model.js'
import { advance, withControls, type World } from '../../../src/sim/loop.js'
import type { Controls } from '../../../src/sim/flight/state.js'
import { LIGHT_KINDS, lightsAt, type LightWorld } from '../../../src/sim/lights/lights.js'

const night = (): ScenarioBundle => loadScenarioBundle('night-range')
const idle: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0, fire: false }

describe('the night test range', () => {
  it('places every light kind', () => {
    const kinds = new Set((night().scenario.lights ?? []).map((l) => l.kind))
    expect([...kinds].sort()).toEqual([...LIGHT_KINDS].sort())
  })
  it('has lit and unlit pots, so the lit/unlit swap is visible', () => {
    const pots = (night().scenario.lights ?? []).filter((l) => l.kind === 'pot')
    expect(pots.some((p) => p.state === 'lit')).toBe(true)
    expect(pots.some((p) => p.state === 'unlit')).toBe(true)
  })
  it('every light carries a source label and a note (GAMEPLAY.md: sourced or labeled gameplay)', () => {
    for (const l of night().scenario.lights ?? []) expect(l.sourceNote.length, l.id).toBeGreaterThan(10)
  })
})

describe('lights are not sim state (plan §3.6)', () => {
  it('the world checksum is identical at every one-second checkpoint with the lights evaluated every tick and with the lights removed from the content', () => {
    const withLights = night()
    const without: ScenarioBundle = { ...withLights, scenario: { ...withLights.scenario, lights: undefined } }
    expect((withLights.scenario.lights ?? []).length, 'the fixture really has lights').toBeGreaterThan(10)
    let a: World<undefined> = worldFromScenario(withLights, null)
    let b: World<undefined> = worldFromScenario(without, null)
    const lw = (w: World<undefined>): LightWorld => ({ tick: w.tick, dtS: DT, groundHeightM: () => 0, shipPoint: () => null, aircraftPoint: () => null })
    let checkpoints = 0
    for (let tick = 0; tick < 5 * 60; tick++) {
      a = advance(withControls(a, a.player, idle), DT).world
      b = advance(withControls(b, b.player, idle), DT).world
      lightsAt(withLights.scenario.lights!, lw(a)) // evaluated every tick, results discarded
      if (tick % 60 === 59) { expect(worldChecksum(a), `tick ${tick + 1}`).toBe(worldChecksum(b)); checkpoints++ }
    }
    expect(checkpoints).toBe(5)
  })
  it('a light anchored on an unknown ship or aircraft is rejected at load', () => {
    const good = loadScenario('night-range')
    expect(good.lights?.length).toBeGreaterThan(0)
    const base = { ...good, lights: [{ id: 'x', kind: 'fixture', at: { ship: 'no-such-ship', offset: [0, 0, 0] }, color: 'red', state: 'lit', source: 'gameplay', sourceNote: 'test' }] }
    expect(() => parseScenario(base)).toThrow(/unknown ship "no-such-ship"/)
    const air = { ...good, lights: [{ id: 'x', kind: 'nav', at: { aircraft: 'ghost', point: 'port' }, color: 'red', state: 'on', source: 'gameplay', sourceNote: 'test' }] }
    expect(() => parseScenario(air)).toThrow(/unknown aircraft "ghost"/)
  })
})
