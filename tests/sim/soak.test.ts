import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { runSoak, runTerrainSoak } from '../../tools/soak/run.js'
import { DEFAULT_ASSIST_SETTINGS } from '../../src/assists/index.js'
import { loadTerrainHeader, loadTerrainLevel, FIRST_COMMITTED_LEVEL } from '../../tools/terrain/load.js'
import { createTerrainField } from '../../src/sim/world/terrain.js'

describe('randomized soak (spec §11)', () => {
  it('survives 200 randomized flights with no invariant violations', () => {
    // The UNASSISTED arm: no assist between the pilot's command and `step`.
    // Kept exactly as it was, rng draw for rng draw, so the figures below --
    // and the weathercock comparison they rest on -- stay checkable; the
    // assisted arm is the separate test below.
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

  it('is reproducible from its seed, on both arms', () => {
    const f6f = loadAircraftSpec('f6f-hellcat')
    expect(runSoak(f6f, 20, 99)).toEqual(runSoak(f6f, 20, 99))
    // The assisted arm too: `createAssistRunner` carries a mutable cell (the
    // captured altitude), so determinism there is a claim about the harness
    // threading it per flight rather than a property inherited from the rng.
    expect(runSoak(f6f, 20, 99, DEFAULT_ASSIST_SETTINGS)).toEqual(
      runSoak(f6f, 20, 99, DEFAULT_ASSIST_SETTINGS),
    )
  })

  it('survives 200 randomized flights with the shipped assists ON', () => {
    // WHY THIS ARM EXISTS. Every test of the assists flies one hand-picked
    // trajectory, and this harness drove the model with no assist at all -- so
    // the configuration that actually ships, three interacting stages all
    // switched on, had no randomised, long-horizon, invariant-checked coverage.
    // The three Criticals Plan 3 produced were all interactions between two of
    // those stages.
    //
    // It checks more than the unassisted arm does: `stepChecked`'s finiteness
    // and energy invariants as before, plus, on every one of the ~578,000 steps,
    // that the stack's published pitch-authority budget is non-empty, inside
    // [-1, 1], contains the command that was flown, and collapses onto the
    // pilot's own command past 90 degrees of alpha. Those are the same clauses
    // `tests/assists/authoritySweep.test.ts` sweeps over CONSTRUCTED states;
    // here they are checked over states 60 Hz of `step()` actually produced,
    // with the altitude-hold memory threaded the way production threads it.
    const result = runSoak(loadAircraftSpec('f6f-hellcat'), 200, 1337, DEFAULT_ASSIST_SETTINGS)
    expect(result.failures, result.failures.slice(0, 5).join('\n')).toHaveLength(0)
    expect(result.iterations).toBe(200)

    // Floors, set well below what this exact configuration measures, exactly
    // the convention the unassisted arm's comment above lays down: re-measure
    // and move the floors, never the assertions, if the input distribution
    // changes again.
    //
    // MEASURED 2026-09-13, node v22.22.1, seed 1337, 200 iterations,
    // `DEFAULT_ASSIST_SETTINGS`, this aircraft's content: 577,980 steps, 92
    // flights completing the full 60 s, 32,793 stalled steps, 159,224 steps
    // where the stack moved the pitch axis away from the pilot's own command,
    // 145,140 steps with altitude hold engaged (both its gates open), 577,980
    // steps where auto-rudder moved the yaw axis -- i.e. every step, which is
    // why the pitch and yaw counters are separate -- and zero failures. Runtime
    // 2.5 s against the unassisted arm's 1.0 s.
    //
    // Two other seeds, for a sense of how much spread the floors have to
    // tolerate: seed 4242 gives 594,600 / 103 / 33,551 / 164,805 / 149,940 and
    // seed 7 gives 602,040 / 110 / 31,276 / 165,206 / 148,620, both with zero
    // failures.
    //
    // The assisted arm is NOT comparable flight-for-flight with the unassisted
    // one and its numbers are not expected to match: the assists change the
    // trajectory, so which flights reach the water changes, which changes how
    // many rng draws each iteration consumes. It also draws a released pitch
    // stick on 25% of seconds, which the unassisted arm does not (see
    // `rollControls`: altitude hold's gate is an exact 0 and a continuous draw
    // never produces one -- without it this arm engaged altitude hold on 0 of
    // 550,320 steps). The unassisted arm's own figures are unchanged to the
    // digit by all of this, which is asserted above rather than asserted here.
    expect(result.steps).toBeGreaterThan(400000)
    expect(result.flightsCompleted).toBeGreaterThan(60)
    expect(result.stalledSteps).toBeGreaterThan(18000)
    expect(result.assistPitchInterventions).toBeGreaterThan(80000)
    expect(result.assistHoldEngagedSteps).toBeGreaterThan(80000)
    expect(result.assistYawInterventions).toBeGreaterThan(300000)

    // PROVED TO FAIL, 2026-09-13, by the two mutations the authority check
    // exists for -- both of which leave the unassisted arm green, because it
    // runs no assist at all:
    //  - `altitudeHold`'s final `withinAuthority(authority, uncapped)` replaced
    //    by `uncapped` (the original C1 shape): 99 of 200 iterations fail, the
    //    first with `commanded -1 against {"lower":0,"upper":0}`.
    //  - `runStack`'s departed narrowing replaced by `FULL_PITCH_AUTHORITY`
    //    (the third Critical): 53 of 200 iterations fail, the first with
    //    `departed budget {"lower":-1,"upper":1} is not the pilot's own
    //    0.3210875145159662 at alpha -111.66 deg`.
  })
})

describe('terrain contact soak (spec §11, Task 8: the ground the aeroplane can hit)', () => {
  it('never ends a physics step below the ground with impact still null, over the committed L4 field', () => {
    // The committed field, the same one shipped for the offline fallback
    // (Task 6) -- loaded here, in the test, not inside `runTerrainSoak`
    // itself: `tools/soak/run.ts` takes a `TerrainField` the same way
    // `src/sim/loop.ts`'s `advance` does, the caller-injects-the-data pattern
    // this whole plan uses so `sim/` never has to know where terrain data
    // came from. `tools/terrain/load.ts` is fine to import here -- this file
    // is a test, not `src/sim/`.
    const header = loadTerrainHeader()
    const heights = loadTerrainLevel(FIRST_COMMITTED_LEVEL, header)
    const terrain = createTerrainField(header, FIRST_COMMITTED_LEVEL, heights)

    const result = runTerrainSoak(loadAircraftSpec('f6f-hellcat'), 200, 1337, terrain)
    expect(
      result.failures,
      `${result.failures.slice(0, 5).join('\n')}\n(${result.terrainHits} of ${result.iterations} flights recorded an impact)`,
    ).toHaveLength(0)
    expect(result.iterations).toBe(200)

    // Floors, well below what this exact configuration measures -- same
    // convention `runSoak`'s own tests use: re-measure and move the floor,
    // never the assertion, if the input distribution changes again.
    //
    // MEASURED 2026-09-14, node v22.22.1, seed 1337, 200 iterations, this
    // aircraft's content, the committed L4 field: 400,958 steps, 142 of 200
    // flights recording an impact, zero failures. Two other seeds, for a
    // sense of spread: seed 4242 gives 448,873 steps / 128 hits and seed 7
    // gives 411,643 steps / 148 hits, both zero failures.
    expect(result.steps).toBeGreaterThan(300000)
    // The floor that matters most: without it, a soak that never put an
    // aeroplane within reach of the ground would still report zero failures
    // forever, indistinguishable from "the invariant held". 100 is comfortably
    // below every seed measured above (128-148) while being nowhere near 0.
    expect(result.terrainHits).toBeGreaterThan(100)
  })
})
