import { describe, expect, it } from 'vitest'
import { parseScenario } from '../../../src/sim/scenario.js'
import { REACH_FAR, scenario } from './fixture.js'

/**
 * F10-0 T0.9: a scenario's declared simultaneous maxima are checked against its start entities plus the worst case of its held groups, where a
 * group admitted by another's `when.gone` never overlaps it (A6, J6: the finales' route groups and slots).
 * The fixture starts with two airborne aircraft (the player and `bandit-1`) and three ships.
 */
const jet = (id: string, tags: string[] = []) => ({ id, spec: 'f6f-hellcat', tags, airborneAt: { position: [-20000, 3000, -16000], headingDeg: 90, speedMps: 130 }, pilot: { target: 'f6f-1' } })
const group = (id: string, n: number, tags: string[] = []) => ({ id, aircraft: Array.from({ length: n }, (_, i) => jet(`${id}-${i}`, [`${id}-tag`, ...tags])) })
const spawn = (id: string, when: unknown) => ({ id: `go-${id}`, when, then: [{ spawn: id }] })
const load = (cap: Record<string, number>, groups: ReturnType<typeof group>[], whens: Record<string, unknown> = {}) => () => parseScenario(scenario({
  objectives: [REACH_FAR],
  heldGroups: groups,
  triggers: groups.map((g) => spawn(g.id, whens[g.id] ?? { at: 10 })),
  population: cap,
}))

describe('population', () => {
  it('ungated groups all count at once', () => {
    const groups = [group('g1', 4), group('g2', 4)]
    expect(load({ airborne: 10, ships: 3 }, groups)).not.toThrow() // 2 + 4 + 4
    expect(load({ airborne: 9, ships: 3 }, groups)).toThrow(/10 aircraft can be airborne at once, over the declared 9/)
  })
  it('a group admitted when another is gone does not overlap it', () => {
    const groups = [group('g1', 4), group('g2', 4)]
    const gated = { g2: { gone: { targets: ['g1-tag'] } } }
    expect(load({ airborne: 6, ships: 3 }, groups, gated)).not.toThrow() // 2 + the heavier of the two
    expect(load({ airborne: 5, ships: 3 }, groups, gated)).toThrow(/6 aircraft/)
  })
  it('waiting is transitive, and an unrelated group still adds', () => {
    const groups = [group('a', 4), group('b', 4), group('c', 4), group('d', 3)]
    const chain = { b: { gone: { targets: ['a-tag'] } }, c: { gone: { targets: ['b-tag'] } } }
    // a, b and c never coexist (c waits on b waits on a); d is free: 2 + 4 + 3
    expect(load({ airborne: 9, ships: 3 }, groups, chain)).not.toThrow()
    expect(load({ airborne: 8, ships: 3 }, groups, chain)).toThrow(/9 aircraft/)
  })
  it('counts ships and the close set the same way', () => {
    const two = { id: 'fleet', ships: [{ id: 'dd-1', spec: 'fletcher-dd', waypoints: [[-24000, -9000], [-23000, -9000]], speedMps: 7 }, { id: 'dd-2', spec: 'fletcher-dd', waypoints: [[-24000, -8000], [-23000, -8000]], speedMps: 7 }] }
    const run = (cap: Record<string, number>) => () => parseScenario(scenario({
      objectives: [REACH_FAR], heldGroups: [two, group('cap', 3, ['close'])],
      triggers: [spawn('fleet', { at: 10 }), spawn('cap', { at: 10 })], population: cap,
    }))
    expect(run({ airborne: 8, ships: 5, close: 3 })).not.toThrow()
    expect(run({ airborne: 8, ships: 4, close: 3 })).toThrow(/5 ships/)
    expect(run({ airborne: 8, ships: 5, close: 2 })).toThrow(/3 aircraft can be in the close set/)
  })
  it('a scenario without a population block is unchanged, and the finale numbers fit when the groups wait their turn', () => {
    expect(() => parseScenario(scenario({ objectives: [REACH_FAR] }))).not.toThrow()
    // 24 airborne: 2 at the start + 22 at once (three waves of 22, 22, 22 that each wait on the one before)
    const waves = [group('w1', 22), group('w2', 22), group('w3', 22)]
    const sequenced = { w2: { gone: { targets: ['w1-tag'] } }, w3: { gone: { targets: ['w2-tag'] } } }
    expect(load({ airborne: 24, ships: 3 }, waves, sequenced)).not.toThrow()
    expect(load({ airborne: 24, ships: 3 }, waves)).toThrow(/68 aircraft/)
  })
})
