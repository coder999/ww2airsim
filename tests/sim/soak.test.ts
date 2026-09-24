import { describe, it, expect } from 'vitest'
import { loadAircraftSpec, loadScenarioBundle } from '../../tools/content/load.js'
import { runEntitySoak, runSoak, runTerrainSoak } from '../../tools/soak/run.js'
import { type AssistSettings } from '../../src/assists/index.js'
import { loadTerrainHeader, loadTerrainLevel } from '../../tools/terrain/load.js'
import { finestFetchedLevelFor } from '../../src/render/content.js'
import { createTerrainField } from '../../src/sim/world/terrain.js'

/** The level a real page load actually flies over today -- `main.ts`'s and
 *  `terrain/mesh.ts`'s own placeholder pending Task 6's real persisted-tier
 *  wiring (deliberately `'low'`, not the spec's eventual `'medium'` default;
 *  see those two files' own notes on why). Before Task 2 (2026-09-24) this
 *  file used `FIRST_COMMITTED_LEVEL`, numerically the same thing (2) at the
 *  time; the two concepts have since diverged ("what's committed on disk",
 *  now 0, vs "what a page load fetches", tier-dependent). */
const GROUND_TRUTH_LEVEL = finestFetchedLevelFor('low')

/**
 * Every assist on, stated here rather than read from
 * `DEFAULT_ASSIST_SETTINGS`.
 *
 * Both arms below are about what the three stages do when they INTERACT, which
 * is a property of the stages, not of whichever subset currently ships. Reading
 * the shipped default coupled them to it, and when `altitudeHold` defaulted off
 * on 2026-09-15 that turned into silent coverage loss rather than a failure
 * that says what it means.
 */
const ALL_ASSISTS_ON: AssistSettings = {
  stallLimiter: true,
  autoRudder: true,
}

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
    // The likely mechanism, NOT isolated: a crabbing airplane really is at a
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
    expect(runSoak(f6f, 20, 99, ALL_ASSISTS_ON)).toEqual(runSoak(f6f, 20, 99, ALL_ASSISTS_ON))
  })

  it('survives 200 randomized flights with every assist ON', () => {
    // WHY THIS ARM EXISTS. Every test of the assists flies one hand-picked
    // trajectory, and this harness drove the model with no assist at all -- so
    // three interacting stages all switched on had no randomised,
    // long-horizon, invariant-checked coverage. The three Criticals Plan 3
    // produced were all interactions between two of those stages.
    //
    // This arm pins all three ON EXPLICITLY rather than reading
    // `DEFAULT_ASSIST_SETTINGS`, which it did until 2026-09-15. On that date
    // `altitudeHold`'s default flipped to off, and following the default here
    // would have quietly retired the coverage this arm exists for: altitude
    // hold went from 145,140 engaged steps to 0, and pitch interventions from
    // 159,224 to 21,073. Lowering the floors to match would have looked like a
    // re-measure and been a deletion. The stage still ships -- `H` enables it
    // -- so it still needs the long-horizon arm. The floors below are the
    // 2026-09-13 numbers, unchanged, because this is the configuration they
    // were measured on.
    //
    // It checks more than the unassisted arm does: `stepChecked`'s finiteness
    // and energy invariants as before, plus, on every one of the ~578,000 steps,
    // that the stack's published pitch-authority budget is non-empty, inside
    // [-1, 1], contains the command that was flown, and collapses onto the
    // pilot's own command past 90 degrees of alpha. Those are the same clauses
    // `tests/assists/authoritySweep.test.ts` sweeps over CONSTRUCTED states;
    // here they are checked over states 60 Hz of `step()` actually produced,
    // with the altitude-hold memory threaded the way production threads it.
    const result = runSoak(loadAircraftSpec('f6f-hellcat'), 200, 1337, ALL_ASSISTS_ON)
    expect(result.failures, result.failures.slice(0, 5).join('\n')).toHaveLength(0)
    expect(result.iterations).toBe(200)

    // Floors, set well below what this exact configuration measures, exactly
    // the convention the unassisted arm's comment above lays down: re-measure
    // and move the floors, never the assertions, if the input distribution
    // changes again.
    //
    // MEASURED 2026-09-13, node v22.22.1, seed 1337, 200 iterations,
    // all three assists on, this aircraft's content: 577,980 steps, 92
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
    // stick on 25% of seconds -- `CENTRED_PITCH_CHANCE`, added for altitude
    // hold's exact-zero gate, which a continuous draw never produces. That
    // assist was deleted on 2026-09-17 and the centred draw is KEPT: a
    // released stick is a real thing a pilot does, and it is now coverage for
    // the two remaining assists rather than for the deleted one. The
    // unassisted arm's own figures are unchanged to the digit by all of this,
    // which is asserted above rather than here.
    expect(result.steps).toBeGreaterThan(400000)
    expect(result.flightsCompleted).toBeGreaterThan(60)
    expect(result.stalledSteps).toBeGreaterThan(18000)
    // RE-MEASURED 2026-09-17, down from 80,000. Altitude hold produced most of
    // the pitch interventions -- it commanded the axis on every centred step --
    // and it was deleted that day, leaving only the stall limiter voting on
    // pitch. Measured 22,747 at this seed. The floor moves with the
    // measurement, per this file's own rule; leaving it at 80,000 would assert
    // that a deleted assist is still working, and lowering it to 1 would stop
    // asserting anything.
    expect(result.assistPitchInterventions).toBeGreaterThan(15000)
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

describe('terrain contact soak (spec §11, Task 8: the ground the airplane can hit)', () => {
  it('never ends a physics step below the ground with impact still null, over the committed L4 field', () => {
    // The committed field, the same one shipped for the offline fallback
    // (Task 6) -- loaded here, in the test, not inside `runTerrainSoak`
    // itself: `tools/soak/run.ts` takes a `TerrainField` the same way
    // `src/sim/loop.ts`'s `advance` does, the caller-injects-the-data pattern
    // this whole plan uses so `sim/` never has to know where terrain data
    // came from. `tools/terrain/load.ts` is fine to import here -- this file
    // is a test, not `src/sim/`.
    const header = loadTerrainHeader()
    const heights = loadTerrainLevel(GROUND_TRUTH_LEVEL, header)
    const terrain = createTerrainField(header, GROUND_TRUTH_LEVEL, heights)

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
    //
    // RE-MEASURED 2026-09-16 (Task 10), after `runTerrainSoak` started tying
    // `gearFraction` to the near-ground spawn cohort (needed so
    // `supportedContact`, src/sim/ground.ts, can ever hold at all -- gear was
    // never commanded down before this task, so the "arrives and stays"
    // path this task adds assertions for was structurally unreachable) and
    // the crash check gained a `supportedContact` exemption for a
    // legitimately resting airplane: seed 1337 gives 417,539 steps / 134
    // hits, seed 4242 gives 432,579 / 133, seed 7 gives 430,355 / 146, all
    // zero failures.
    //
    // RE-MEASURED AGAIN 2026-09-16 (fix round 1): that first re-measurement
    // was not enough. Instrumented, `supportedContact` held on literally ZERO
    // of seed 1337's 417,539 ticks and zero of seed 7's -- the `nearGround`
    // cohort's fully random attitude/speed/vertical-rate arrives too hard or
    // too fast to ever be classified supported, so the two Task 10
    // assertions above were never once evaluating, and a regression to
    // `restOnSurface`'s own clamp would have passed this test silently
    // (confirmed: re-running the Step 2 `onGround` mutation against the
    // ORIGINAL nearGround-only cohort left this test green, 4/4). A second,
    // deliberately gentle `LANDING_SPAWN_FRACTION` cohort was added
    // (`tools/soak/run.ts`) specifically to produce genuine supported
    // contacts. With it: seed 1337 gives 401,828 steps / 133 hits / **61,433
    // supportedContactTicks**, seed 4242 gives 404,023 / 137 / 41,287, seed 7
    // gives 414,909 / 145 / 22,362, all zero failures. Re-running the same
    // Step 2 mutation against this version fails immediately (48 failures at
    // seed 1337, first at iteration 167 tick 768).
    expect(result.steps).toBeGreaterThan(300000)
    // The floor that matters most: without it, a soak that never put an
    // airplane within reach of the ground would still report zero failures
    // forever, indistinguishable from "the invariant held". 100 is comfortably
    // below every seed measured above (128-148) while being nowhere near 0.
    expect(result.terrainHits).toBeGreaterThan(100)
    // Fix round 1's floor, guarding the coverage `terrainHits` above cannot:
    // that field only proves flights REACHED the ground, not that the
    // Task 10 assertions (sink-through, no-energy-gain-at-idle-throttle)
    // ever evaluated once they got there -- which, before the landing
    // cohort existed, they did not, at any of the three seeds measured
    // above.
    //
    // RE-MEASURED 2026-09-16 (Task 16): `supportedContact` now also requires
    // LAND (Mark drove off the end of the Tacloban runway onto the ocean and
    // kept rolling on top of it -- `src/sim/ground.ts`'s `surfaceAt` gate).
    // Both gear-down cohorts spawn at a uniformly random (x, z) across the
    // whole 200 km field, and a large share of that field is open ocean
    // (Leyte Gulf, the Camotes Sea, the Pacific), so a large share of what
    // used to count as "genuinely resting" no longer can -- correctly:
    // wheels resting on water were never a real contact. Re-measured at the
    // same three seeds: seed 1337 gives 393,334 steps / 144 hits / **4,716
    // supportedContactTicks**, seed 4242 gives 386,096 / 138 / 7,194, seed 7
    // gives 427,457 / 132 / 300 -- all zero failures. The floor moves down
    // with the measurement, per this file's own rule (re-measure and move
    // the floor, never the assertion) -- widening the tolerance to keep the
    // OLD number would only be hiding that the input distribution changed,
    // not evidence the new one is wrong. 2,000 is comfortably below the
    // worst of the three re-measured seeds actually asserted here (seed
    // 1337's 4,716) while staying nowhere near the 0 this field shipped with
    // for one full day. (Seed 7's 300 is NOT the floor for this reason: only
    // seed 1337 is the committed configuration below, and 300 would leave
    // this floor uncomfortably close to a seed's ordinary run-to-run
    // variance -- if a future content or terrain change makes seed 1337 look
    // more like seed 7's unlucky draw, that is worth a human re-look, not a
    // silently-passing floor at 300.)
    // RE-MEASURED 2026-09-17 (Plan 11b). The lateral tire force keeps a rolling
    // airplane tracking straight instead of skidding off, so flights now stay
    // in supported contact far longer -- seed 1337 gives 393,984 steps / 138
    // hits / **3,109 supportedContactTicks**, seed 4242 gives 401,529 / 135 /
    // 7,194, and seed 7 goes from 300 ticks to **16,438**, a 55x increase.
    //
    // **Seed 7 also reports 1 failure at that coverage, and it is recorded
    // rather than hidden**: iteration 62, tick 1777, wheels 0.253 m below a
    // 0.25 m tolerance. Bisected the same day by disabling the lateral grip
    // alone: seed 7 then returns to exactly 11a's 300 ticks / 0 failures. So
    // the grip added no vertical mechanism -- it made a pre-existing marginal
    // case in `restOnSurface` REACHABLE, at 1 tick in 16,438. Seed 1337, the
    // committed configuration asserted here, is clean. Plan 11b's handoff
    // carries the repro.
    //
    // The floor stays at 2,000: seed 1337's 3,109 is above it, and per this
    // file's rule the floor moves with the measurement rather than the
    // assertion moving to fit.
    expect(result.supportedContactTicks).toBeGreaterThan(2000)
  })
})

describe('entity soak (Plan 12)', () => {
  it('ships stay at sea and in the water, ticks agree, the chocked airplane stays put, and two runs agree', () => {
    const header = loadTerrainHeader()
    const heights = loadTerrainLevel(GROUND_TRUTH_LEVEL, header)
    const terrain = createTerrainField(header, GROUND_TRUTH_LEVEL, heights)
    const result = runEntitySoak(loadScenarioBundle('free-flight'), 12, 1944, terrain)
    expect(result.failures, result.failures.join('\\n')).toEqual([])
    // Twelve one-minute simulations plus the first one repeated to prove
    // seed determinism. A full run executes 13 * 3,600 steps.
    expect(result.steps).toBeGreaterThan(12 * 3600 - 1)
  })
})
