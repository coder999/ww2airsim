import { describe, expect, it } from 'vitest'
import { sameSide, sideOf, sidesOf } from '../../src/sim/sides.js'
import { parseScenario, worldFromScenario } from '../../src/sim/scenario.js'
import { createWorldOf, type AircraftEntity } from '../../src/sim/loop.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { GREEN_SKILL, initialDecision } from '../../src/sim/ai/pilot.js'
import { loadAircraftSpec, loadScenario, loadScenarioBundle } from '../../tools/content/load.js'

const SHIPPED = ['deck-quals', 'free-flight', 'gunnery-range', 'strike-range', 'pursuit-range', 'pursuit-range-veteran']

describe('sides (7e spec §4.1)', () => {
  it('defaults: the player is allied and every other aircraft axis; content overrides', () => {
    const w = { player: 'p' }
    expect(sideOf(w, { id: 'p' })).toBe('allied')
    expect(sideOf(w, { id: 'x' })).toBe('axis')
    expect(sideOf(w, { id: 'x', side: 'allied' })).toBe('allied')
    expect(sideOf(w, { id: 'p', side: 'axis' })).toBe('axis')
  })

  it('reproduces every shipped scenario: the player allied, every other aircraft axis, no entity carries side', () => {
    for (const id of SHIPPED) {
      const world = worldFromScenario(loadScenarioBundle(id), null)
      const sides = sidesOf(world, world.aircraft)
      for (const a of world.aircraft) {
        expect(sides[a.id], `${id}/${a.id}`).toBe(a.id === world.player ? 'allied' : 'axis')
        expect('side' in a, `${id}/${a.id} gained a side key`).toBe(false)
      }
    }
  })

  it('sameSide: true for two allies, false across sides and for an unknown id', () => {
    const sides = { a: 'axis', b: 'axis', c: 'allied' } as const
    expect(sameSide(sides, 'a', 'b')).toBe(true)
    expect(sameSide(sides, 'a', 'c')).toBe(false)
    expect(sameSide(sides, 'a', 'zz')).toBe(false)
    expect(sameSide(sides, 'zz', 'zz')).toBe(false)
  })

  it('carries an explicit content side onto the entity', () => {
    const raw = loadScenario('pursuit-range') as { aircraft: Record<string, unknown>[] }
    const withAlly = { ...raw, aircraft: [raw.aircraft[0], { ...raw.aircraft[1], side: 'axis' }] }
    const world = worldFromScenario({ ...loadScenarioBundle('pursuit-range'), scenario: parseScenario(withAlly) }, null)
    expect(world.aircraft[1]!.side).toBe('axis')
  })

  it('rejects a static target on its own side, in the schema', () => {
    const raw = loadScenario('pursuit-range') as { aircraft: Record<string, unknown>[] }
    const friendly = { ...raw, aircraft: [raw.aircraft[0], { ...raw.aircraft[1], side: 'allied' }] }
    expect(() => parseScenario(friendly)).toThrow(/aircraft\.1\.pilot\.target: pilot target must be on the opposite side/)
  })

  it('accepts a pilot with no target (it chooses), and builds target: null', () => {
    const raw = loadScenario('pursuit-range') as { aircraft: Record<string, unknown>[] }
    const chooser = { ...raw, aircraft: [raw.aircraft[0], { ...raw.aircraft[1], pilot: { skill: 'veteran' } }] }
    const world = worldFromScenario({ ...loadScenarioBundle('pursuit-range'), scenario: parseScenario(chooser) }, null)
    expect(world.aircraft[1]!.pilot!.target).toBeNull()
  })

  it('rejects a static target on its own side, in createWorldOf', () => {
    const f6f = loadAircraftSpec('f6f-hellcat')
    const make = (id: string, x: number, extra: Partial<AircraftEntity<undefined>> = {}): AircraftEntity<undefined> => {
      const state = createState({ position: v3(x, 2000, 0), velocity: v3(120, 0, 0) })
      return { id, spec: f6f, state, previous: state, controls: { roll: 0, pitch: 0, yaw: 0, throttle: 0.7 }, assistMemory: undefined, impact: null, parked: false, ...extra }
    }
    const ai = make('ai', 0, { side: 'allied', pilot: { target: 'p', skill: GREEN_SKILL, decision: initialDecision() } })
    expect(() => createWorldOf({ aircraft: [ai, make('p', 500)], player: 'p' })).toThrow('createWorldOf: pilot "ai" targets "p" on its own side')
    // The same pilot on the axis side is fine.
    expect(() => createWorldOf({ aircraft: [{ ...ai, side: 'axis' }, make('p', 500)], player: 'p' })).not.toThrow()
  })
})
