import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../src/sim/content.js'
import { runSoak } from '../../tools/soak/run.js'

describe('randomized soak (spec §11)', () => {
  it('survives 200 randomized flights with no invariant violations', () => {
    const result = runSoak(loadAircraftSpec('f6f-hellcat'), 200, 1337)
    expect(result.failures, result.failures.slice(0, 5).join('\n')).toHaveLength(0)
    expect(result.iterations).toBe(200)

    // Important 2: `iterations` alone is echoed straight back from the
    // parameter, so it cannot fail if the harness quietly stopped exploring
    // (e.g. a spawn-at-altitude-0 regression, a narrowed control range, or
    // an inner loop that breaks out immediately) -- all of those would still
    // report zero failures and 200 iterations. These floors are set well
    // below what this exact configuration (seed 1337, 200 iterations)
    // measures. Re-measure and adjust the floors, not the assertions, if the
    // soak's input distribution changes again.
    //
    // Measured 2026-09-12 after finding C1 (the negative-alpha lift
    // discontinuity) was fixed: 611,160 steps, 132/200 flights completing
    // the full 60 s, and 324,467 stalled steps (53.1%), with zero invariant
    // failures -- the energy invariant does NOT trip on the corrected curve.
    // Before that fix the same seed gave 622,380 steps, 137 completions and
    // 320,819 stalled steps: removing the spurious extra lift below -15.5
    // degrees alpha costs a handful of flights their last few seconds. The
    // floors below are unchanged, because all three still clear them by
    // 1.5x, 1.65x and 3.2x respectively.
    expect(result.steps).toBeGreaterThan(400000)
    expect(result.flightsCompleted).toBeGreaterThan(80)
    expect(result.stalledSteps).toBeGreaterThan(100000)
  })

  it('is reproducible from its seed', () => {
    const f6f = loadAircraftSpec('f6f-hellcat')
    expect(runSoak(f6f, 20, 99)).toEqual(runSoak(f6f, 20, 99))
  })
})
