import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../src/sim/content.js'
import { runSoak } from '../../tools/soak/run.js'

describe('randomized soak (spec §11)', () => {
  it('survives 200 randomized flights with no invariant violations', () => {
    const result = runSoak(loadAircraftSpec('f6f-hellcat'), 200, 1337)
    expect(result.failures, result.failures.slice(0, 5).join('\n')).toHaveLength(0)
    expect(result.iterations).toBe(200)
  })

  it('is reproducible from its seed', () => {
    const f6f = loadAircraftSpec('f6f-hellcat')
    expect(runSoak(f6f, 20, 99)).toEqual(runSoak(f6f, 20, 99))
  })
})
