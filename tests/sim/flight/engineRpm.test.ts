import { describe, expect, it } from 'vitest'
import { engineRpmAfter } from '../../../src/sim/flight/model.js'
import { createState } from '../../../src/sim/flight/state.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

describe('C3 indicated engine RPM', () => {
  it('follows throttle with deterministic lag', () => {
    const spec = loadAircraftSpec('f6f-hellcat')
    let a = createState()
    let b = createState()
    for (let i = 0; i < 60; i++) {
      a = { ...a, engineRpm: engineRpmAfter(spec, a, 1, false, 1 / 60) }
      b = { ...b, engineRpm: engineRpmAfter(spec, b, 1, false, 1 / 60) }
    }
    expect(a.engineRpm).toStrictEqual(b.engineRpm)
    expect(a.engineRpm[0]).toBeGreaterThan(spec.engine.idleRpm)
    expect(a.engineRpm[0]).toBeLessThan(spec.engine.ratedRpm)
  })

  it('winds down during a cutout and cannot change the aircraft spec', () => {
    const spec = loadAircraftSpec('a6m2-zero')
    const state = createState({ engineRpm: [spec.engine.ratedRpm] })
    const after = engineRpmAfter(spec, state, 1, true, 1 / 60)
    expect(after[0]).toBeLessThan(state.engineRpm[0]!)
    expect(spec.engine.maxPowerW).toBe(loadAircraftSpec('a6m2-zero').engine.maxPowerW)
  })

  it('uses independent outputs and repeats an aggregate legacy channel', () => {
    const bomber = { ...loadAircraftSpec('b-17-flying-fortress'), engineOutputs: [1, 0.5, 0, 1] }
    const state = createState({ engineRpm: [2000, 2000, 2000, 2000] })
    const next = engineRpmAfter(bomber, state, 0.8, false, 0.5)
    expect(next).toHaveLength(4)
    expect(next[0]).toBeGreaterThan(next[1]!)
    expect(next[1]).toBeGreaterThan(next[2]!)
    expect(next[3]).toBe(next[0])

    const p38 = { ...loadAircraftSpec('p-38-lightning'), engineOutputs: [0.4] }
    const paired = engineRpmAfter(p38, createState(), 0.7, false, 1 / 60)
    expect(paired).toHaveLength(2)
    expect(paired[1]).toBe(paired[0])
  })
})
