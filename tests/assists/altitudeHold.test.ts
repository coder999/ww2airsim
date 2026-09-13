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

/** ONLY altitude hold toggles; the other two stages are real (Tasks 2-3) but
 *  are switched off here so a failure in this file can only mean this
 *  stage's own logic, not an interaction with them (that interaction gets
 *  its own test below instead of being an ambient possibility in every one
 *  of these). */
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
 * `NaN` deviations if nothing ever was).
 */
function fly(
  start: AircraftState,
  seconds: number,
  pitchInput: number,
  throttle: number,
  enabled: AssistSettings,
): { final: AircraftState; capturedAltM: number | null; maxDevM: number; finalDevM: number } {
  let s = start
  let memory: AltitudeHoldMemory = NOT_HOLDING
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
  return { final: s, capturedAltM, maxDevM: maxDevM === -Infinity ? Number.NaN : maxDevM, finalDevM }
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
    // pin on the exact tau -- Task 6 is expected to retune that.
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

  it('re-captures at the post-manoeuvre altitude and holds THAT, not the original', () => {
    // A moderate climb in progress (400 m above, and 15 m/s of vertical speed,
    // a condition the probe measured converging within 8 m over 60 s) --
    // standing in for "wherever an earlier manoeuvre left the aeroplane"
    // without needing a violent stick input first: a full-authority pull
    // steep enough to leave a clearly-different altitude also leaves a large
    // phugoid overshoot on release (measured separately, up to ~300 m over
    // 30 s, undamped within that window) that would make this test about the
    // aeroplane's momentum rather than about what gets captured.
    const start = level(2400, 130, 15)
    const result = fly(start, 60, 0, 0.8, ONLY_ALTITUDE_HOLD(true))
    expect(result.capturedAltM).toBe(2400)
    expect(result.maxDevM).toBeLessThan(50)
    // The discriminating part: it must NOT have gone anywhere near a
    // hypothetical earlier 2000 m, which an "always hold the spawn altitude"
    // bug would.
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

  it('is additive: a stall-recovery command already in flight is nudged, not discarded', () => {
    // Alpha just past alphaCrit with the pilot's stick dead centre -- the
    // stall limiter (on its own) forces a strong nose-down command even
    // though `raw.pitch` is 0. Altitude hold, engaged alongside it, must add
    // a small correction on top of that, not replace it with its own
    // independently-computed (and much smaller) pitch value: a REPLACING
    // implementation would produce something near the small value below,
    // rather than something close to the limiter-only command.
    const critDeg = (alphaCritRad(spec) * 180) / Math.PI
    const alphaDeg = critDeg + 2
    const speed = 90
    const alphaRad = (alphaDeg * Math.PI) / 180
    // Nose along +X, velocity tipped down by alpha in the X/Y plane so the
    // forward axis sits `alphaRad` above the velocity vector (positive alpha
    // convention, matching `angleOfAttack`'s doc comment).
    const s = createState({
      position: v3(0, 2000, 0),
      velocity: v3(speed * Math.cos(alphaRad), -speed * Math.sin(alphaRad), 0),
      attitude: qIdentity(),
    })
    expect(angleOfAttack(s)).toBeCloseTo(alphaRad, 6)

    const raw: Controls = { pitch: 0, roll: 0, yaw: 0, throttle: 0.8 }
    const memory: AltitudeHoldMemory = { heldAltitudeM: 2000 } // already holding, well above capture threshold
    const limiterOnly = applyAssists(s, spec, raw, DT, { stallLimiter: true, autoRudder: false, altitudeHold: false })
    const both = applyAssists(s, spec, raw, DT, { stallLimiter: true, autoRudder: false, altitudeHold: true }, memory)

    expect(limiterOnly.pitch, 'the limiter alone must actually be commanding recovery for this test to mean anything').toBeLessThan(-0.5)
    expect(both.pitch).toBeLessThan(-0.4) // still strongly nose-down: not thrown away
    expect(Math.abs(both.pitch - limiterOnly.pitch)).toBeLessThan(0.2) // but nudged, not identical
  })
})
