import { describe, it, expect } from 'vitest'
import {
  applyAssists,
  stallLimiter,
  type AssistSettings,
  type PitchAuthority,
} from '../../src/assists/index.js'
import { step, DT, angleOfAttack, isStalled, commandedBodyRates } from '../../src/sim/flight/model.js'
import { createState, type AircraftState, type Controls } from '../../src/sim/flight/state.js'
import { alphaCritRad } from '../../src/sim/aero.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qIdentity } from '../../src/sim/math/quat.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const spec = loadAircraftSpec('f6f-hellcat')
const CRIT = alphaCritRad(spec)
const deg = (r: number) => (r * 180) / Math.PI

/** ONLY the stall limiter toggles. Auto-rudder is real as of Task 2 and would
 *  otherwise add a yaw command to every run here; altitude hold is still a
 *  stub, but naming it explicitly keeps this file correct once it is not. */
const ONLY_LIMITER = (on: boolean): AssistSettings => ({
  stallLimiter: on,
  autoRudder: false,
})

type Flight = {
  readonly final: AircraftState
  readonly maxAlphaDeg: number
  readonly minAlphaDeg: number
  readonly stalledTicks: number
  /** Ticks whose command the limiter changed at all. */
  readonly limitedTicks: number
  /** Ticks entered with alpha between alphaCrit and the limiter's 90-degree
   *  stand-down, i.e. inside the band where it is supposed to be commanding
   *  recovery. */
  readonly recoveryBandTicks: number
  /** Of those, the ones where it was NOT commanding nose-down. */
  readonly recoveryBandFailures: number
  /** Alpha, degrees, at the first tick whose command was reduced. NaN if the
   *  limiter never intervened. */
  readonly firstLimitedAtDeg: number
}

/**
 * One held command, flown through `applyAssists` -> `step` once per fixed tick:
 * the same order `sim/loop.ts`'s `advance` uses in production, so these are
 * the real seam rather than a hand-rolled shortcut around it.
 *
 * Spawns wings-level with the velocity exactly along the nose (alpha 0) at
 * 2000 m, which is why the first tick is always unlimited -- these tests are
 * about what the limiter does as alpha builds, not about its spawn state.
 */
function fly(
  speed: number,
  seconds: number,
  on: boolean,
  raw: Controls,
): Flight {
  let s = createState({ position: v3(0, 2000, 0), velocity: v3(speed, 0, 0), attitude: qIdentity() })
  let maxAlphaDeg = -Infinity
  let minAlphaDeg = Infinity
  let stalledTicks = 0
  let limitedTicks = 0
  let recoveryBandTicks = 0
  let recoveryBandFailures = 0
  let firstLimitedAtDeg = Number.NaN
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    const entryAlpha = angleOfAttack(s)
    const controls = applyAssists(s, spec, raw, DT, ONLY_LIMITER(on))
    if (controls.pitch !== raw.pitch) {
      limitedTicks++
      if (Number.isNaN(firstLimitedAtDeg)) firstLimitedAtDeg = deg(entryAlpha)
    }
    if (entryAlpha > CRIT && entryAlpha < Math.PI / 2) {
      recoveryBandTicks++
      if (!(controls.pitch < 0)) recoveryBandFailures++
    }
    s = step(spec, s, controls, { dt: DT, tick: i + 1 })
    const alpha = deg(angleOfAttack(s))
    if (alpha > maxAlphaDeg) maxAlphaDeg = alpha
    if (alpha < minAlphaDeg) minAlphaDeg = alpha
    if (isStalled(spec, s)) stalledTicks++
  }
  return {
    final: s,
    maxAlphaDeg,
    minAlphaDeg,
    stalledTicks,
    limitedTicks,
    recoveryBandTicks,
    recoveryBandFailures,
    firstLimitedAtDeg,
  }
}

const FULL_BACK: Controls = { pitch: 1, roll: 0, yaw: 0, throttle: 0.7 }
const FULL_FORWARD: Controls = { pitch: -1, roll: 0, yaw: 0, throttle: 0.7 }

describe('stall limiter (Plan 3 Task 3)', () => {
  it.each([130, 180])(
    'holds a 30 s full back-stick pull short of alphaCrit at %i m/s, where the same pull stalls without it',
    (speed) => {
      // Both halves asserted in one test on purpose: "the assist is on and the
      // number is good" is not evidence the assist did it (assists design §5).
      // Measured 2026-09-13, alphaCrit 15.5 degrees:
      //   130 m/s  OFF peak 15.87 deg, 109 stalled ticks | ON peak 12.72, 0
      //   180 m/s  OFF peak 15.58 deg, 102 stalled ticks | ON peak 12.47, 0
      const off = fly(speed, 30, false, FULL_BACK)
      const on = fly(speed, 30, true, FULL_BACK)

      expect(off.maxAlphaDeg, `assist off must reach the stall for this test to mean anything`)
        .toBeGreaterThan(deg(CRIT))
      expect(off.stalledTicks).toBeGreaterThan(50)

      expect(on.maxAlphaDeg).toBeLessThan(deg(CRIT))
      expect(on.stalledTicks).toBe(0)
    },
  )

  it('bounds the nose-DOWN side as well, where the wing stalls upside down', () => {
    // A one-sided limiter is the obvious wrong implementation, and every
    // positive-alpha test above passes with one. `liftCoefficient` breaks on
    // |alpha| (finding C1), so the boundary is real in both directions.
    // Measured 2026-09-13, 30 s of full forward stick:
    //   90 m/s   OFF min -16.47 deg, 331 stalled ticks | ON min -12.86, 0
    //   130 m/s  OFF min -15.60 deg, 266 stalled ticks | ON min -12.91, 0
    //   180 m/s  OFF min -15.53 deg, 201 stalled ticks | ON min -12.66, 0
    for (const speed of [90, 130, 180]) {
      const off = fly(speed, 30, false, FULL_FORWARD)
      const on = fly(speed, 30, true, FULL_FORWARD)
      expect(off.minAlphaDeg, `${speed} m/s off`).toBeLessThan(-deg(CRIT))
      expect(off.stalledTicks, `${speed} m/s off`).toBeGreaterThan(50)
      expect(on.minAlphaDeg, `${speed} m/s on`).toBeGreaterThan(-deg(CRIT))
      expect(on.stalledTicks, `${speed} m/s on`).toBe(0)
    }
  })

  it('leaves an aggressive pull that stays inside the limit byte-for-byte alone', () => {
    // "Does not interfere below the limit" has to be tested somewhere that
    // could plausibly have been interfered with: a version of this test flown
    // at 2.96 degrees of alpha would pass against almost any limiter,
    // including one that clamps absurdly early -- exactly the "the input never
    // reaches the case" failure this project has already shipped once.
    //
    // RE-MEASURED 2026-09-17: the pitch command backs off 0.8 -> 0.78. The
    // side force from sideslip (`sideForceN`, added that day) bends the flight
    // path under this run's 0.2 of roll, so the same input now reaches more
    // alpha and 0.8 crossed into the limiter's anticipation margin -- 13
    // limited ticks, with alpha still BELOW alphaCrit, so the limiter was
    // right and the test's premise was what broke. Measured across the range:
    //
    //   pitch 0.70 -> 10.38 deg, 0 limited     pitch 0.78 -> 11.60 deg, 0 limited
    //   pitch 0.75 -> 11.14 deg, 0 limited     pitch 0.80 -> 11.90 deg, 13 limited
    //
    // 0.78 keeps the premise: 11.60 degrees, 75% of alphaCrit, limiter silent.
    const raw: Controls = { pitch: 0.78, roll: 0.2, yaw: 0, throttle: 0.8 }
    const on = fly(130, 6, true, raw)
    const off = fly(130, 6, false, raw)

    expect(on.maxAlphaDeg).toBeGreaterThan(11)
    expect(on.maxAlphaDeg).toBeLessThan(deg(CRIT))
    expect(on.limitedTicks).toBe(0)
    // Not just the command: the whole trajectory, so nothing else in the stack
    // moved either.
    expect(on.final).toEqual(off.final)
  })

  it('is the exact identity in cruise, for a gentle and a full pitch command alike', () => {
    // Level at 130 m/s the wing is at zero alpha, with the entire margin
    // available, so even full back stick is legal and must come through
    // unchanged -- the same object contents, not "close to" them.
    const cruise = createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0), attitude: qIdentity() })
    for (const pitch of [0.3, 1]) {
      const raw: Controls = { pitch, roll: -0.2, yaw: 0.1, throttle: 0.8 }
      expect(applyAssists(cruise, spec, raw, DT, ONLY_LIMITER(true)), `pitch=${pitch}`).toEqual(raw)
    }
  })

  it('rations the margin against the pitch rate actually available, not a fixed one', () => {
    // The limiter converts its rad/s bound into stick units with
    // `commandedBodyRates`, whose authority scales with dynamic pressure. So
    // full back stick commands 30 deg/s at 130 m/s but only ~11 deg/s at 70,
    // and the same margin therefore buys a bigger stick fraction when slow:
    // limiting starts LATER, at a higher alpha. Measured 2026-09-13, the alpha
    // at which the command is first reduced: 13.74 degrees at 70 m/s against
    // 11.02 at 130 (predicted `alphaCrit - tau * rate`: 13.79 and 11.00).
    //
    // An implementation that divided by `maxPitchRateDegPerSec` alone -- a
    // plausible wrong one, and conservative rather than dangerous, so nothing
    // else in this file catches it -- would report 11.0 at both speeds and
    // make the airplane blunt exactly where the wing needs to be used.
    const slow = fly(70, 10, true, FULL_BACK)
    const fast = fly(130, 10, true, FULL_BACK)
    expect(slow.firstLimitedAtDeg).toBeCloseTo(13.74, 1)
    expect(fast.firstLimitedAtDeg).toBeCloseTo(11.02, 1)
    expect(slow.firstLimitedAtDeg).toBeGreaterThan(fast.firstLimitedAtDeg + 1)
  })

  it('commands nose-down when the wing is already past the boundary, against full back stick', () => {
    // Entry: descending at 45 degrees of alpha with the pilot holding full
    // back stick -- the worst thing a frightened pilot does. Measured
    // 2026-09-13: the limiter returns pitch -1.000 against a raw +1, and alpha
    // is back under alphaCrit at tick 93 (1.55 s) against tick 118 (1.97 s)
    // with the assist off.
    //
    // The COMMAND REVERSAL is what this test is really pinning, not the
    // recovery: this model drops the nose at the stall by itself (the wing-drop
    // and the lift-curve collapse), so an unassisted airplane recovers from
    // this entry too, only later. A test that asserted recovery alone would
    // pass with the limiter deleted.
    const stalled = createState({
      position: v3(0, 4000, 0),
      velocity: v3(30, -30, 0),
      attitude: qIdentity(),
    })
    const raw: Controls = { pitch: 1, roll: 0, yaw: 0, throttle: 1 }
    expect(deg(angleOfAttack(stalled))).toBeCloseTo(45, 3)
    expect(applyAssists(stalled, spec, raw, DT, ONLY_LIMITER(true)).pitch).toBeCloseTo(-1, 10)
    expect(applyAssists(stalled, spec, raw, DT, ONLY_LIMITER(false)).pitch).toBe(1)
  })

  it('commands nose-UP from an inverted departure, against full forward stick', () => {
    // The mirror of the test above, and the case that had no test at all until
    // the review found one: the limiter DOES add nose-up, and this is the one
    // situation where it fights the pilot hardest. Climbing through a level
    // attitude at -45 degrees of alpha -- the wing stalled upside down -- with
    // the pilot holding full FORWARD stick, the limiter returns +1.000.
    // Measured 2026-09-13: alpha -45.00, out +1.000 against a raw -1, and alpha
    // back inside alphaCrit at tick 61 (1.02 s) against tick 74 (1.23 s) with
    // the assist off.
    //
    // Deliberate, not a side effect of the mirror: recovering from an inverted
    // departure is the same physics as recovering from an upright one, and a
    // limiter that refused to command nose-up would leave the negative-alpha
    // stall with no recovery at all. The review proved this case was unasserted
    // by clamping the lower bound to `Math.min(0, ...)` -- matching a doc
    // comment that wrongly claimed the limiter "never adds nose-up" -- and
    // finding all 399 tests still green. This test is what now decides it.
    const invertedStall = createState({
      position: v3(0, 4000, 0),
      velocity: v3(30, 30, 0),
      attitude: qIdentity(),
    })
    const raw: Controls = { pitch: -1, roll: 0, yaw: 0, throttle: 1 }
    expect(deg(angleOfAttack(invertedStall))).toBeCloseTo(-45, 3)
    expect(applyAssists(invertedStall, spec, raw, DT, ONLY_LIMITER(true)).pitch).toBeCloseTo(1, 10)
    expect(applyAssists(invertedStall, spec, raw, DT, ONLY_LIMITER(false)).pitch).toBe(-1)
  })

  it('cannot prevent a low-speed departure, and keeps asking for nose-down throughout it', () => {
    // The honest scope of the assist, stated as a test rather than only as a
    // comment. A 30 s full back-stick pull from 70 m/s loops, runs out of
    // energy and departs WITH the limiter on: measured 2026-09-13, peak alpha
    // 179.8 degrees and 1049 stalled ticks, against 179.9 and 1061 with it off.
    // Alpha rises because the flight path falls away, and no pitch command
    // opposes that -- `stallLimiterSeconds`' doc comment records the same.
    //
    // What IS guaranteed is asserted instead: every tick entered between
    // alphaCrit and the 90-degree stand-down had the limiter commanding
    // nose-down, so no exceedance in that band is the pilot's pitch command's
    // doing. 133 such ticks were measured, and the count is asserted non-zero
    // because this test would otherwise pass vacuously on a run that skipped
    // the band (at 90 m/s the same manoeuvre does exactly that -- 0 ticks in
    // it -- which is why this test flies 70).
    const on = fly(70, 30, true, FULL_BACK)
    expect(on.stalledTicks).toBeGreaterThan(500)
    expect(on.recoveryBandTicks).toBeGreaterThan(50)
    expect(on.recoveryBandFailures).toBe(0)
  })

  it('stands down past 90 degrees of alpha rather than pinning the stick forward', () => {
    // Flying backwards: alpha 174.3 degrees. The margin term would saturate at
    // full nose-down and hold it there, taking pitch authority from a pilot who
    // needs all of it -- see DEPARTED_ALPHA_RAD. The pilot's command comes back
    // untouched.
    const backwards = createState({
      position: v3(0, 2000, 0),
      velocity: v3(-100, -10, 0),
      attitude: qIdentity(),
    })
    expect(deg(angleOfAttack(backwards))).toBeCloseTo(174.3, 1)
    expect(applyAssists(backwards, spec, FULL_BACK, DT, ONLY_LIMITER(true))).toEqual(FULL_BACK)
  })

  it('stands down when there is no pitch authority to ration', () => {
    // Stationary on the deck: `commandedBodyRates` returns zero pitch rate, so
    // the command cannot move alpha and the bound would be a division by that
    // zero. Returning the pilot's command is the only honest answer; clamping
    // to something invented is not.
    const stationary = createState({ position: v3(0, 0, 0), velocity: v3(0, 0, 0), attitude: qIdentity() })
    expect(applyAssists(stationary, spec, FULL_BACK, DT, ONLY_LIMITER(true))).toEqual(FULL_BACK)
  })
})

/**
 * Plan 3 Task 5: the limiter's own `dt`, which it ignored until now.
 *
 * The bound is a RATE -- the remaining alpha margin, spent no faster than one
 * time constant -- so it only bounds the NEXT STEP if that step is shorter than
 * the time constant the rate was computed for. Step longer than tau and the
 * same rate spends more than the whole margin in one go. Task 3's implementer
 * and its re-reviewer both flagged this: `src/sim/flight/schema.ts` documented
 * the no-exceedance guarantee "at any tau >= DT", i.e. as a condition on the
 * CALLER, and Task 5 is the task that first puts a real caller in front of the
 * stage. `stallLimiterBounds` now rations the margin over `max(tau, dt)`, which
 * is a no-op at every dt <= tau (every production step and every test above,
 * all of which pass `DT` = 1/60 against a 0.15 s tau) and makes the guarantee
 * the limiter's own at any dt.
 *
 * What is asserted is the guarantee itself, not the formula: the pitch RATE the
 * simulation will actually integrate for the command the limiter returned,
 * taken from `sim/`'s own `commandedBodyRates`, multiplied by the step being
 * taken, must not exceed the alpha margin remaining at the start of that step.
 * Max alpha reached is deliberately NOT the assertion here -- at steps this long
 * alpha also moves because the flight path falls away (which no pitch command
 * opposes) and because a 0.5 s Euler step is a poor integrator, so a max-alpha
 * bound would be measuring those instead. Measured 2026-09-13: honest dt
 * overshoots the margin by exactly 0.000 degrees at every condition below,
 * while a caller stepping the same 0.5 s but telling the limiter `DT`
 * overshoots by up to 6.7 degrees.
 */
describe('the stall limiter bounds the step it is given, not a step of length tau (Plan 3 Task 5)', () => {
  /** Worst `commandedRate * dt - margin` over a run, degrees. Positive means
   *  the command the limiter allowed could consume more than the whole
   *  remaining margin in one step, which is what the bound exists to forbid. */
  const worstMarginOvershootDeg = (
    speed: number,
    stepSeconds: number,
    dtToldToLimiter: number,
    seconds: number,
  ): number => {
    let s = createState({ position: v3(0, 2000, 0), velocity: v3(speed, 0, 0), attitude: qIdentity() })
    let worst = -Infinity
    for (let i = 0; i < Math.round(seconds / stepSeconds); i++) {
      const marginRad = CRIT - angleOfAttack(s)
      const controls = applyAssists(s, spec, FULL_BACK, dtToldToLimiter, ONLY_LIMITER(true))
      const rate = commandedBodyRates(spec, s, controls).z
      worst = Math.max(worst, rate * stepSeconds - marginRad)
      s = step(spec, s, controls, { dt: stepSeconds, tick: i + 1 })
    }
    return deg(worst)
  }

  it.each([0.2, 0.3, 0.5])(
    'never lets one %i-second step command more than the remaining alpha margin',
    (stepSeconds) => {
      for (const speed of [70, 90, 130, 200]) {
        const honest = worstMarginOvershootDeg(speed, stepSeconds, stepSeconds, 6)
        expect(honest, `speed=${speed} dt=${stepSeconds}`).toBeLessThanOrEqual(1e-9)
      }
    },
  )

  it('is exactly what a caller lying about its step size loses -- so the guard is reachable, not vacuous', () => {
    // The same runs, with the limiter told `DT` while the integrator actually
    // steps 0.5 s: this is the pre-Task-5 behaviour, reproduced through the
    // shipped function by feeding it the wrong dt rather than by mutating it.
    // Without the `max(tau, dt)` the two arms are the same call and this
    // assertion fails.
    for (const speed of [70, 90, 130, 200]) {
      const lying = worstMarginOvershootDeg(speed, 0.5, DT, 6)
      expect(lying, `speed=${speed}`).toBeGreaterThan(0.5)
    }
  })

  it('leaves the production step untouched: at dt <= tau the bound is the old expression exactly', () => {
    // The change must be invisible where it matters most. `DT` is 1/60 s
    // against a 0.15 s tau, so `max(tau, dt)` is tau, and a single
    // hand-computed reference value pins that: at 90 m/s, alpha 2 degrees past
    // critical, the limiter commands -0.7084896352614817 -- the same figure
    // Task 4's own fix-round-1 tests match against. Also checked at a dt of
    // exactly tau, the boundary of the `max`, and at a nonsense dt, which must
    // fall back to tau rather than poisoning the bound with a NaN.
    const alphaRad = CRIT + (2 * Math.PI) / 180
    const s = createState({
      position: v3(0, 2000, 0),
      velocity: v3(90 * Math.cos(alphaRad), -90 * Math.sin(alphaRad), 0),
      attitude: qIdentity(),
    })
    const raw: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.8 }
    const expected = -0.7084896352614817
    for (const dt of [DT, DT / 10, spec.rates.stallLimiterSeconds, Number.NaN, -1, 0]) {
      expect(applyAssists(s, spec, raw, dt, ONLY_LIMITER(true)).pitch, `dt=${dt}`).toBe(expected)
    }
  })
})

describe('honours a pitch-authority budget narrowed ahead of it (design open item 3)', () => {
  /**
   * The limiter is the one place in `src/assists/index.ts` that puts a value on
   * the pitch axis, and until 2026-09-13 it clamped into its OWN bounds and
   * ignored the `authority` it was handed -- so a stage narrowing the budget
   * ahead of it would have been silently overruled by the very mechanism every
   * other stage is made to obey.
   *
   * There is no input to `applyAssists` that reaches it: the only narrowing
   * that happens before this stage today is `runStack`'s departed collapse, and
   * `stallLimiterBounds` stands down on that same predicate, so the clamp is
   * not executed when it has fired. That is why these call the stage directly
   * rather than going through the stack -- a test that could only be written
   * through `applyAssists` would be a test that cannot fail, today or after a
   * narrowing stage is inserted, which is the failure mode this suite keeps
   * finding.
   *
   * The state is level flight at 130 m/s, alpha 0, where the limiter is
   * measurably passive: with a full budget it hands back +1, -1 and +0.5
   * unchanged and publishes [-1, 1] (measured 2026-09-13 through this exact
   * call), so every number below comes from the incoming budget and nothing
   * from the limiter's own bound.
   *
   * Proved to fail 2026-09-13 by restoring the old line (`Math.min(bounds.upper,
   * Math.max(bounds.lower, clampFinite(controls.pitch, -1, 1)))`): both cases
   * below return the pilot's raw +-1 instead of the budgeted value, and the
   * whole rest of the suite -- all 442 tests as merged -- stays green, which is
   * exactly why this guard is worth its lines.
   */
  const level = createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0), attitude: qIdentity() })
  const held = (pitch: number): Controls => ({ pitch, roll: 0, yaw: 0, throttle: 0.8 })

  it('clamps the command into the narrowed budget, not into its own wider bounds', () => {
    const narrowed: PitchAuthority = { lower: -0.2, upper: 0.2 }
    expect(stallLimiter(level, spec, held(1), DT, narrowed).controls.pitch).toBe(0.2)
    expect(stallLimiter(level, spec, held(-1), DT, narrowed).controls.pitch).toBe(-0.2)
    // A legal command already inside the narrowed budget is still untouched:
    // the stage did not become an unconditional clamp.
    expect(stallLimiter(level, spec, held(0.1), DT, narrowed).controls.pitch).toBe(0.1)
  })

  it('respects a budget already narrowed to a single value, whichever way the pilot pushes', () => {
    // What a narrowing stage inserted ahead of the limiter would actually
    // publish when it spent the axis: one value, no room either side.
    const spent: PitchAuthority = { lower: 0.1, upper: 0.1 }
    for (const pitch of [1, -1, 0, 0.1]) {
      expect(stallLimiter(level, spec, held(pitch), DT, spent).controls.pitch, `pitch=${pitch}`).toBe(0.1)
    }
  })

  it('decides a conflicting budget by the nearest point of its own bound, from either side', () => {
    // THE one genuinely novel decision in `narrowAuthority`, and until review
    // 2026-09-13 nothing pinned it: replacing `Math.min(upper, Math.max(lower,
    // a.lower))` with `lower`, with `upper` or with `(lower + upper) / 2` each
    // left the whole suite green. "Collapsed to its point nearest the budget it
    // replaces" was prose with nothing arbitrating it -- structurally the same
    // as this file's own "never adds nose-up" comment, which was false and
    // which 399 tests failed to notice.
    //
    // Both directions are needed and neither alone is enough: an incoming
    // budget ABOVE the limiter's bound discriminates the `lower` and midpoint
    // variants but not `upper`, and one BELOW it discriminates `upper` and the
    // midpoint but not `lower`.
    //
    // The bound itself is MEASURED through the shipped stage (full budget, full
    // back stick gives its upper, full forward its lower) rather than
    // re-derived from `stallLimiterSeconds` and `commandedBodyRates` here: a
    // second copy of that formula in the suite is exactly what this file's
    // existing comments warn against. Measured 2026-09-13 at 130 m/s: the bound
    // is [-1, 0.1111] at alpha +15 and [-0.1111, 1] at alpha -15 -- one side
    // clamped, which is why a budget strictly inside the other side is a
    // conflict.
    const bound = (alphaDeg: number) => {
      const alphaRad = (alphaDeg * Math.PI) / 180
      const s = createState({
        position: v3(0, 2000, 0),
        velocity: v3(130 * Math.cos(alphaRad), -130 * Math.sin(alphaRad), 0),
        attitude: qIdentity(),
      })
      const FULL: PitchAuthority = { lower: -1, upper: 1 }
      return {
        state: s,
        lower: stallLimiter(s, spec, held(-1), DT, FULL).controls.pitch,
        upper: stallLimiter(s, spec, held(1), DT, FULL).controls.pitch,
      }
    }

    const above = bound(15)
    expect(above.upper, 'the bound must have room above it for this to be a conflict').toBeLessThan(0.5)
    for (const pitch of [1, 0, -1]) {
      // Incoming budget entirely ABOVE the limiter's bound: the nearest point
      // of the bound is its UPPER. `lower` would give -1 and the midpoint
      // -0.44.
      const out = stallLimiter(above.state, spec, held(pitch), DT, { lower: 0.9, upper: 0.9 })
      expect(out.authority, `pitch=${pitch}`).toEqual({ lower: above.upper, upper: above.upper })
      expect(out.controls.pitch, `pitch=${pitch}`).toBe(above.upper)
    }

    const below = bound(-15)
    expect(below.lower, 'the bound must have room below it for this to be a conflict').toBeGreaterThan(-0.5)
    for (const pitch of [1, 0, -1]) {
      // Incoming budget entirely BELOW it: the nearest point is its LOWER.
      // `upper` would give +1 and the midpoint +0.44.
      const out = stallLimiter(below.state, spec, held(pitch), DT, { lower: -0.9, upper: -0.9 })
      expect(out.authority, `pitch=${pitch}`).toEqual({ lower: below.lower, upper: below.lower })
      expect(out.controls.pitch, `pitch=${pitch}`).toBe(below.lower)
    }
    // And the two cases really do disagree, so a variant cannot satisfy both by
    // returning one constant.
    expect(above.upper).not.toBe(below.lower)
  })

  it('never publishes a budget wider than the one it was handed, at any alpha', () => {
    // The other half of the contract, and the one the whole arbitration rests
    // on: this stage may narrow the budget and may not widen it. Total over
    // alpha rather than sampled at the interesting angles, including past the
    // 90-degree stand-down in both directions -- the two no-bound paths return
    // early, and writing them as bare pass-throughs is what this test caught:
    // handed a budget of [-0.4, 0.4] at alpha -100, the stage returned the
    // pilot's raw +1 alongside it.
    //
    // Where the incoming budget and the limiter's own bound do not OVERLAP,
    // there is no subset of both and the conflict is decided rather than
    // intersected (`narrowAuthority`: the bound being applied wins, collapsed
    // to its point nearest the incoming budget). That case is asserted as the
    // documented rule instead of as a subset, because a subset does not exist
    // -- it is not a hole in the test.
    let conflicts = 0
    for (let alphaDeg = -180; alphaDeg <= 180; alphaDeg += 1) {
      const alphaRad = (alphaDeg * Math.PI) / 180
      for (const speed of [70, 130]) {
        const s = createState({
          position: v3(0, 2000, 0),
          velocity: v3(speed * Math.cos(alphaRad), -speed * Math.sin(alphaRad), 0),
          attitude: qIdentity(),
        })
        for (const incoming of [
          { lower: -1, upper: 1 },
          { lower: -0.4, upper: 0.4 },
          { lower: 0.25, upper: 0.25 },
          { lower: -0.6, upper: -0.6 },
        ] as PitchAuthority[]) {
          for (const pitch of [1, 0.3, 0, -0.3, -1]) {
            const out = stallLimiter(s, spec, held(pitch), DT, incoming)
            const where = `alpha=${alphaDeg} speed=${speed} incoming=${JSON.stringify(incoming)} pitch=${pitch}`
            // Total, no exceptions: a published budget is non-empty and the
            // command this stage hands on is inside it.
            expect(out.authority.lower, where).toBeLessThanOrEqual(out.authority.upper)
            expect(out.controls.pitch, where).toBeGreaterThanOrEqual(out.authority.lower)
            expect(out.controls.pitch, where).toBeLessThanOrEqual(out.authority.upper)
            // Subset of the incoming budget, UNLESS the two ranges are
            // disjoint -- and the only way out of the incoming budget is that
            // decided conflict, which always collapses to one value. Asserted
            // in that form (rather than by re-deriving the limiter's bound here
            // to classify the case, which would put a second copy of the bound
            // formula in the suite) because it is total: it holds at every one
            // of these 14,440 calls with no case left unchecked.
            const subset = out.authority.lower >= incoming.lower && out.authority.upper <= incoming.upper
            if (!subset) {
              expect(out.authority.lower, `decided conflict must be one value: ${where}`).toBe(
                out.authority.upper,
              )
              conflicts++
            }
          }
        }
      }
    }
    // The conflict branch must actually be exercised, or the clause above is
    // an escape hatch rather than a case. Measured 2026-09-13: 4,410 of the
    // 14,440 calls are decided conflicts.
    expect(conflicts).toBeGreaterThan(1000)
  })
})
