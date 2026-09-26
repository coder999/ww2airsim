import { describe, it, expect } from 'vitest'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import {
  measureTopSpeed,
  measureClimbRate,
  measureStallSpeed,
  measureRollRate,
  measureTakeoffRun,
} from '../../../tools/testcards/measure.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const ref = f6f.reference

// Finding 9: the "climbs more slowly at altitude" card below needs the same
// sea-level climb rate the card above it already measured (a ~152,000-step
// sweep). Hoisted so it is computed once, not twice.
const climbRateSeaLevel = measureClimbRate(f6f, 0)

/** Trial's stated take-off speed for this run (same summary table as
 *  reference.takeoffDistanceM): 86.5 mph. */
const TAKEOFF_SPEED_MPS = 86.5 * 0.44704

/** Wide to start. Tighten as the model matures; never widen to make a red
 *  test pass, because that converts the reference figure into decoration. */
const TOL = 0.15

const within = (actual: number, expected: number, tol = TOL) => {
  const err = Math.abs(actual - expected) / expected
  return { pass: err <= tol, err, actual, expected }
}

describe('F6F-5 flight test card', () => {
  it('reaches its documented top speed at its critical altitude', () => {
    const r = within(measureTopSpeed(f6f, ref.topSpeedAltitudeM), ref.topSpeedMps)
    expect(r.pass, `top speed ${r.actual.toFixed(1)} m/s vs reference ${r.expected} (${(r.err * 100).toFixed(1)}% off)`).toBe(true)
  })

  it('climbs at its documented sea-level rate', () => {
    const r = within(climbRateSeaLevel, ref.climbRateMps, 0.25)
    expect(r.pass, `climb ${r.actual.toFixed(1)} m/s vs reference ${r.expected} (${(r.err * 100).toFixed(1)}% off)`).toBe(true)
  })

  it('stalls near its documented stall speed', () => {
    const r = within(measureStallSpeed(f6f, 0), ref.stallSpeedMps, 0.2)
    expect(r.pass, `stall ${r.actual.toFixed(1)} m/s vs reference ${r.expected} (${(r.err * 100).toFixed(1)}% off)`).toBe(true)
  })

  /**
   * Plan 11b's acceptance test for the flap model, and a SOURCED figure rather
   * than a self-consistency check: 84.5 mph is the landing-condition power-off
   * stall from the same Patuxent table that gives the clean 98.0 mph one
   * above. `f6f-hellcat.json` carried it in prose for two plans, flagged as
   * "unreachable for a model with no high-lift devices".
   *
   * Tolerance matches the clean card's 20% deliberately -- it is the same
   * measurement through the same `measureStallSpeed` harness, so it carries the
   * same noise, and inventing a tighter one for the new card would be claiming
   * a precision the old one does not have.
   *
   * Measured 2026-09-17, and the comparison between the two cards is the real
   * evidence that the derived increment is right:
   *
   * | Card | Measured | Trial | Error |
   * | --- | --- | --- | --- |
   * | clean stall | 45.38 m/s | 43.81 | +3.6% |
   * | full-flap stall | 38.96 m/s | 37.775 | +3.1% |
   *
   * The flap figure is no worse than the clean one and is biased the same way,
   * so the flap model is inheriting this model's existing stall bias rather
   * than adding error of its own. A flap model that was wrong would show up as
   * a DIVERGENCE between these two rows, which is why both are recorded here
   * rather than only the new one.
   */
  it('stalls near its documented LANDING-configuration stall speed with the flaps down', () => {
    const r = within(measureStallSpeed(f6f, 0, 1), ref.stallSpeedFlapMps, 0.2)
    expect(
      r.pass,
      `flap stall ${r.actual.toFixed(2)} m/s vs reference ${r.expected} (${(r.err * 100).toFixed(2)}% off)`,
    ).toBe(true)
  })

  it('stalls slower with the flaps down than clean, by about the derived ratio', () => {
    // The DIRECTION is the point. If `flap.clIncrement` were wired to
    // `aero.clMax` -- the obvious mistake, since that field exists and looks
    // load-bearing but has been inert since Plan 1's finding C1 -- both numbers
    // would come out identical and the card above would fail without saying
    // why. 1.3451 is (43.81 / 37.7749)^2, the two sourced stall speeds.
    const clean = measureStallSpeed(f6f, 0, 0)
    const flapped = measureStallSpeed(f6f, 0, 1)
    console.log(
      `stall clean ${clean.toFixed(2)} m/s, full flap ${flapped.toFixed(2)} m/s, ` +
        `CLmax ratio ${((clean / flapped) ** 2).toFixed(4)} against the derived 1.3451`,
    )
    expect(flapped).toBeLessThan(clean)
    // Measured 2026-09-17: 1.3566, which is 0.85% off the derived target. The
    // tolerance is one decimal place because the target is derived from two
    // trial figures and reached through a 300 s simulated deceleration, not
    // because a tighter agreement was unavailable.
    expect((clean / flapped) ** 2).toBeCloseTo(1.3451, 1)
  })

  // Ruling R4: measured at altitude 0, not the brief's 1000 m. Rate authority
  // scales dynamic pressure against SEA-LEVEL dynamic pressure at the
  // reference speed, so only altitude 0 gives authority exactly 1.0. Measuring
  // at 1000 m and comparing the result to a sea-level reference figure grades
  // the aircraft on the atmosphere instead of on its ailerons.
  it('rolls at its documented rate at the reference speed', () => {
    const r = within(measureRollRate(f6f, 0, f6f.rates.rateRefSpeedMps), ref.rollRateDegPerSec)
    expect(r.pass, `roll ${r.actual.toFixed(1)} deg/s vs reference ${r.expected}`).toBe(true)
  })

  it('climbs more slowly at altitude than at sea level', () => {
    expect(measureClimbRate(f6f, 8000)).toBeLessThan(climbRateSeaLevel)
  })

  /**
   * The climb card is a LONGITUDINAL measurement: a wings-level, zero-sideslip
   * climb at a held attitude has no lateral force at all, so its reading must
   * not move by a single bit when `aero.cySlopePerRad` does. Bit-identical,
   * not merely close, because the side force is `q * S * Cy * beta` with beta
   * exactly 0 at every settled sweep point -- `0 * anything` is `0`.
   *
   * Added 2026-09-17 after the card was found reading 15.8 / 20.5 / 15.8 /
   * 22.1 / 22.9 m/s at coefficients 0.1 / 0.2 / 0.5 / 0.7 / 0.9. The cause
   * was NOT a path-dependent settling branch, as the handoff of that date
   * first diagnosed: every attitude from 0 to 30 degrees settles to the same
   * state at every coefficient. From 32 degrees up the airplane departs in
   * the transient, rolls through 180 degrees and is still tumbling when the
   * sample window opens; those samples are intermittently unstalled, so the
   * stalled-sample filter let them through, and their vertical speed is
   * whatever the tumble happened to be doing that second. `measureClimbRate`
   * now accepts only a STEADY sample -- see `STEADY_PITCH_ERR_RAD` in measure.ts.
   *
   * These are the four coefficients of the original table, and the whole
   * physical range published for this class (0.5-1.0/rad) sits inside them.
   */
  it('reads the same climb rate at any lateral-force coefficient', () => {
    for (const cySlopePerRad of [0.2, 0.5, 0.7, 0.9]) {
      const lateral = { ...f6f, aero: { ...f6f.aero, cySlopePerRad } }
      expect(measureClimbRate(lateral, 0), `cySlopePerRad ${cySlopePerRad}`).toBe(climbRateSeaLevel)
    }
  })

  // Controller ruling: added scope. The prior implementer's decision to ship
  // the climb card at +16.77% rather than lowering engine.staticThrustN rested
  // on a ground-roll simulation that lived in a deleted scratch test; this
  // makes that argument reproducible from the checkout.
  //
  // NOT like-for-like: `reference.takeoffDistanceM` is a full-flaps trial
  // figure and this model has no flaps (which pushes a simulated roll
  // SHORTER than the trial's -- no flap drag to slow the acceleration) and
  // no ground effect (which pushes it LONGER -- ground effect cuts induced
  // drag and adds lift near the surface, both of which shorten a REAL roll,
  // so a model missing it does not get that shortening either). The two
  // push in opposite directions; which dominates is not derived here, only
  // measured below.
  //
  // Measured 2026-09-12 at the shipped propEfficiency 0.75 / staticThrustN
  // 20,000 N / testMassKg 5633.62, with the ground faked (position.y and
  // velocity.y pinned to zero every step, no rolling friction): the model
  // read 214.632 m against the trial's 230.124 m, a -6.73% under-estimate.
  //
  // RE-MEASURED 2026-09-16 (Task 9): the fake ground pin is gone -- the card
  // now spawns gear-down over a real, synthetic flat field at sea level (see
  // `measureTakeoffRun`'s own doc comment for why synthetic and not Tacloban)
  // and rolling friction (this plan) now applies. The model reads 228.733 m
  // against the same 230.124 m trial figure, a -0.605% under-estimate --
  // MUCH closer than before, and moved in the expected direction: rolling
  // friction is a new deceleration source, so adding it lengthens the roll,
  // and it now accounts for nearly all of the previous gap. Flaps and ground
  // effect still don't apply (both 11b).
  //
  // WHAT THIS TOLERANCE ACTUALLY LOCKS. Fix-round-1 review (2026-09-16): the
  // -0.605% agreement is NOT evidence of flight-model fidelity -- it is a
  // CHARACTERISATION LOCK on three uncorroborated, round numbers landing
  // close together by construction: `engine.staticThrustN` (20,000 N),
  // `gear.rollingResistanceCoeff` (0.02) and `reference.testMassKg`
  // (5633.62), graded against a full-flaps trial figure for an airplane that
  // still has no flaps. Measured sensitivity: a rolling-resistance
  // coefficient of 0.03 instead of 0.02 alone moves this to +2.60% (red at
  // the tolerance below); a 5% cut to `staticThrustN` moves it to +5.10%
  // (also red); 11b's flaps are projected to move it by roughly +4% on their
  // own (also red). `propEfficiency` is entirely inert here -- the roll runs
  // the whole way at the static-thrust cap, so this card cannot and does not
  // lock that constant. Retuning ANY of `engine.staticThrustN`,
  // `gear.rollingResistanceCoeff` or `reference.testMassKg` MUST re-measure
  // this number in the same commit; 11b adding flaps is EXPECTED to move it,
  // not a regression to chase back to today's figure.
  //
  // 2% left better than 3x headroom above the measured -0.605%, without
  // absorbing an error the model did not actually have -- tightened from the
  // prior 10%, which was sized for the old -6.73% fake-ground figure. Per this
  // file's own rule, tighten (or re-measure) as the model changes; never widen
  // to whatever passes.
  //
  // RE-MEASURED 2026-09-17 (Plan 11b, Tasks 3/5/6), which is the re-measure
  // the paragraph above pre-authorised: "11b adding flaps is EXPECTED to move
  // it, not a regression to chase back to today's figure." **This card is now
  // LIKE-FOR-LIKE for the first time** -- the trial run was full flaps, and
  // the model now has flaps, ground effect and rolling friction, so it is
  // flown at `flapFraction` 1 below. Measured:
  //
  // | Flaps | Roll | vs the 230.124 m trial |
  // | --- | --- | --- |
  // | 0 (as graded until today) | 228.738 m | -0.602% |
  // | 0.5 | 231.666 m | +0.670% |
  // | 1 (as the trial flew) | 236.085 m | +2.590% |
  //
  // **`flap.dragAreaM2` was deliberately NOT tuned to close that gap.** It is
  // 0.6 sq m on independent grounds -- twice the extended gear's drag area,
  // and 92% of the airframe's own zero-lift drag area of 0.655 sq m, full
  // flaps roughly doubling parasitic drag. Fitting one free parameter to one
  // trial number would make this card tautological: it would then be
  // guaranteed to agree and could no longer detect anything. 11a avoided
  // exactly that by picking `gear.rollingResistanceCoeff` from generic
  // tire-on-pavement figures and REPORTING the agreement rather than
  // engineering it.
  //
  // WHY THE RESIDUAL RUNS THIS WAY, which is the part worth carrying forward:
  // the model has ground effect's induced-drag reduction but deliberately NOT
  // its lift increase (`groundEffectFactor`'s own comment says so). Extra lift
  // near the surface would take weight off the wheels and so reduce rolling
  // friction, shortening a real roll. A model missing it over-charges rolling
  // friction for the whole roll and therefore rolls LONG -- which is the sign
  // observed. So +2.590% is consistent with a known, named omission rather
  // than being unexplained error.
  //
  // 4% is the re-measured tolerance: 1.5x headroom over the measured 2.590%.
  // Tighter than the 10% this replaced two days ago and looser than the 2% it
  // replaces today, for a model that now measures the right configuration.
  // Non-null: optional since Z2 (the A6M has no sourced figure); schema.test.ts pins that the F6F still carries 230.124 m.
  it('rolls to its documented full-flaps take-off distance, flown as the trial was: full flaps', () => {
    const r = within(measureTakeoffRun(f6f, TAKEOFF_SPEED_MPS, 1), ref.takeoffDistanceM!, 0.04)
    expect(r.pass, `takeoff roll ${r.actual.toFixed(1)} m vs reference ${r.expected} (${(r.err * 100).toFixed(1)}% off)`).toBe(true)
  })

  it('rolls longer with full flaps than clean, which is the direction flap drag must push', () => {
    // Cheap, and it closes the specific hole that the card above cannot see:
    // if `flapDragN` were never wired into `step`'s drag sum -- the kind of
    // thing a merge drops silently, which is why `step`'s parasitic-terms
    // comment exists -- this card would simply read the clean figure and pass.
    expect(measureTakeoffRun(f6f, TAKEOFF_SPEED_MPS, 1)).toBeGreaterThan(
      measureTakeoffRun(f6f, TAKEOFF_SPEED_MPS, 0),
    )
  })
})
