import { describe, it, expect } from 'vitest'
import {
  applyAssists,
  nextAltitudeHoldMemory,
  NOT_HOLDING,
  type AssistSettings,
  type AltitudeHoldMemory,
} from '../../src/assists/index.js'
import { step, DT, angleOfAttack } from '../../src/sim/flight/model.js'
import { createState, type AircraftState, type Controls } from '../../src/sim/flight/state.js'
import { alphaCritRad } from '../../src/sim/aero.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { qIdentity } from '../../src/sim/math/quat.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const spec = loadAircraftSpec('f6f-hellcat')
const critDeg = (alphaCritRad(spec) * 180) / Math.PI

/** ONLY altitude hold toggles; the other two stages are real (Tasks 2-3) but
 *  are switched off here so a failure in this file can only mean this
 *  stage's own logic, not an interaction with them. The limiter interaction
 *  gets its own describe block below, with the limiter deliberately ON. */
const ONLY_ALTITUDE_HOLD = (on: boolean): AssistSettings => ({
  stallLimiter: false,
  autoRudder: false,
  altitudeHold: on,
})

const level = (altitudeM: number, speed: number, climbMps = 0): AircraftState => {
  const horizontal = Math.sqrt(Math.max(0, speed * speed - climbMps * climbMps))
  return createState({
    position: v3(0, altitudeM, 0),
    velocity: v3(horizontal, climbMps, 0),
    attitude: qIdentity(),
  })
}

/**
 * Flies `seconds` of held `pitchInput` (everything else neutral, given
 * `throttle`) through `applyAssists` -> `step` once per fixed tick, threading
 * `nextAltitudeHoldMemory` forward exactly the way a real caller (Task 5)
 * would -- this is the shipped seam, not a hand-rolled shortcut around it.
 * Returns the altitude trace's stats relative to whatever got captured (or
 * `NaN` deviations if nothing ever was), plus the final aircraft state and
 * the memory reached, so a caller can chain a second phase onto it.
 */
function fly(
  start: AircraftState,
  seconds: number,
  pitchInput: number,
  throttle: number,
  enabled: AssistSettings,
  startMemory: AltitudeHoldMemory = NOT_HOLDING,
): {
  final: AircraftState
  memory: AltitudeHoldMemory
  capturedAltM: number | null
  maxDevM: number
  finalDevM: number
} {
  let s = start
  let memory = startMemory
  const raw: Controls = { pitch: pitchInput, roll: 0, yaw: 0, throttle }
  let maxDevM = -Infinity
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    memory = nextAltitudeHoldMemory(s, raw, memory)
    const controls = applyAssists(s, spec, raw, DT, enabled, memory)
    s = step(spec, s, controls, { dt: DT, tick: i + 1 })
    if (memory.heldAltitudeM !== null) {
      const dev = Math.abs(s.position.y - memory.heldAltitudeM)
      if (dev > maxDevM) maxDevM = dev
    }
  }
  const capturedAltM = memory.heldAltitudeM
  const finalDevM = capturedAltM === null ? Number.NaN : Math.abs(s.position.y - capturedAltM)
  return { final: s, memory, capturedAltM, maxDevM: maxDevM === -Infinity ? Number.NaN : maxDevM, finalDevM }
}

describe('nextAltitudeHoldMemory', () => {
  it('captures the current altitude the tick pitch becomes centred', () => {
    const s = level(2500, 130)
    const memory = nextAltitudeHoldMemory(s, { pitch: 0, roll: 0, yaw: 0, throttle: 0.8 }, NOT_HOLDING)
    expect(memory).toEqual({ heldAltitudeM: 2500 })
  })

  it('does not change while pitch stays centred, even as altitude drifts', () => {
    // Proves the target is pinned at the RELEASE moment, not re-captured every
    // centred tick. A wrong implementation that captures unconditionally
    // (`{ heldAltitudeM: state.position.y }` every time, regardless of
    // whether something is already held) would make the target silently
    // track the aeroplane and this assertion would fail at the second call.
    const raw: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.8 }
    const first = nextAltitudeHoldMemory(level(2500, 130), raw, NOT_HOLDING)
    const second = nextAltitudeHoldMemory(level(2600, 130), raw, first)
    expect(second).toEqual({ heldAltitudeM: 2500 })
  })

  it('clears the instant pitch goes non-zero, discarding whatever was captured', () => {
    const held: AltitudeHoldMemory = { heldAltitudeM: 2500 }
    const cleared = nextAltitudeHoldMemory(level(2500, 130), { pitch: 0.01, roll: 0, yaw: 0, throttle: 0.8 }, held)
    expect(cleared).toEqual(NOT_HOLDING)
  })

  it('re-captures wherever the aeroplane ends up after a manoeuvre, not the pre-manoeuvre altitude', () => {
    const raw: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.8 }
    const captured = nextAltitudeHoldMemory(level(2000, 130), raw, NOT_HOLDING)
    expect(captured).toEqual({ heldAltitudeM: 2000 })

    const midManoeuvre = nextAltitudeHoldMemory(level(2400, 130), { pitch: 1, roll: 0, yaw: 0, throttle: 0.8 }, captured)
    expect(midManoeuvre).toEqual(NOT_HOLDING)

    const released = nextAltitudeHoldMemory(level(2400, 130), raw, midManoeuvre)
    expect(released).toEqual({ heldAltitudeM: 2400 })
  })
})

describe('altitudeHold (Plan 3 Task 4)', () => {
  it('is the identity when nothing has ever been captured (NOT_HOLDING, the Task 1-3 default)', () => {
    // Every call site that predates this task passes no sixth argument at
    // all and gets `NOT_HOLDING` for free -- this is the same guarantee
    // `tests/assists/index.test.ts`'s identity test makes, but for a raw
    // pitch of exactly 0 (centred), which that test does not cover (its own
    // `raw.pitch` is 0.4, so it would pass even if the null-memory guard
    // were missing entirely).
    const s = level(2000, 130)
    const raw: Controls = { pitch: 0, roll: -0.2, yaw: 0.1, throttle: 0.8 }
    expect(applyAssists(s, spec, raw, DT, ONLY_ALTITUDE_HOLD(true))).toEqual(raw)
  })

  it('yields instantly to pilot pitch input, even with an altitude already captured', () => {
    // The direct proof that "yield" is this function's OWN guarantee, not
    // something that only holds if a caller's memory bookkeeping happens to
    // be consistent: hand it a captured altitude nowhere near the aeroplane's
    // actual one (so a wrong implementation that ignored `raw` would produce
    // a large, easily-detected correction) alongside a non-zero raw pitch.
    const s = level(1500, 130) // 500 m below a captured 2000 m
    const raw: Controls = { pitch: 0.4, roll: 0, yaw: 0, throttle: 0.8 }
    const memory: AltitudeHoldMemory = { heldAltitudeM: 2000 }
    expect(applyAssists(s, spec, raw, DT, ONLY_ALTITUDE_HOLD(true), memory)).toEqual(raw)
  })

  it('60 seconds hands-off holds altitude within a band it currently misses by a wide margin', () => {
    // Measured 2026-09-13 (`/tmp/althold_probe.ts`): unassisted, `pitch = 0`
    // held for 60 s from level cruise drifts by tens to hundreds of metres as
    // speed bleeds or builds against a fixed attitude. Assisted, the same six
    // conditions finish within well under a metre and never excurse past
    // ~11 m. The band asserted here (50 m) is generous relative to the
    // measurement precisely so this is a "does it work at all" test, not a
    // pin on the exact tau -- Task 6 is expected to retune that. It also
    // already discriminates "does nothing": a no-op altitude hold produces
    // `withAssist.maxDevM` equal to the unassisted drift (up to 236 m), which
    // fails the 50 m bound directly.
    const cases: ReadonlyArray<readonly [speed: number, throttle: number]> = [
      [70, 0.5],
      [90, 0.7],
      [130, 1.0],
      [180, 1.0],
      [70, 1.0],
      [130, 0.3],
    ]
    for (const [speed, throttle] of cases) {
      const withoutAssist = fly(level(2000, speed), 60, 0, throttle, ONLY_ALTITUDE_HOLD(false))
      const withAssist = fly(level(2000, speed), 60, 0, throttle, ONLY_ALTITUDE_HOLD(true))

      expect(withAssist.capturedAltM, `${speed} m/s / ${throttle} throttle must capture 2000 m`).toBe(2000)
      // The premise: without the assist this case really does drift by more
      // than the band the assist is held to, so passing the second
      // assertion is not simply "nothing ever moves at this speed".
      const unassistedDrift = Math.abs(withoutAssist.final.position.y - 2000)
      // 15, not 50: the smallest of the six measured baselines (180 m/s full
      // throttle) is ~19 m -- still a real drift worth correcting, just not
      // as dramatic as the slow-and-throttled cases' 150-236 m.
      expect(unassistedDrift, `${speed} m/s / ${throttle} throttle`).toBeGreaterThan(15)

      expect(withAssist.maxDevM, `${speed} m/s / ${throttle} throttle`).toBeLessThan(50)
      expect(withAssist.finalDevM, `${speed} m/s / ${throttle} throttle`).toBeLessThan(50)
    }
  })

  it('re-captures at the altitude a REAL manoeuvre leaves it at, and converges back to it on release', () => {
    // Fix round 1, Important 4: an earlier revision of this test flew 60 s of
    // ZERO pitch input under a different name, so nothing was ever yielded or
    // re-captured and its "must not be near 2000" assertion was true by
    // construction (2000 never appeared in that test at all). This version
    // performs the actual manoeuvre the brief describes: hold a real pitch
    // input long enough to leave the aeroplane at a different altitude WITH
    // real vertical speed in progress, release, and watch it converge.
    //
    // Measured 2026-09-13 (`/tmp/real_maneuver_probe.ts`, matching the
    // reviewer's own re-measurement to within a few percent): 0.3 pitch for
    // 3 s at 130 m/s / 80% throttle leaves the aeroplane climbing at ~46 m/s
    // vertical speed, roughly 60 m above the start. Releasing there gives a
    // transient of ~107 m over the following 60 s and converges to within a
    // few centimetres of the release altitude by the end -- consistent with,
    // not copied from, the reviewer's reported 110.8 m transient / 0.0 m
    // final deviation for the same manoeuvre.
    const start = level(2000, 130)
    const pulled = fly(start, 3, 0.3, 0.8, ONLY_ALTITUDE_HOLD(true))
    expect(pulled.memory).toEqual(NOT_HOLDING) // stick was never centred during the pull
    expect(pulled.final.velocity.y, 'sanity: a real climb must be in progress at release').toBeGreaterThan(20)

    const releaseAltM = pulled.final.position.y
    expect(releaseAltM, 'sanity: the climb must have actually moved the aeroplane').toBeGreaterThan(2040)

    const result = fly(pulled.final, 60, 0, 0.8, ONLY_ALTITUDE_HOLD(true), pulled.memory)
    expect(result.capturedAltM).toBeCloseTo(releaseAltM, 0)
    // Transient bound generous relative to the ~107 m measured, and the
    // discriminating part: it must not have gone anywhere near the original
    // 2000 m, which an "always hold the spawn altitude" bug would, nor stayed
    // at the release altitude without ever moving, which a "does nothing"
    // bug would (the climb's own momentum guarantees a real excursion here).
    expect(result.maxDevM).toBeLessThan(150)
    expect(result.maxDevM).toBeGreaterThan(20)
    expect(result.finalDevM).toBeLessThan(5)
    expect(Math.abs(result.final.position.y - 2000)).toBeGreaterThan(50)
  })

  it('cannot hold altitude at zero throttle -- stated honestly, not claimed away', () => {
    // Mirrors `sim/autopilot.ts`'s `holdLevelFlight`'s own documented limit:
    // past the point where the wing can deliver the demanded angle of
    // attack, the command saturates and the aeroplane sinks. This is a
    // property of the airframe, not a bug in the assist, and the test says
    // so rather than silently asserting a tight band that would fail here.
    const result = fly(level(2000, 70), 120, 0, 0, ONLY_ALTITUDE_HOLD(true))
    expect(result.maxDevM).toBeGreaterThan(500)
  })

  it('stands down below 1 m/s, where the trim inversion is undefined', () => {
    // Deliberately 0.5 m/s, not exactly 0: at exactly zero airspeed
    // `commandedBodyRates`' own dynamic-pressure authority is also exactly
    // zero, so the later `fullBackStickRate > 0` guard would mask a missing
    // low-speed guard and this test would pass either way. At 0.5 m/s that
    // authority is a tiny but genuinely POSITIVE number (dynamic pressure
    // scales with v^2, not to zero), so nothing downstream stands in the way
    // of a wild command -- confirmed by removing this guard: without it, this
    // exact case commands full nose-up (`pitch: 1`), not something close to
    // `raw`, because the un-trimmable `clTrim = mass*G / (q*wingArea)` blows
    // up as `q` collapses and the final `clampFinite` just saturates the
    // result rather than signalling anything was wrong.
    const s = createState({ position: v3(0, 2000, 0), velocity: v3(0.5, 0, 0), attitude: qIdentity() })
    const raw: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.8 }
    const memory: AltitudeHoldMemory = { heldAltitudeM: 2500 }
    expect(applyAssists(s, spec, raw, DT, ONLY_ALTITUDE_HOLD(true), memory)).toEqual(raw)
  })

  it('applies a genuinely bounded, non-zero correction when there IS an altitude error', () => {
    // Fix round 1, Important 2: the test this replaces (`heldAltitudeM` equal
    // to the aeroplane's own altitude, i.e. zero error) could not tell "adds
    // a small correction" from "does nothing" -- its assertions bounded the
    // delta above but not below, so a stage reduced to `return controls`
    // passed it. This one uses a deliberate, non-zero error in each
    // direction and bounds the resulting pitch on BOTH sides, so a
    // do-nothing implementation (pitch stays 0) fails the lower bound and a
    // saturated implementation (pitch pinned to +/-1) fails the upper one.
    const below = level(1900, 120) // 100 m below a 2000 m target: must climb
    const above = level(2100, 120) // 100 m above: must descend
    const memoryBelow: AltitudeHoldMemory = { heldAltitudeM: 2000 }
    const memoryAbove: AltitudeHoldMemory = { heldAltitudeM: 2000 }
    const raw: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.8 }

    const climbCmd = applyAssists(below, spec, raw, DT, ONLY_ALTITUDE_HOLD(true), memoryBelow).pitch
    const descendCmd = applyAssists(above, spec, raw, DT, ONLY_ALTITUDE_HOLD(true), memoryAbove).pitch

    expect(climbCmd).toBeGreaterThan(0.02)
    expect(climbCmd).toBeLessThan(0.5)
    expect(descendCmd).toBeLessThan(-0.02)
    expect(descendCmd).toBeGreaterThan(-0.5)
  })
})

/**
 * Fix round 1, CRITICAL: altitude hold could reverse the stall limiter's
 * recovery command. The limiter clamps `controls.pitch` into a
 * margin-derived bound; altitude hold used to ADD up to +/-1 to that clamped
 * value and re-clamp only to [-1, 1], not to the limiter's own bound -- so a
 * strongly negative (nose-down recovery) command could come out positive
 * (nose-up) depending only on which way the held altitude happened to sit.
 *
 * Fixed by an explicit `limiterEngaged` gate in `applyAssists`, computed from
 * the limiter's own before/after output: altitude hold now stands down
 * ENTIRELY -- contributes nothing at all, not a reduced nudge -- whenever the
 * limiter actually changed the pitch command, on the ruling that inside the
 * limiter's recoverable band nothing is left for altitude hold to trim.
 */
describe('altitude hold stands down when the stall limiter is engaged (fix round 1, Critical)', () => {
  /** Alpha 2 degrees past alphaCrit at 90 m/s, stick centred -- the limiter
   *  is actively commanding recovery even though `raw.pitch` is 0. */
  const stalledState = (): AircraftState => {
    const alphaDeg = critDeg + 2
    const alphaRad = (alphaDeg * Math.PI) / 180
    const speed = 90
    const s = createState({
      position: v3(0, 2000, 0),
      velocity: v3(speed * Math.cos(alphaRad), -speed * Math.sin(alphaRad), 0),
      attitude: qIdentity(),
    })
    expect(angleOfAttack(s)).toBeCloseTo(alphaRad, 6)
    return s
  }

  it('matches the limiter-only command exactly, regardless of which way the held altitude sits', () => {
    // The reviewer's own reproduction, reproduced independently here and
    // matched to the reported figures before the fix: limiter alone
    // commands -0.7085; the broken code added a correction that turned this
    // into -0.2694 with a held altitude of 2100 m (above the aeroplane) and
    // +0.2915 with 2500 m -- a full sign reversal of the recovery command.
    // The fix must reproduce the FIRST number exactly in both cases, not
    // merely "something still negative".
    const s = stalledState()
    const raw: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.8 }
    const limiterOnly = applyAssists(s, spec, raw, DT, {
      stallLimiter: true,
      autoRudder: false,
      altitudeHold: false,
    })
    expect(limiterOnly.pitch).toBeCloseTo(-0.7085, 4)

    for (const heldAltitudeM of [2100, 2500]) {
      const memory: AltitudeHoldMemory = { heldAltitudeM }
      const both = applyAssists(s, spec, raw, DT, { stallLimiter: true, autoRudder: false, altitudeHold: true }, memory)
      expect(both.pitch, `held ${heldAltitudeM} m`).toBe(limiterOnly.pitch)
    }
  })

  it('stays matched with the limiter for as long as engagement persists, across real ticks', () => {
    // Not just one tick: flies the stalled state forward for real, in
    // lockstep with a limiter-only trajectory from the identical start, and
    // requires bit-for-bit identical commands (hence identical resulting
    // states) for every tick the limiter-only trajectory says is still
    // engaged. Once alpha recovers past alphaCrit the two are allowed to
    // diverge -- that is altitude hold correctly resuming, not a bug.
    let sLimiter = stalledState()
    let sAll = sLimiter
    const raw: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.8 }
    const memory: AltitudeHoldMemory = { heldAltitudeM: 2500 }
    let engagedTicks = 0
    for (let i = 0; i < Math.round(10 / DT); i++) {
      const cLimiter = applyAssists(sLimiter, spec, raw, DT, {
        stallLimiter: true,
        autoRudder: false,
        altitudeHold: false,
      })
      const cAll = applyAssists(
        sAll,
        spec,
        raw,
        DT,
        { stallLimiter: true, autoRudder: false, altitudeHold: true },
        memory,
      )
      const engaged = Math.abs(angleOfAttack(sLimiter) * (180 / Math.PI)) > critDeg
      if (engaged) {
        engagedTicks++
        expect(cAll.pitch, `tick ${i}`).toBe(cLimiter.pitch)
      }
      sLimiter = step(spec, sLimiter, cLimiter, { dt: DT, tick: i + 1 })
      sAll = step(spec, sAll, cAll, { dt: DT, tick: i + 1 })
    }
    expect(engagedTicks, 'sanity: the run must actually pass through the engaged band').toBeGreaterThan(0)
  })
})

/**
 * Fix round 1, Important 1: the reviewer changed the "is the pilot centred"
 * guard to read `controls.pitch` instead of `raw.pitch` and all 411 tests
 * still passed -- proof the distinction was untested. Decision: keep `raw`
 * (it answers "did the PILOT ask for something", independent of what an
 * earlier stage did) AND keep the separate, explicit `limiterEngaged` gate
 * (it answers "did an earlier stage change the command", independent of
 * what the pilot originally asked for). This test is the one that shows
 * `controls`-only -- collapsing both questions into one check, with no
 * separate `limiterEngaged` concept at all -- is not just untested but
 * actually wrong on a constructible input.
 */
describe('the centred check reads raw, not controls (fix round 1, Important 1)', () => {
  it('stands down for a pilot who is NOT centred, even though the limiter clamps them to exactly 0', () => {
    // Alpha exactly AT alphaCritRad: the limiter's upper bound is exactly 0
    // there (margin = 0), so a pilot pulling 0.3 (not centred) gets clamped
    // to precisely 0 by the limiter alone. A `controls.pitch === 0`-based
    // centred check would read that as "centred" and let altitude hold
    // proceed to compute its own correction from a pilot input that was
    // never released -- confirmed by mutating the guard to exactly that
    // (`controls.pitch !== 0` in place of `!isPitchCentred(raw)`, and
    // dropping `limiterEngaged`): the same inputs then produce `pitch: 1`
    // instead of matching the limiter's `0`.
    const critRad = alphaCritRad(spec)
    const speed = 90
    const s = createState({
      position: v3(0, 2000, 0),
      velocity: v3(speed * Math.cos(critRad), -speed * Math.sin(critRad), 0),
      attitude: qIdentity(),
    })
    expect(angleOfAttack(s)).toBeCloseTo(critRad, 6)

    const raw: Controls = { pitch: 0.3, roll: 0, yaw: 0, throttle: 0.8 }
    const limiterOnly = applyAssists(s, spec, raw, DT, { stallLimiter: true, autoRudder: false, altitudeHold: false })
    expect(limiterOnly.pitch, 'sanity: the limiter must actually clamp to exactly 0 here').toBe(0)

    const memory: AltitudeHoldMemory = { heldAltitudeM: 2500 }
    const both = applyAssists(s, spec, raw, DT, { stallLimiter: true, autoRudder: false, altitudeHold: true }, memory)
    expect(both.pitch).toBe(0)
  })
})
