// Every aircraft graded from its own `reference` (W1, 2026-09-28). Onboarding a new aircraft is a
// CARDS entry plus its sourced reference (docs/aircraft.md). Tolerances only ever tighten; each is
// the measurement it was set from, dated, and a red card is reported, never tuned (R36).
import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { measureTopSpeed, measureClimbRate, measureStallSpeed, measureRollRate, measureTakeoffRun } from '../../../tools/testcards/measure.js'

type Card = {
  readonly topSpeed: number
  readonly topSpeedTable?: number
  readonly climb: number
  readonly climbTable?: number
  readonly stall: number
  readonly flapStall: number
  readonly roll: number
  readonly takeoff?: { readonly tol: number; readonly liftoffMps: number; readonly flapFraction: number }
}

const MPH = 0.44704

export const CARDS: Readonly<Record<string, Card>> = {
  // was: f6f.test.ts. TOL 0.15 is the file's original default -- "Wide to
  // start. Tighten as the model matures; never widen to make a red test
  // pass, because that converts the reference figure into decoration."
  'f6f-hellcat': {
    topSpeed: 0.15,
    climb: 0.25,
    stall: 0.2,
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
     *
     * The two stalls' ratio was also graded directly (now the generic
     * "stalls slower with flaps by about the CLmax ratio" card below): 1.3451
     * is (43.81 / 37.7749)^2, the two sourced stall speeds -- the derived
     * CLmax ratio the flap model should reproduce. Measured 2026-09-17:
     * 1.3566, 0.85% off. The DIRECTION was the point: if `flap.clIncrement`
     * were wired to `aero.clMax` -- the obvious mistake, since that field
     * exists and looks load-bearing but has been inert since Plan 1's finding
     * C1 -- both stalls would come out identical and this card would fail
     * without saying why.
     */
    flapStall: 0.2,
    roll: 0.15,
    takeoff: {
      /**
       * Trial's stated take-off speed for this run (same summary table as
       * reference.takeoffDistanceM): 86.5 mph.
       *
       * Controller ruling: added scope. The prior implementer's decision to ship
       * the climb card at +16.77% rather than lowering engine.staticThrustN rested
       * on a ground-roll simulation that lived in a deleted scratch test; this
       * makes that argument reproducible from the checkout.
       *
       * NOT like-for-like: `reference.takeoffDistanceM` is a full-flaps trial
       * figure and this model has no flaps (which pushes a simulated roll
       * SHORTER than the trial's -- no flap drag to slow the acceleration) and
       * no ground effect (which pushes it LONGER -- ground effect cuts induced
       * drag and adds lift near the surface, both of which shorten a REAL roll,
       * so a model missing it does not get that shortening either). The two
       * push in opposite directions; which dominates is not derived here, only
       * measured below.
       *
       * Measured 2026-09-12 at the shipped propEfficiency 0.75 / staticThrustN
       * 20,000 N / testMassKg 5633.62, with the ground faked (position.y and
       * velocity.y pinned to zero every step, no rolling friction): the model
       * read 214.632 m against the trial's 230.124 m, a -6.73% under-estimate.
       *
       * RE-MEASURED 2026-09-16 (Task 9): the fake ground pin is gone -- the card
       * now spawns gear-down over a real, synthetic flat field at sea level (see
       * `measureTakeoffRun`'s own doc comment for why synthetic and not Tacloban)
       * and rolling friction (this plan) now applies. The model reads 228.733 m
       * against the same 230.124 m trial figure, a -0.605% under-estimate --
       * MUCH closer than before, and moved in the expected direction: rolling
       * friction is a new deceleration source, so adding it lengthens the roll,
       * and it now accounts for nearly all of the previous gap. Flaps and ground
       * effect still don't apply (both 11b).
       *
       * WHAT THIS TOLERANCE ACTUALLY LOCKS. Fix-round-1 review (2026-09-16): the
       * -0.605% agreement is NOT evidence of flight-model fidelity -- it is a
       * CHARACTERISATION LOCK on three uncorroborated, round numbers landing
       * close together by construction: `engine.staticThrustN` (20,000 N),
       * `gear.rollingResistanceCoeff` (0.02) and `reference.testMassKg`
       * (5633.62), graded against a full-flaps trial figure for an airplane that
       * still has no flaps. Measured sensitivity: a rolling-resistance
       * coefficient of 0.03 instead of 0.02 alone moves this to +2.60% (red at
       * the tolerance below); a 5% cut to `staticThrustN` moves it to +5.10%
       * (also red); 11b's flaps are projected to move it by roughly +4% on their
       * own (also red). `propEfficiency` is entirely inert here -- the roll runs
       * the whole way at the static-thrust cap, so this card cannot and does not
       * lock that constant. Retuning ANY of `engine.staticThrustN`,
       * `gear.rollingResistanceCoeff` or `reference.testMassKg` MUST re-measure
       * this number in the same commit; 11b adding flaps is EXPECTED to move it,
       * not a regression to chase back to today's figure.
       *
       * 2% left better than 3x headroom above the measured -0.605%, without
       * absorbing an error the model did not actually have -- tightened from the
       * prior 10%, which was sized for the old -6.73% fake-ground figure. Per this
       * file's own rule, tighten (or re-measure) as the model changes; never widen
       * to whatever passes.
       *
       * RE-MEASURED 2026-09-17 (Plan 11b, Tasks 3/5/6), which is the re-measure
       * the paragraph above pre-authorised: "11b adding flaps is EXPECTED to move
       * it, not a regression to chase back to today's figure." **This card is now
       * LIKE-FOR-LIKE for the first time** -- the trial run was full flaps, and
       * the model now has flaps, ground effect and rolling friction, so it is
       * flown at `flapFraction` 1 below. Measured:
       *
       * | Flaps | Roll | vs the 230.124 m trial |
       * | --- | --- | --- |
       * | 0 (as graded until today) | 228.738 m | -0.602% |
       * | 0.5 | 231.666 m | +0.670% |
       * | 1 (as the trial flew) | 236.085 m | +2.590% |
       *
       * **`flap.dragAreaM2` was deliberately NOT tuned to close that gap.** It is
       * 0.6 sq m on independent grounds -- twice the extended gear's drag area,
       * and 92% of the airframe's own zero-lift drag area of 0.655 sq m, full
       * flaps roughly doubling parasitic drag. Fitting one free parameter to one
       * trial number would make this card tautological: it would then be
       * guaranteed to agree and could no longer detect anything. 11a avoided
       * exactly that by picking `gear.rollingResistanceCoeff` from generic
       * tire-on-pavement figures and REPORTING the agreement rather than
       * engineering it.
       *
       * WHY THE RESIDUAL RUNS THIS WAY, which is the part worth carrying forward:
       * the model has ground effect's induced-drag reduction but deliberately NOT
       * its lift increase (`groundEffectFactor`'s own comment says so). Extra lift
       * near the surface would take weight off the wheels and so reduce rolling
       * friction, shortening a real roll. A model missing it over-charges rolling
       * friction for the whole roll and therefore rolls LONG -- which is the sign
       * observed. So +2.590% is consistent with a known, named omission rather
       * than being unexplained error.
       *
       * 4% is the re-measured tolerance: 1.5x headroom over the measured 2.590%.
       * Tighter than the 10% this replaced two days ago and looser than the 2% it
       * replaces today, for a model that now measures the right configuration.
       *
       * RE-MEASURED 2026-09-28 (T1 ground handling, Task 4), not re-tuned
       * (R36): the airplane now starts at its derived 9.45 deg rest attitude
       * and the tail rises with airflow rather than at a speed gate, so part of
       * the roll is flown tail-down at a higher angle of attack. Full flaps:
       * 236.058 m (+2.579%, the T1 baseline 87f2c0d) -> 239.148 m (+3.921%);
       * clean, for reference: 228.737 m (-0.603%) -> 230.264 m (+0.061%). The
       * -0.605% quoted above and in f6f-hellcat.json is the CLEAN figure from
       * before 11b, not what this card grades. +3.921% passes 4% with 0.08
       * points to spare: the next change that lengthens the roll turns this
       * card red, and the answer then is to report the gap, not to widen 4%.
       * Non-null: optional since Z2 (the A6M has no sourced figure); schema.test.ts pins that the F6F still carries 230.124 m.
       *
       * The companion "rolls longer with full flaps than clean" card is cheap,
       * and closes the specific hole the distance card cannot see: if
       * `flapDragN` were never wired into `step`'s drag sum -- the kind of thing
       * a merge drops silently, which is why `step`'s parasitic-terms comment
       * exists -- that card would simply read the clean figure and pass.
       */
      tol: 0.04,
      liftoffMps: 86.5 * MPH,
      flapFraction: 1,
    },
  },
  // was: a6m.test.ts. Every tolerance below was set from the measurement in
  // its own comment; never widen to make a red card pass.
  'a6m2-zero': {
    // Measured 2026-09-25 (plan probe): 142.10 m/s against 145.74, -2.50%.
    // 5% is 2x the measurement, tighter than the spec's 15% starting point.
    topSpeed: 0.05,
    // Measured 2026-09-25: SL +3.51%, 5k +2.17%, 10k +0.94%, 20k -2.13%,
    // 25k -2.35%, 30k -3.70%. Spec §4.3 item 2's 5% each; worst is 1.35x under it.
    topSpeedTable: 0.05,
    // Measured 2026-09-25: 16.166 m/s against 13.97, +15.72%. The F6F reads
    // +16.77% on the same harness: the model's known climb bias, shared.
    // 25% is the F6F's tolerance (spec §4.3 item 3).
    climb: 0.25,
    // Measured 2026-09-25: 15k +18.17%, 20k +22.41%, 30k +17.57%. 30% is the
    // spec's figure. The spec's §4.2 baseline (cd0 0.0195, eta 0.75, curve flat
    // to 4,877 m) read +44.2 / +55.7 / +63.1% here: the power curve is shared
    // by level flight (with ram) and the climb (without), and is fitted to both.
    climbTable: 0.3,
    // Measured 2026-09-25: 35.765 clean (+2.57%), 31.585 flaps (+2.38%).
    // 20% each, the F6F's (spec §4.3 item 5).
    stall: 0.2,
    // (78/69)^2 = 1.2779 is the CLmax ratio the two sourced stalls imply.
    // Measured 2026-09-25: 1.2822.
    flapStall: 0.2,
    // An unsourced estimate graded against itself, as the F6F's is. Measured
    // 2026-09-25: 79.996 deg/s at 95 m/s.
    roll: 0.15,
  },
  // Set 2026-09-28 from the W1 fit (cd0 0.016, eta 0.60, sourced normal-rating curve unscaled):
  // top +0.50..+1.71% over [DS]'s seven points; climb SL +16.84% (the F6F's own +16.77% bias),
  // 16,300 ft +5.05%; stall +2.11% clean, +1.86% flaps; roll 67.998 vs 68. Take-off -14.32% at full
  // flaps and [5262]'s 73 mph lift-off: [4058] states neither its flap setting nor its lift-off
  // speed, so 20% is a reported gap (R36), not a fit.
  // Re-measured 2026-09-28 (T1, Task 4; rest attitude and airflow tail-lift, nothing re-tuned):
  // take-off 179.151 m (-14.32%) -> 182.142 m (-12.89%) at full flaps; clean 174.136 -> 176.064 m.
  'f4f-wildcat': { topSpeed: 0.05, topSpeedTable: 0.05, climb: 0.25, climbTable: 0.3, stall: 0.2, flapStall: 0.2, roll: 0.15, takeoff: { tol: 0.2, liftoffMps: 73 * MPH, flapFraction: 1 } },
  // Set 2026-09-29 from the F4U-1D onboarding fit (cd0 0.0165, eta 0.75, the DS's normal-rating curve unscaled,
  // no fitted point). Reference: Vought Detail Specification Report 6756 (15 Feb 1945), Fighter loading, a GUARANTEE,
  // not a flown trial. Measured: top speed -1.56% at 24,400 ft; table +1.15% .. -2.18%; climb SL -3.18%; stall +5.05%
  // clean, +4.78% flaps (clMax stays the shared 1.4 ESTIMATE; the flown FG-1A stalls imply about 1.55, so the model
  // stalls fast and the error is reported, not tuned, R36); roll 84.996 vs 85. Take-off +6.89% (212.41 m vs the DS's 652 ft
  // = 198.73 m) at full flaps and the FG-1A's 83 mph lift-off, because the DS states neither; the flown FG-1A rolled 720 ft
  // (219.5 m), which the model is 3.2% under. Tolerances are about 1.4x to 2x each measurement.
  'f4u-corsair': { topSpeed: 0.03, topSpeedTable: 0.03, climb: 0.05, stall: 0.08, flapStall: 0.08, roll: 0.02, takeoff: { tol: 0.1, liftoffMps: 83 * MPH, flapFraction: 1 } },
  // B-17G onboarding, measured 2026-09-29 at testMassKg 26,149.6 kg (57,650 lb) against the flown TSCEP5E-1909 table: top speed
  // 117.95 vs 123.83 m/s (-4.75%) at 25,000 ft; table +1.73, -0.85, -2.91, -4.75%; climb -6.19% at sea level, table -2.57 and
  // +6.62% at 10,000 and 15,000 ft (25,000 ft reads +55.6% and is not in the reference: the flown climb had cowl flaps open, the
  // model has none, so no single cd0 fits both); stalls -7.58% clean and -7.66% flaps against the weight-scaled B-17F trial (clMax
  // stays 1.4, R36); roll 20.0 vs its own estimate. Take-off distance is not graded (the reference is a W^2 scaling of one flown roll);
  // the card runs the direction check only. Tolerances are about 1.4x to 1.5x each measurement, all inside the F6F's.
  'b-17-flying-fortress': { topSpeed: 0.07, topSpeedTable: 0.07, climb: 0.09, climbTable: 0.1, stall: 0.11, flapStall: 0.11, roll: 0.02, takeoff: { tol: 0.1, liftoffMps: 108 * MPH, flapFraction: 1 / 3 } },
  // G4M1 Model 11 onboarding, measured 2026-09-29 at testMassKg 9,500 kg against SECONDARY figures (no G4M1 flight test exists;
  // docs/handoff/2026-09-29-g4m-onboard.md): top speed 117.37 vs 118.9 m/s (-1.28%) at 13,780 ft, the only speed point; climb
  // 9.147 vs 9.17 m/s (-0.25%) at sea level (the other published figure, 6.4 m/s, would read +43%); stalls 37.22 clean (-0.23%)
  // and 33.19 flaps (-0.33%) against an ESTIMATE from clMax 1.4 and a weakly sourced infobox figure, so the stall cards grade the
  // model against a number derived from itself (the infobox figure read as a clean stall would be 11.7% under the model's). cd0
  // and propEfficiency are fitted to two figures with two unknowns, which proves nothing about either. Roll 35.0 vs its own
  // estimate. No take-off distance is sourced: the card runs the flap-direction check only, at an ESTIMATED 45 m/s lift-off.
  // Tolerances are about 1.5x to 2x each measurement.
  'g4m-betty': { topSpeed: 0.02, climb: 0.01, stall: 0.01, flapStall: 0.01, roll: 0.02, takeoff: { tol: 0.1, liftoffMps: 45, flapFraction: 1 } },
  // B-29 onboarding, measured 2026-09-29 at testMassKg 49,895 kg (110,000 lb) against the PFOI's PRINTED ESTIMATES (AN 01-20EJ-1,
  // 1 Jul 1944; no flown B-29 test report was found, so this grades the model against a manual's charts, not an airplane): top speed
  // 144.19 vs 144.4 m/s (-0.14%) at 20,000 ft; table +0.27, -0.59, -1.76, +0.17, +1.68% (sea level to 25,000 ft); climb +1.81% at sea
  // level, table +1.78, +1.94, +2.78, -3.72% (1,524 to 7,620 m); stalls +3.06% clean and +3.05% flaps (clMax stays the shared 1.4
  // ESTIMATE, the manual's stall implies about 1.49); roll 15.0 vs its own ESTIMATE. cd0 0.018 and propEfficiency 0.65 are FITTED to
  // ten figures with two unknowns, and the 7,620 m power fraction 0.87 is a compromise between a speed chart and a climb chart that
  // disagree there. Take-off: the model rolls 1,073 m (+29.14%) against the chart's 830.6 m at an ESTIMATED 54.8 m/s lift-off (the
  // midpoint of the manual's 115 to 130 mph) and no flaps: a REPORTED gap, not a fit (a 115 mph lift-off rolls 911 m, +9.6%), so
  // its 32% band is wider than any other card's and only ever tightens. Other tolerances are about 1.4x to 2x each measurement.
  'b-29-superfortress': { topSpeed: 0.005, topSpeedTable: 0.025, climb: 0.03, climbTable: 0.055, stall: 0.045, flapStall: 0.045, roll: 0.01, takeoff: { tol: 0.32, liftoffMps: 54.8, flapFraction: 0 } },
  // P-38L-1 onboarding, measured 2026-09-29 at testMassKg 7,528 kg (16,597 lb, the P-38J trial's weight) against a MIXED reference
  // (J altitude tables scaled by 0.989 to the L's two flown speeds, the L's 26,000 ft top speed, the manual's stall table; see the spec
  // source): top speed 190.7 vs 186.0 m/s (+2.53%) at 26,000 ft; speed table -2.80, -2.72, -2.09, -0.89, +0.49% (0 to 20,000 ft); climb
  // -8.01% at sea level, table -8.27, -6.96, -2.13, +4.70% (5,000 to 20,000 ft). Above 20,000 ft the model climbs too well (+15.3% at
  // 25,000 ft, +29.5% at 30,000, +74.5% at 35,000) and cruises too fast (+6.3% at 35,000 ft): a REPORTED finding, so those points are
  // not in the reference. Stalls +20.13% clean and +19.14% flaps against the manual's interpolated 44.2 and 32.6 m/s: the shared clMax
  // 1.4 stays (docs/aircraft.md: report it, do not fit it); the real airplane implies about 2.0. Roll 65.0 vs its own ESTIMATE. No take-off
  // distance is sourced: the card runs the flap-direction check only, at an ESTIMATED 50 m/s lift-off. cd0 0.026 and propEfficiency 0.725
  // are FITTED to twelve figures with two unknowns, so a green card here is not validation. Tolerances are about 1.4x to 2x each measurement.
  'p-38-lightning': { topSpeed: 0.035, topSpeedTable: 0.04, climb: 0.115, climbTable: 0.12, stall: 0.28, flapStall: 0.27, roll: 0.01, takeoff: { tol: 0.1, liftoffMps: 50, flapFraction: 1 } },
  // Ki-43-II onboarding, measured 2026-09-30 at testMassKg 2,494.76 kg (5,500 lb) against ONE intelligence sheet (TAIC 152A-2, Dec 1944;
  // no flight-test report exists and other sources disagree, see the spec source): top speed 156.34 vs 155.13 m/s (+0.78%) at 20,000 ft;
  // the one table point (sea level) +0.64%; climb +16.92% at sea level and +20.17% at 17,500 ft, the model's known climb bias (F6F +16.8%,
  // Zero +15.7% to +22.4%), reported and not tuned. Graph-read speed checks, not in the reference: -0.27% (9,000 ft), +4.77% (14,500 ft),
  // +2.89% (30,000 ft). The stalls are ESTIMATES scaled from the Zero's (35.5 and 31.4 m/s), so their +2.56% and +2.36% grade the model
  // against a number derived from its own lift curve; flap.clIncrement is DERIVED from those same two estimates, which is circular. Roll
  // 80.0 vs its own ESTIMATE. cd0 0.0175 and propEfficiency 0.68 are FITTED to two speeds with two unknowns, so a green card is not
  // validation. No take-off distance is sourced (TAIC's two sheets print 450 and 896 ft): the card runs the flap-direction check only,
  // at an ESTIMATED 42 m/s lift-off (the roll reads 217 m clean, 713 ft, between the two sheets). Tolerances are about 1.4x to 2x each measurement.
  'ki-43-oscar': { topSpeed: 0.015, topSpeedTable: 0.012, climb: 0.24, climbTable: 0.29, stall: 0.04, flapStall: 0.04, roll: 0.01, takeoff: { tol: 0.1, liftoffMps: 42, flapFraction: 1 } },
  // D3A2 Val onboarding, measured 2026-09-30 at testMassKg 3,551.6 kg (7,830 lb) against ONE intelligence sheet (TAIC 401A-2, Dec 1944;
  // no flight-test report exists, and Wikipedia's 267 mph at 6,200 m is 5% slower): top speed 125.95 vs 125.6 m/s (+0.28%) at 20,300 ft; table
  // -0.09% (sea level) and +0.26% (9,850 ft); climb +12.96% at sea level and +14.80% at 9,850 ft, below the fleet's known +16% to +22% bias and
  // not tuned. The stalls are ESTIMATES scaled from the Zero's (33.2 and 29.4 m/s), so their +2.42% and +2.24% grade the model against a
  // number derived from its own lift curve; flap.clIncrement is DERIVED from those two estimates, which is circular. Roll 60.0 vs its own
  // ESTIMATE. cd0 0.022 and propEfficiency 0.68 are FITTED to three speeds with two unknowns, so a green card is not validation. Take-off: the
  // model rolls 244.8 m (+55.6%) against TAIC's 157.3 m (516 ft, conditions unstated) at an ESTIMATED 40 m/s lift-off and no flaps: a REPORTED
  // gap, not a fit (the sea-level power fraction is the 1,075 hp military rating, 0.84 of the 1,280 hp take-off power, so the model takes off
  // on less power than the sheet's figure likely assumed), so its band is wide and only ever tightens. Other tolerances are about 1.4x to 2x each measurement.
  'd3a-val': { topSpeed: 0.006, topSpeedTable: 0.006, climb: 0.19, climbTable: 0.22, stall: 0.04, flapStall: 0.04, roll: 0.01, takeoff: { tol: 0.75, liftoffMps: 40, flapFraction: 0 } },
}

const within = (actual: number, expected: number, tol: number) => {
  const err = Math.abs(actual - expected) / expected
  return { pass: err <= tol, err, actual, expected }
}
const pct = (r: { err: number }) => `${(r.err * 100).toFixed(2)}% off`

const ids = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')).sort()

it('every aircraft has a CARDS entry (onboarding: docs/aircraft.md)', () => {
  expect(ids.filter((id) => CARDS[id] === undefined), 'aircraft with no graded cards').toEqual([])
})

describe.each(ids.filter((id) => CARDS[id] !== undefined))('%s graded against its reference', (id) => {
  const spec = loadAircraftSpec(id)
  const ref = spec.reference
  const card = CARDS[id]!
  const climbSeaLevel = measureClimbRate(spec, 0)

  it('reaches its top speed at its critical altitude', () => {
    const r = within(measureTopSpeed(spec, ref.topSpeedAltitudeM), ref.topSpeedMps, card.topSpeed)
    expect(r.pass, `top speed ${r.actual.toFixed(2)} m/s vs ${r.expected} (${pct(r)})`).toBe(true)
  })

  it.each(ref.topSpeedByAltitudeM ?? [])('reaches its trial speed at %d m', (altitudeM, speedMps) => {
    const r = within(measureTopSpeed(spec, altitudeM), speedMps, card.topSpeedTable!)
    expect(r.pass, `top speed at ${altitudeM} m ${r.actual.toFixed(2)} vs ${speedMps} (${pct(r)})`).toBe(true)
  })

  it('climbs at its sea-level rate', () => {
    const r = within(climbSeaLevel, ref.climbRateMps, card.climb)
    expect(r.pass, `climb ${r.actual.toFixed(3)} m/s vs ${r.expected} (${pct(r)})`).toBe(true)
  })

  it.each(ref.climbRateByAltitudeM ?? [])('climbs at its trial rate at %d m', (altitudeM, rateMps) => {
    const r = within(measureClimbRate(spec, altitudeM), rateMps, card.climbTable!)
    expect(r.pass, `climb at ${altitudeM} m ${r.actual.toFixed(3)} vs ${rateMps} (${pct(r)})`).toBe(true)
  })

  it('climbs in the direction its table does at each higher altitude', () => {
    const rates = [climbSeaLevel, ...(ref.climbRateByAltitudeM ?? []).map(([a]) => measureClimbRate(spec, a))]
    const sourced = [ref.climbRateMps, ...(ref.climbRateByAltitudeM ?? []).map(([, r]) => r)]
    // Normally the table falls with altitude. The Val's sourced table RISES from sea level to 9,850 ft (2,160 then 2,330 ft/min: the
    // supercharger's second gear), so the model has to follow the sourced direction, whichever way it runs.
    for (let i = 1; i < rates.length; i++) {
      if (sourced[i]! < sourced[i - 1]!) expect(rates[i]!).toBeLessThan(rates[i - 1]!)
      else expect(rates[i]!).toBeGreaterThan(rates[i - 1]!)
    }
  })

  it('stalls near its clean, power-off stall speed', () => {
    const r = within(measureStallSpeed(spec, 0, 0), ref.stallSpeedMps, card.stall)
    expect(r.pass, `stall ${r.actual.toFixed(3)} vs ${r.expected} (${pct(r)})`).toBe(true)
  })

  it('stalls near its landing-configuration stall speed with the flaps down', () => {
    const r = within(measureStallSpeed(spec, 0, 1), ref.stallSpeedFlapMps, card.flapStall)
    expect(r.pass, `flap stall ${r.actual.toFixed(3)} vs ${r.expected} (${pct(r)})`).toBe(true)
  })

  it('stalls slower with flaps by about the CLmax ratio its two stalls imply', () => {
    const clean = measureStallSpeed(spec, 0, 0)
    const flapped = measureStallSpeed(spec, 0, 1)
    expect(flapped).toBeLessThan(clean)
    expect((clean / flapped) ** 2).toBeCloseTo((ref.stallSpeedMps / ref.stallSpeedFlapMps) ** 2, 1)
  })

  // Ruling R4: measured at altitude 0, not the brief's 1000 m. Rate authority
  // scales dynamic pressure against SEA-LEVEL dynamic pressure at the
  // reference speed, so only altitude 0 gives authority exactly 1.0. Measuring
  // at 1000 m and comparing the result to a sea-level reference figure grades
  // the aircraft on the atmosphere instead of on its ailerons.
  it('rolls at its reference rate at the reference speed', () => {
    const r = within(measureRollRate(spec, 0, spec.rates.rateRefSpeedMps), ref.rollRateDegPerSec, card.roll)
    expect(r.pass, `roll ${r.actual.toFixed(3)} deg/s vs ${r.expected}`).toBe(true)
  })

  it.runIf(card.takeoff !== undefined && ref.takeoffDistanceM !== undefined)('rolls to its take-off distance in the trial configuration', () => {
    const t = card.takeoff!
    const r = within(measureTakeoffRun(spec, t.liftoffMps, t.flapFraction), ref.takeoffDistanceM!, t.tol)
    expect(r.pass, `take-off roll ${r.actual.toFixed(1)} m vs ${r.expected} (${pct(r)})`).toBe(true)
  })

  it.runIf(card.takeoff !== undefined)('rolls longer with full flaps than clean, the direction flap drag must push', () => {
    const t = card.takeoff!
    expect(measureTakeoffRun(spec, t.liftoffMps, 1)).toBeGreaterThan(measureTakeoffRun(spec, t.liftoffMps, 0))
  })
})
