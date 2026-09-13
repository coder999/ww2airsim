import { describe, it, expect } from 'vitest'
import { applyAssists, type AssistSettings } from '../../src/assists/index.js'
import { step, DT, angleOfAttack, isStalled } from '../../src/sim/flight/model.js'
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
  altitudeHold: false,
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
    // could plausibly have been interfered with: this run reaches 11.71
    // degrees of alpha, 76% of alphaCrit, on a 0.8 pitch command at 130 m/s
    // (measured 2026-09-13). A version of this test flown at 2.96 degrees of
    // alpha would pass against almost any limiter, including one that clamps
    // absurdly early, which is exactly the "the input never reaches the case"
    // failure this project has already shipped once.
    const raw: Controls = { pitch: 0.8, roll: 0.2, yaw: 0, throttle: 0.8 }
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
    // make the aeroplane blunt exactly where the wing needs to be used.
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
    // and the lift-curve collapse), so an unassisted aeroplane recovers from
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
