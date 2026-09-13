import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../tools/content/load.js'
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
    // failures.
    //
    // RE-MEASURED 2026-09-13, after directional stability was added: 587,040
    // steps, 99 completions, and 46,086 stalled steps -- 7.9% against 53.1%.
    // Zero invariant failures throughout, and the floors are adjusted rather
    // than the assertions, as the note above requires.
    //
    // WHAT IS PROVEN, and what is not. Running the soak with
    // `weathercockSeconds` set to 1e9, i.e. the term effectively off,
    // reproduces the 2026-09-12 figures EXACTLY -- 611,160 / 132 / 324,467 --
    // so the weathercock is unambiguously the cause and the harness is
    // exploring as before. Under soak-like random inputs the term takes mean
    // absolute sideslip from 15.1 to 5.4 degrees and the peak from 41.9 to
    // 15.2.
    //
    // Those four figures do NOT come from this harness, and 2026-09-13's final
    // whole-branch review could not reproduce them here. Replaying this exact
    // loop (seed 1337, 200 iterations) with |beta| sampled every step returns
    // its step and completion counts to the digit -- 587,040 / 99 with the
    // weathercock and 611,160 / 132 without, as above -- and mean absolute
    // sideslip 28.0 -> 11.0 degrees with the peak 90.0 -> 89.6, roughly twice
    // the quoted mean and six times the quoted peak. The direction and the
    // conclusion are unchanged; the magnitudes are not, so read the four
    // numbers above as belonging to whatever "soak-like" probe produced them,
    // not to this test. The reproducible ones, and what they imply for the
    // dynamic-pressure approximation, are in design open item 10.
    //
    // The likely mechanism, NOT isolated: a crabbing aeroplane really is at a
    // higher alpha for the same flight path, by 1/cos(sideslip) -- 34% at 42
    // degrees of slip -- so removing the crab removes that. Other effects
    // point the same way and were not separated out, notably that less
    // sideslip means less drag, so more speed, so less alpha is needed to hold
    // the same lift. Treat the number, not the story, as the measured part.
    //
    // CORRECTED 2026-09-13 (Plan 3 Task 3). This comment used to add that the
    // 1/cos(sideslip) term was itself a defect -- alpha "computed with the
    // lateral component left in the denominator, rather than in the body x-z
    // plane" -- repeating design open item 8. That was wrong, and the item is
    // now retracted: `atan2(-dot(v, up), dot(v, forward))` IS the in-plane
    // angle, because projecting the lateral component out changes neither dot
    // product (derivation on `angleOfAttack`; asserted in
    // tests/sim/flight/angleOfAttack.test.ts). The physical claim in the
    // paragraph above survives; only the diagnosis was wrong.
    //
    // So nothing about the model changed in that task, and these three floors
    // did not move. RE-MEASURED 2026-09-13 on the same configuration, after
    // the retraction: 587,040 steps, 99 completions, 46,086 stalled steps,
    // zero failures -- identical in every digit to the run above.
    expect(result.steps).toBeGreaterThan(400000)
    expect(result.flightsCompleted).toBeGreaterThan(80)
    expect(result.stalledSteps).toBeGreaterThan(25000)
  })

  it('is reproducible from its seed', () => {
    const f6f = loadAircraftSpec('f6f-hellcat')
    expect(runSoak(f6f, 20, 99)).toEqual(runSoak(f6f, 20, 99))
  })
})
