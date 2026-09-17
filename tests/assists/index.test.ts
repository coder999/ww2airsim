import { describe, it, expect } from 'vitest'
import {
  applyAssists,
  applyAssistsWithAuthority,
  DEFAULT_ASSIST_SETTINGS,
  type AssistSettings,
} from '../../src/assists/index.js'
import { createState, type AircraftState, type Controls } from '../../src/sim/flight/state.js'
import { DT, angleOfAttack, step } from '../../src/sim/flight/model.js'
import { alphaCritRad } from '../../src/sim/aero.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qIdentity } from '../../src/sim/math/quat.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const CRIT = alphaCritRad(f6f)
const state = createState({})
const raw = { pitch: 0.4, roll: -0.2, yaw: 0.1, throttle: 0.8 }

/**
 * A level, wings-level state whose alpha sits `degPastCrit` degrees beyond
 * `alphaCritRad`, at the given true airspeed -- the exact construction
 * `tests/assists/stallLimiter.test.ts`'s "leaves the production step
 * untouched" case uses to reach its hand-checked reference value
 * (-0.7084896352614817 at 2 degrees past critical, 90 m/s), so a test here
 * that reuses `pastCritical(2, 90)` is pinned against the same number rather
 * than a second, independently-typed one that could quietly drift from it.
 */
function pastCritical(degPastCrit: number, speed: number): AircraftState {
  const alphaRad = CRIT + (degPastCrit * Math.PI) / 180
  return createState({
    position: v3(0, 2000, 0),
    velocity: v3(speed * Math.cos(alphaRad), -speed * Math.sin(alphaRad), 0),
    attitude: qIdentity(),
  })
}

/** A wings-level state at exactly `alphaDeg`, at the given true airspeed, at
 *  2000 m -- the construction two describes below share, so they cannot
 *  disagree about what "alpha 120 degrees" means. */
const alphaState = (alphaDeg: number, speed: number): AircraftState => {
  const a = (alphaDeg * Math.PI) / 180
  return createState({
    position: v3(0, 2000, 0),
    velocity: v3(speed * Math.cos(a), -speed * Math.sin(a), 0),
    attitude: qIdentity(),
  })
}


// Every combination of the two flags, so a stage that is wired up wrong (e.g.
// only checked when a DIFFERENT flag is on) has nowhere to hide. Two rather
// than three since altitude hold was deleted on 2026-09-17.
const ALL_SETTINGS_COMBOS: AssistSettings[] = (() => {
  const combos: AssistSettings[] = []
  for (const stallLimiter of [true, false]) {
    for (const autoRudder of [true, false]) {
      combos.push({ stallLimiter, autoRudder })
    }
  }
  return combos
})()

describe('AssistSettings', () => {
  it('defaults the protective assists on and altitude hold off', () => {
    // Plan 3's design draft: an assist a pilot has to remember to enable is
    // one most never do, so a PROTECTIVE default has to be "on", not "off".
    //
    // `altitudeHold` was carved out on 2026-09-15 (Mark's call). It does not
    // protect the airplane, it flies it somewhere, and with the engine off it
    // held altitude indefinitely instead of gliding. The behaviour that
    // decides this lives in `tests/render/frameAssists.test.ts`; this case
    // only pins the shipped constant, so a revert has to fail both.
    expect(DEFAULT_ASSIST_SETTINGS).toEqual({
      stallLimiter: true,
      autoRudder: true,
      })
  })
})

describe('applyAssists (Plan 3 Task 1: the seam, no assist behaviour yet)', () => {
  it('is the identity function for every combination of enabled flags', () => {
    // Still true as of Task 3, but no longer because the stages are stubs:
    // `state` here is `createState({})`, i.e. stationary, and BOTH live stages
    // stand down on it by their own guards -- auto-rudder because a stationary
    // airplane has no relative wind to be misaligned with, the stall limiter
    // because zero airspeed means zero pitch authority to ration. So this
    // test says the seam does not invent behaviour of its own; it is NOT
    // evidence that the stages do nothing. That is
    // tests/assists/autoRudder.test.ts's and stallLimiter.test.ts's job.
    // Proved to fail: giving any one of the three stub stages in
    // src/assists/index.ts a body that changes its input (e.g. `stallLimiter`
    // returning `{ ...controls, pitch: 0 }`) makes the combo with that flag
    // `true` fail this assertion, while combos with it `false` keep passing --
    // isolating exactly which stage broke identity.
    for (const enabled of ALL_SETTINGS_COMBOS) {
      const result = applyAssists(state, f6f, raw, 1 / 60, enabled)
      expect(result).toEqual(raw)
    }
  })

  it('does not mutate the raw command it is handed', () => {
    const before = JSON.stringify(raw)
    applyAssists(state, f6f, raw, 1 / 60, DEFAULT_ASSIST_SETTINGS)
    expect(JSON.stringify(raw)).toBe(before)
  })
})

describe('each assist is independently switchable (Plan 3 Task 5)', () => {
  // The combination test above proves the seam invents nothing; it cannot prove
  // that each FLAG reaches its own stage, because `createState({})` is
  // stationary and every stage stands down there. This does: for each assist,
  // one state where that assist has something to do, run with all three on and
  // then with only that one flag off, and require the output to move. The other
  // two flags are ON in both arms of every case, so a stage wired to read the
  // wrong flag (or a flag that is ignored entirely) fails here rather than
  // hiding behind a combination nobody exercises.
  const withoutOne = (assist: keyof AssistSettings): AssistSettings => ({
    ...DEFAULT_ASSIST_SETTINGS,
    [assist]: false,
  })

  it('the auto-rudder flag alone decides whether the yaw correction is applied', () => {
    // 5 degrees of sideslip to the right at 130 m/s: 0.1 per degree of gain,
    // clamped, gives a yaw command of 0.5 against the pilot's 0.
    const slip = (5 * Math.PI) / 180
    const slipped = createState({
      position: v3(0, 2000, 0),
      velocity: v3(130 * Math.cos(slip), 0, 130 * Math.sin(slip)),
    })
    const command: Controls = { pitch: 0.2, roll: 0, yaw: 0, throttle: 0.8 }
    expect(applyAssists(slipped, f6f, command, DT, DEFAULT_ASSIST_SETTINGS).yaw).toBeCloseTo(0.5, 10)
    expect(applyAssists(slipped, f6f, command, DT, withoutOne('autoRudder')).yaw).toBe(0)
  })

  it('the stall-limiter flag alone decides whether an illegal pull is bounded', () => {
    // Alpha 2 degrees past critical at 90 m/s with full back stick held: the
    // limiter reverses it to -0.5611. (It was -0.7085 until 2026-09-17, when
    // rate authority became proportional to speed instead of dynamic
    // pressure: at 90 m/s and 2000 m the authority rose from 0.627 to 0.792,
    // and the limiter's stick command scales inversely with it -- 0.7085 x
    // 0.627 / 0.792 = 0.5610, the same figure `stallLimiter.test.ts` pins to
    // full precision.)
    const stalled = pastCritical(2, 90)
    const fullBack: Controls = { pitch: 1, roll: 0, yaw: 0, throttle: 0.8 }
    expect(applyAssists(stalled, f6f, fullBack, DT, DEFAULT_ASSIST_SETTINGS).pitch).toBeCloseTo(-0.5611, 4)
    expect(applyAssists(stalled, f6f, fullBack, DT, withoutOne('stallLimiter')).pitch).toBe(1)
  })

})

// The 'fixed, documented order' suite was deleted on 2026-09-17 with altitude
// hold. Every case in it was about ORDER BETWEEN the limiter and altitude
// hold -- that the limiter's pitch decision was final and altitude hold could
// neither restore what it took nor add to its recovery. With two assists left
// and auto-rudder writing only the yaw axis, no two stages contend for the
// pitch axis at all, so there is no order left to pin. If a third pitch-axis
// stage is ever added, those cases are the pattern to restore from git.

describe('the pitch-authority budget bounds the whole stack (final review, C1)', () => {
  /**
   * The assertion that was missing, and the reason C1 shipped: nothing in the
   * suite compared the stack's final pitch command against the authority the
   * stack claims to be operating under. It could not -- past
   * `DEPARTED_ALPHA_RAD` the old protocol's answer was a `null` bound meaning
   * "no claim", and "inside no claim" is not a testable statement. The claim
   * is now `PitchAuthority`, `applyAssistsWithAuthority` returns the one the
   * run actually used (not a re-derivation of it), and these tests are total
   * over alpha rather than sampled at the interesting-looking angles -- the
   * defect lived at 91 degrees, one degree outside where every existing test
   * looked.
   */
  // Legal pilot commands only: `Controls.pitch` documents its range as
  // [-1, 1], and the budget is expressed in that range. A caller handing in
  // 5.0 gets its own 5.0 back from a stack that is the identity on that axis,
  // which is a contract violation upstream, not an authority leak here.
  const RAW_PITCHES = [-1, -0.5, 0, 0.5, 1]

  it('never lets the final pitch command leave the budget, at any alpha including past 90 degrees', () => {
    const escapes: string[] = []
    let departedCases = 0
    for (let alphaDeg = -180; alphaDeg <= 180; alphaDeg += 1) {
      for (const speed of [70, 130]) {
        const s = alphaState(alphaDeg, speed)
        const actualAlphaDeg = (angleOfAttack(s) * 180) / Math.PI
        for (const pitch of RAW_PITCHES) {
          const command: Controls = { pitch, roll: 0.3, yaw: 0, throttle: 0.7 }
          {
            for (const enabled of ALL_SETTINGS_COMBOS) {
              const { controls, pitchAuthority } = applyAssistsWithAuthority(
                s,
                f6f,
                command,
                DT,
                enabled,
              )
              const where = `alpha ${alphaDeg} deg, ${speed} m/s, raw pitch ${pitch}, ${JSON.stringify(enabled)}`
              // Narrowed, never widened: the budget starts at the full legal
              // control range and no stage may hand back more than it got.
              if (pitchAuthority.lower < -1 || pitchAuthority.upper > 1) {
                escapes.push(`budget wider than [-1, 1]: ${JSON.stringify(pitchAuthority)} at ${where}`)
              }
              if (pitchAuthority.lower > pitchAuthority.upper) {
                escapes.push(`empty budget ${JSON.stringify(pitchAuthority)} at ${where}`)
              }
              if (controls.pitch < pitchAuthority.lower || controls.pitch > pitchAuthority.upper) {
                escapes.push(
                  `commanded ${controls.pitch.toFixed(4)} outside ${JSON.stringify(pitchAuthority)} at ${where}`,
                )
              }
              // Past the stand-down the correct narrowing is to the PILOT'S
              // OWN COMMAND -- not to nothing (which would pin the stick of a
              // pilot flying out of a departure) and not to unlimited (which
              // is what shipped). Asserted clear of the boundary itself so
              // this is a statement about the region, not about which side of
              // 90.000 degrees a floating-point alpha lands on.
              if (Math.abs(actualAlphaDeg) >= 90.5) {
                departedCases++
                if (pitchAuthority.lower !== pitch || pitchAuthority.upper !== pitch) {
                  escapes.push(
                    `departed budget ${JSON.stringify(pitchAuthority)} is not the pilot's own ${pitch} at ${where}`,
                  )
                }
              }
            }
          }
        }
      }
    }
    expect(departedCases, 'the sweep must actually reach the departed region').toBeGreaterThan(1000)
    expect(escapes.slice(0, 5)).toEqual([])
    expect(escapes.length).toBe(0)
  })




})

describe('an illegal Controls.pitch is sanitised rather than published as a false claim (design open item 2)', () => {
  /**
   * The item, as carried out of Plan 3: handed a raw pitch of +-5 or NaN, the
   * stack returned that value while publishing a budget of [1, 1], [-1, -1] or
   * [0, 0] -- `narrowToCommand` clamps, the command did not. Nothing leaked,
   * because the value reached `step` exactly as it had before the budget
   * existed, but the published claim was false about the command it was
   * published with, and this project treats a false durable claim as a defect
   * equal to a bug.
   *
   * Fixed by clamping the INPUT (`runStack`'s `rawPitch`) rather than by
   * widening the claim -- see that comment for why widening is not available
   * without giving up "the budget never leaves the pilot's legal range", which
   * is the property the whole arbitration rests on.
   *
   * Both tests proved to fail 2026-09-13 by reverting that one line (all 5
   * illegal values escape the budget in the first, and the second's own
   * "must have been sanitised" precondition goes 5 against 1). The second is
   * not a duplicate of the first: it is what makes the fix safe to believe
   * rather than merely tidy, by measuring that the clamp moved no airplane.
   */
  const ILLEGAL = [5, -5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
  const level = createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0), attitude: qIdentity() })

  it('never returns a pitch outside the budget it publishes, at any alpha or setting', () => {
    const escapes: string[] = []
    // A departed state (120 degrees) and a normal one, because the departed
    // collapse is the narrowing that made the claim specific enough to be
    // false: away from it the budget is [-1, 1] and an illegal 5 is outside
    // that too.
    for (const s of [level, alphaState(120, 90), alphaState(-20, 70)]) {
      for (const pitch of ILLEGAL) {
        {
          for (const enabled of ALL_SETTINGS_COMBOS) {
            const command: Controls = { pitch, roll: 0.2, yaw: 0, throttle: 0.7 }
            const { controls, pitchAuthority } = applyAssistsWithAuthority(s, f6f, command, DT, enabled)
            const where = `raw pitch ${pitch}, alpha ${((angleOfAttack(s) * 180) / Math.PI).toFixed(1)} deg, ${JSON.stringify(enabled)}`
            if (!Number.isFinite(controls.pitch)) escapes.push(`non-finite command ${controls.pitch} at ${where}`)
            if (controls.pitch < pitchAuthority.lower || controls.pitch > pitchAuthority.upper) {
              escapes.push(`commanded ${controls.pitch} outside ${JSON.stringify(pitchAuthority)} at ${where}`)
            }
          }
        }
      }
    }
    expect(escapes.slice(0, 5)).toEqual([])
    expect(escapes.length).toBe(0)
  })

  it('flies identically to the unsanitised command, so the clamp moved no airplane', () => {
    // The claim that makes the fix safe rather than merely tidy:
    // `commandedBodyRates` (src/sim/flight/model.ts) already put every channel
    // through the same `clampFinite(n, -1, 1)`, so +5 was flown as 1 and NaN as
    // 0. This asserts that end to end through `step` -- the state reached from
    // the illegal command and the state reached from the stack's sanitised
    // version of it are identical in every field -- with all three assists OFF,
    // so the sanitisation is the only difference between the two calls.
    const ALL_OFF: AssistSettings = { stallLimiter: false, autoRudder: false}
    for (const s of [level, alphaState(120, 90), alphaState(-20, 70)]) {
      for (const pitch of ILLEGAL) {
        const command: Controls = { pitch, roll: 0.2, yaw: -0.3, throttle: 0.7 }
        const sanitised = applyAssists(s, f6f, command, DT, ALL_OFF)
        expect(sanitised.pitch, `raw ${pitch} must have been sanitised`).toBe(
          Number.isFinite(pitch) ? Math.max(-1, Math.min(1, pitch)) : 0,
        )
        expect(step(f6f, s, sanitised, { dt: DT, tick: 1 }), `raw pitch ${pitch}`).toEqual(
          step(f6f, s, command, { dt: DT, tick: 1 }),
        )
      }
    }
  })
})

