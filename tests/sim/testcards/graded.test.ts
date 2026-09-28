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
  // placeholder until Task 2
  'f4f-wildcat': { topSpeed: 0.15, climb: 0.25, stall: 0.2, flapStall: 0.2, roll: 0.15, takeoff: { tol: 0.04, liftoffMps: 86.5 * MPH, flapFraction: 1 } },
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

  it('climbs more slowly at each higher altitude in its table', () => {
    const rates = [climbSeaLevel, ...(ref.climbRateByAltitudeM ?? []).map(([a]) => measureClimbRate(spec, a))]
    for (let i = 1; i < rates.length; i++) expect(rates[i]!).toBeLessThan(rates[i - 1]!)
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
