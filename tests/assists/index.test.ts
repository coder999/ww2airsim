import { describe, it, expect } from 'vitest'
import {
  applyAssists,
  applyAssistsWithAuthority,
  createAssistRunner,
  DEFAULT_ASSIST_SETTINGS,
  NOT_HOLDING,
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

// Every combination of the three flags, so a stage that is wired up wrong
// (e.g. only checked when a DIFFERENT flag is on) has nowhere to hide.
const ALL_SETTINGS_COMBOS: AssistSettings[] = (() => {
  const combos: AssistSettings[] = []
  for (const stallLimiter of [true, false]) {
    for (const autoRudder of [true, false]) {
      for (const altitudeHold of [true, false]) {
        combos.push({ stallLimiter, autoRudder, altitudeHold })
      }
    }
  }
  return combos
})()

describe('AssistSettings', () => {
  it('defaults every assist on', () => {
    // Plan 3's design draft: an assist a pilot has to remember to enable is
    // one most never do, so the default has to be "on", not "off".
    expect(DEFAULT_ASSIST_SETTINGS).toEqual({
      stallLimiter: true,
      autoRudder: true,
      altitudeHold: true,
    })
  })
})

describe('applyAssists (Plan 3 Task 1: the seam, no assist behaviour yet)', () => {
  it('is the identity function for every combination of enabled flags', () => {
    // Still true as of Task 3, but no longer because the stages are stubs:
    // `state` here is `createState({})`, i.e. stationary, and BOTH live stages
    // stand down on it by their own guards -- auto-rudder because a stationary
    // aeroplane has no relative wind to be misaligned with, the stall limiter
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
    // limiter reverses it to -0.7085, and altitude hold (on in both arms) is
    // standing down here because the pilot's pitch is not centred.
    const stalled = pastCritical(2, 90)
    const fullBack: Controls = { pitch: 1, roll: 0, yaw: 0, throttle: 0.8 }
    expect(applyAssists(stalled, f6f, fullBack, DT, DEFAULT_ASSIST_SETTINGS).pitch).toBeCloseTo(-0.7085, 4)
    expect(applyAssists(stalled, f6f, fullBack, DT, withoutOne('stallLimiter')).pitch).toBe(1)
  })

  it('the altitude-hold flag alone decides whether a captured altitude is flown back to', () => {
    // Level cruise, stick centred, 200 m above the captured altitude, so the
    // stage wants a descent. The limiter is on in both arms and has nothing to
    // do at this alpha, which is the point: one flag moves, one output moves.
    const level = createState({ position: v3(0, 2000, 0), velocity: v3(130, 0, 0) })
    const centred: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.8 }
    const memory = { heldAltitudeM: 1800 }
    const on = applyAssists(level, f6f, centred, DT, DEFAULT_ASSIST_SETTINGS, memory).pitch
    expect(on).toBeLessThan(-0.2)
    expect(applyAssists(level, f6f, centred, DT, withoutOne('altitudeHold'), memory).pitch).toBe(0)
  })
})

describe('the stack applies in a fixed, documented order (Plan 3 Task 5)', () => {
  /**
   * Only ONE of the two adjacencies in the documented order -- stall limiter,
   * then auto-rudder, then altitude hold -- is observable, and that is a
   * finding rather than an omission, so it is stated here instead of being
   * papered over with a test that cannot fail:
   *
   *  - limiter before altitude hold IS observable, and is asserted below.
   *    Both stages vote on pitch, and the order decides which one's vote
   *    survives.
   *  - auto-rudder's two adjacencies are NOT observable by any input. It reads
   *    only `state` (sideslip) and writes only `yaw`; the limiter reads only
   *    `state` and writes only `pitch`; altitude hold reads `state`, `raw` and
   *    `controls.pitch` and writes only `pitch`. Disjoint reads and writes
   *    commute, so moving auto-rudder anywhere in the chain produces a
   *    bit-identical result. A test claiming to pin its position would be
   *    vacuous -- true by construction, which is exactly the failure this
   *    project's reviews keep finding.
   */
  it("the limiter's pitch decision is final: altitude hold cannot restore what it took away", () => {
    // The three-way measurement, all at the same state (alpha 17.5 degrees at
    // 90 m/s, stick centred, holding an altitude 500 m above the aeroplane) so
    // that the two stages genuinely disagree, measured 2026-09-13:
    //   limiter alone:        -0.7085  (nose down, stall recovery)
    //   altitude hold alone:  +1.0000  (nose up, full authority, to climb)
    //   the shipped stack:    -0.7085  exactly the limiter's own value
    // The middle number is what makes this an order assertion rather than a
    // coincidence: without it, a dead altitude-hold stage would give the same
    // final answer, and the test could not tell the two apart.
    const s = pastCritical(2, 90)
    const centred: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.8 }
    const memory = { heldAltitudeM: 2500 }
    const limiterOnly = applyAssists(s, f6f, centred, DT, {
      stallLimiter: true,
      autoRudder: false,
      altitudeHold: false,
    }).pitch
    const holdOnly = applyAssists(
      s,
      f6f,
      centred,
      DT,
      { stallLimiter: false, autoRudder: false, altitudeHold: true },
      memory,
    ).pitch
    const shipped = applyAssists(s, f6f, centred, DT, DEFAULT_ASSIST_SETTINGS, memory).pitch

    expect(limiterOnly).toBeLessThan(-0.5)
    expect(holdOnly, 'the two stages must actually disagree here').toBeGreaterThan(0.5)
    expect(shipped).toBe(limiterOnly)
  })

  it("is final in the other direction too: altitude hold cannot ADD to the limiter's recovery", () => {
    // The same state as above with the held altitude BELOW the aeroplane, so
    // altitude hold wants nose-down and the two stages agree on the sign. The
    // limiter still owns the number: measured 2026-09-13, altitude hold alone
    // commands -1.0000 and the shipped stack commands the limiter's own
    // -0.7085. That is Task 4's ruling -- once the limiter has had to change
    // the pilot's value, the axis is spent and no later stage votes -- and
    // this is the case that DISCRIMINATES it, which nothing did before. The
    // test above cannot: there the bound's own clamp lands on the same number
    // whether or not the ruling is implemented. Proved to fail 2026-09-13 by
    // dropping the collapse-to-the-limiter's-value in `stallLimiter` and
    // leaving only the bound: shipped becomes -1.0000 and this fails, while
    // all 48 other assist tests stay green.
    const s = pastCritical(2, 90)
    const centred: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.8 }
    const memory = { heldAltitudeM: 1500 }
    const limiterOnly = applyAssists(s, f6f, centred, DT, {
      stallLimiter: true,
      autoRudder: false,
      altitudeHold: false,
    }).pitch
    const holdOnly = applyAssists(
      s,
      f6f,
      centred,
      DT,
      { stallLimiter: false, autoRudder: false, altitudeHold: true },
      memory,
    ).pitch
    expect(holdOnly, 'altitude hold must want a different number for this to discriminate').toBe(-1)
    expect(limiterOnly).toBeCloseTo(-0.7085, 4)
    expect(applyAssists(s, f6f, centred, DT, DEFAULT_ASSIST_SETTINGS, memory).pitch).toBe(limiterOnly)
  })
})

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
  const alphaState = (alphaDeg: number, speed: number): AircraftState => {
    const a = (alphaDeg * Math.PI) / 180
    return createState({
      position: v3(0, 2000, 0),
      velocity: v3(speed * Math.cos(a), -speed * Math.sin(a), 0),
      attitude: qIdentity(),
    })
  }

  // Legal pilot commands only: `Controls.pitch` documents its range as
  // [-1, 1], and the budget is expressed in that range. A caller handing in
  // 5.0 gets its own 5.0 back from a stack that is the identity on that axis,
  // which is a contract violation upstream, not an authority leak here.
  const RAW_PITCHES = [-1, -0.5, 0, 0.5, 1]
  const MEMORIES = [NOT_HOLDING, { heldAltitudeM: 2500 }, { heldAltitudeM: 1500 }]

  it('never lets the final pitch command leave the budget, at any alpha including past 90 degrees', () => {
    const escapes: string[] = []
    let departedCases = 0
    for (let alphaDeg = -180; alphaDeg <= 180; alphaDeg += 1) {
      for (const speed of [70, 130]) {
        const s = alphaState(alphaDeg, speed)
        const actualAlphaDeg = (angleOfAttack(s) * 180) / Math.PI
        for (const pitch of RAW_PITCHES) {
          const command: Controls = { pitch, roll: 0.3, yaw: 0, throttle: 0.7 }
          for (const memory of MEMORIES) {
            for (const enabled of ALL_SETTINGS_COMBOS) {
              const { controls, pitchAuthority } = applyAssistsWithAuthority(
                s,
                f6f,
                command,
                DT,
                enabled,
                memory,
              )
              const where = `alpha ${alphaDeg} deg, ${speed} m/s, raw pitch ${pitch}, held ${String(
                memory.heldAltitudeM,
              )}, ${JSON.stringify(enabled)}`
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

  it('gives altitude hold no vote on a departed wing, where both of Task 4 fixes went inert', () => {
    // The measured case, 2026-09-13, 90 m/s, stick centred, holding 500 m
    // above the aeroplane -- shipped `DEFAULT_ASSIST_SETTINGS`:
    //
    //   alpha    limiter only    all three, before this fix    after
    //    89 deg    -1.0000            -1.0000                  -1.0000
    //    91 deg     0.0000            +1.0000                   0.0000
    //   135 deg     0.0000            +1.0000                   0.0000
    //
    // Full nose-up on a wing that is 45 degrees past the flow reversal. Below
    // the stand-down the limiter is still in charge and the stack still
    // commands recovery, which is why 89 degrees is asserted here too: a
    // "fix" that simply switched altitude hold off near the stall would pass
    // the two departed rows and fail this one.
    const centred: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.8 }
    const memory = { heldAltitudeM: 2500 }
    const ONLY_LIMITER: AssistSettings = { stallLimiter: true, autoRudder: false, altitudeHold: false }

    expect(applyAssists(alphaState(89, 90), f6f, centred, DT, ONLY_LIMITER, memory).pitch).toBeCloseTo(-1, 10)
    expect(applyAssists(alphaState(89, 90), f6f, centred, DT, DEFAULT_ASSIST_SETTINGS, memory).pitch).toBeCloseTo(
      -1,
      10,
    )
    for (const alphaDeg of [91, 135]) {
      const s = alphaState(alphaDeg, 90)
      expect(applyAssists(s, f6f, centred, DT, ONLY_LIMITER, memory).pitch).toBe(0)
      expect(
        applyAssists(s, f6f, centred, DT, DEFAULT_ASSIST_SETTINGS, memory).pitch,
        `all three assists at ${alphaDeg} deg must command exactly what the pilot did`,
      ).toBe(0)
    }
  })

  it('does not extend a departure it cannot help with, flown end to end', () => {
    // The behavioural consequence, rather than the command at one tick: enter
    // departed at 120 degrees of alpha, hands off, and fly 60 s through
    // `step()` with the memory advanced the way `createAssistRunner` does.
    // Measured 2026-09-13, before this fix: 126 ticks past 90 degrees with
    // altitude hold off, 801 with it on, first unstalled tick 2.18 s against
    // 5.35 s. After: 126 and 126, identical. This asserts the inequality
    // rather than the pinned 126, because the number is a property of the
    // flight model and the claim is about the assist.
    const flyDeparted = (altitudeHold: boolean) => {
      const enabled: AssistSettings = { stallLimiter: true, autoRudder: true, altitudeHold }
      const centred: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.8 }
      const runner = createAssistRunner(enabled)
      let s = alphaState(120, 90)
      let ticksPast90 = 0
      for (let i = 0; i < Math.round(60 / DT); i++) {
        s = step(f6f, s, runner.assist(s, f6f, centred, DT), { dt: DT, tick: i + 1 })
        if (Math.abs((angleOfAttack(s) * 180) / Math.PI) > 90) ticksPast90++
      }
      return ticksPast90
    }
    const off = flyDeparted(false)
    const on = flyDeparted(true)
    expect(off, 'the entry must actually be departed for this to mean anything').toBeGreaterThan(50)
    expect(on, 'altitude hold must not lengthen the time spent past 90 degrees').toBeLessThanOrEqual(off)
  })
})

describe('createAssistRunner (Plan 3 Task 5)', () => {
  /**
   * The runner exists so the altitude-hold memory's pairing invariant -- advance
   * it BEFORE the stack, on the same `state` and `raw`, once per fixed step --
   * is one function body rather than a rule every caller has to remember. These
   * tests are on the invariant, not on the arithmetic each stage does (that is
   * the other three files' job).
   */
  const level = (altitudeM: number) =>
    createState({ position: v3(0, altitudeM, 0), velocity: v3(130, 0, 0) })
  const centred: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.8 }
  const ONLY_HOLD: AssistSettings = { stallLimiter: false, autoRudder: false, altitudeHold: true }

  it('advances the memory itself, so a caller that only calls `assist` still gets a real hold', () => {
    // Call the runner's assist twice, at two different altitudes, exactly the
    // way `advance` would across two steps. The first call is the capture; the
    // second is 100 m lower, so a runner that genuinely carried the first
    // call's memory forward must command a climb. A runner that forgot it (or
    // never advanced it) would see `NOT_HOLDING` again and hand back the
    // pilot's centred command untouched.
    const runner = createAssistRunner(ONLY_HOLD)
    const first = runner.assist(level(2000), f6f, centred, DT)
    expect(runner.memory()).toEqual({ heldAltitudeM: 2000 })

    const second = runner.assist(level(1900), f6f, centred, DT)
    expect(second.pitch, 'the second step must be flying back up to the captured 2000 m').toBeGreaterThan(0.1)
    expect(runner.memory(), 'and the target must stay pinned where it was captured').toEqual({
      heldAltitudeM: 2000,
    })
    // The first call captures at zero ALTITUDE error, but that is not the same
    // as zero correction, and pinning the exact value is what makes this call
    // evidence rather than a finiteness check: `altitudeHold`'s target
    // ATTITUDE is `alphaTrim + gamma`, and at 130 m/s and 2000 m `alphaTrim`
    // (the angle of attack that trims lift) is nonzero while `level(2000)`'s
    // actual attitude is dead level, so the two disagree even though the
    // altitude error is exactly 0. That is exactly the gap that would vanish
    // if the runner computed `applyAssists` BEFORE advancing the memory
    // instead of after -- `memory` would still read `NOT_HOLDING` at the
    // moment `applyAssists` ran, altitude hold would stand down completely
    // (its first gate), and `first.pitch` would be exactly 0 rather than the
    // small trim correction below. Measured 2026-09-13, this aircraft's
    // content, through this exact call.
    expect(first.pitch).toBeCloseTo(0.009348025602234161, 10)
  })

  it('starts from the memory it is handed, which is how a frame boundary is crossed', () => {
    // `nextFrameState` builds a new runner every frame, so the hold would reset
    // sixty times a second if the second argument were ignored.
    const runner = createAssistRunner(ONLY_HOLD, { heldAltitudeM: 2000 })
    expect(runner.assist(level(1900), f6f, centred, DT).pitch).toBeGreaterThan(0.1)
  })

  it('remembers nothing at all while altitude hold is switched off', () => {
    // Off means forgotten, not paused: a target kept warm through a
    // deliberate descent would reassert itself the moment the assist came back
    // on. Handed a memory AND a centred stick, a runner with the flag off must
    // still report nothing held.
    const runner = createAssistRunner(
      { stallLimiter: false, autoRudder: false, altitudeHold: false },
      { heldAltitudeM: 2000 },
    )
    expect(runner.assist(level(1900), f6f, centred, DT)).toEqual(centred)
    expect(runner.memory()).toBe(NOT_HOLDING)
  })

  it('gives each runner its own memory, so two flights cannot share one captured altitude', () => {
    // The reason this is a factory and not a module-level cell (see
    // `AltitudeHoldMemory`'s doc comment): two test files, or two aeroplanes
    // once Plan 5 exists, must not fight over one target.
    const a = createAssistRunner(ONLY_HOLD)
    const b = createAssistRunner(ONLY_HOLD)
    a.assist(level(2000), f6f, centred, DT)
    expect(a.memory()).toEqual({ heldAltitudeM: 2000 })
    expect(b.memory()).toBe(NOT_HOLDING)
    b.assist(level(1000), f6f, centred, DT)
    expect(a.memory()).toEqual({ heldAltitudeM: 2000 })
    expect(b.memory()).toEqual({ heldAltitudeM: 1000 })
  })
})
