import type { AircraftSpec } from '../sim/flight/schema.js'
import type { AircraftState, Controls } from '../sim/flight/state.js'
import { clampFinite, angleOfAttack, commandedBodyRates } from '../sim/flight/model.js'
import { alphaCritRad } from '../sim/aero.js'
import { v3, dot, length, normalize } from '../sim/math/vec3.js'
import { qRotate } from '../sim/math/quat.js'

/**
 * One flag per assist, all default on.
 *
 * Master spec's assists layer originally named four: rate damping,
 * auto-rudder, stall limiter and combat trim. Plan 3's design draft dropped
 * rate damping (it is a no-op against this project's rate-command model --
 * release the stick and rotation stops within one tick, so there is no
 * residual rate for a damper to act on) and renamed combat trim to altitude
 * hold, since hands-off flight already holds ATTITUDE for free in a
 * rate-command model and the thing worth adding is holding the flight PATH.
 * That leaves the three below.
 *
 * Every flag defaults to `true`: an assist a pilot has to remember to turn on
 * is one most pilots never do, and master spec's stated intent is a
 * beginner-friendly default with an expert opt-out, not the reverse.
 */
export type AssistSettings = {
  readonly stallLimiter: boolean
  readonly autoRudder: boolean
  readonly altitudeHold: boolean
}

/** All three assists on -- see `AssistSettings` for why the default is "on"
 *  rather than "off". */
export const DEFAULT_ASSIST_SETTINGS: AssistSettings = {
  stallLimiter: true,
  autoRudder: true,
  altitudeHold: true,
}

/**
 * Turns the pilot's raw command into what the simulation actually flies.
 *
 * Two of the three stages are real as of Task 3: the stall limiter and
 * auto-rudder. Altitude hold is still Task 1's identity stub, and is labelled
 * as one where it is defined. Task 1 built this seam with all three stubbed
 * deliberately: it proved the wiring in isolation, so that a behavioural bug
 * in any of them can be pinned on "this assist's logic is wrong" rather than
 * left ambiguous against "did this assist even run" (`sim/loop.ts`'s `advance`
 * calls this once per fixed STEP, via an injected parameter -- see that file
 * for why `sim/` invokes it without importing it).
 *
 * `raw` is the pilot's held command for the whole frame (`World.controls`);
 * `state` is the aircraft as of the START of this step, i.e. what the pilot
 * was actually seeing when they gave that command. `dt` is always the fixed
 * step (`DT` in `src/sim/flight/model.ts`) in production; tests may vary it.
 *
 * Stack order is fixed: stall limiter, then auto-rudder, then altitude hold.
 * The limiter bounds the pilot's pitch command first, so every later stage
 * reacts to a command the wing can actually sustain rather than the pilot's
 * raw, possibly-illegal one. Auto-rudder runs next and coordinates the turn
 * implied by THAT bounded attitude, not the pre-limiter one. Altitude hold
 * runs last, trimming whatever pitch authority the first two stages left
 * over -- it is a correction on top of their result, not a competing vote,
 * so it can never fight a decision either of them already made. Any other
 * order lets a later stage silently undo an earlier one's correction.
 */
export function applyAssists(
  state: AircraftState,
  spec: AircraftSpec,
  raw: Controls,
  dt: number,
  enabled: AssistSettings,
): Controls {
  let controls = raw
  controls = enabled.stallLimiter ? stallLimiter(state, spec, controls, dt) : controls
  controls = enabled.autoRudder ? autoRudder(state, spec, controls, dt) : controls
  controls = enabled.altitudeHold ? altitudeHold(state, spec, controls, dt) : controls
  return controls
}

// The stages, in the order `applyAssists` chains them. Task 1 created all
// three as identity stubs and Tasks 2 and 3 replaced two of them in place;
// Task 4 replaces the last. No task may change this file's call order without
// updating the comment on `applyAssists` that justifies it.

/**
 * Beyond this much |alpha| the limiter stands down and hands the pilot their
 * own command back. Not a tuning constant and not in content: 90 degrees is
 * where the flow crosses from in front of the wing to behind it, which is
 * also where `sim/aero.ts`'s post-stall drag blend reaches the flat plate.
 *
 * The limiter's whole model -- "commanded pitch rate moves alpha, so bound the
 * rate by the remaining margin" -- is about an aeroplane still flying roughly
 * forwards. Past 90 degrees it is not: the aeroplane is departed, `alpha` is
 * an atan2 running to +/-180 (see `angleOfAttack`, and `sim/aero.ts`'s note
 * that 40.8% of soak steps sit past 90.5 degrees), and the margin term would
 * simply saturate at full nose-down and PIN it there -- taking pitch authority
 * away from a pilot who needs all of it to fly out of a departure. An assist
 * that cannot help must not interfere.
 */
const DEPARTED_ALPHA_RAD = Math.PI / 2

/**
 * Plan 3 Task 3: bounds the pilot's pitch command so the wing is not driven
 * past `aero.alphaCritDeg`, and drives it back if something else already has.
 *
 * How, and why this shape. `Controls.pitch` commands a body pitch RATE (spec
 * §5, `ratesFromDynamicPressure`), and alpha is the angle between the nose and
 * the velocity in the plane of symmetry, so to first order
 * `d(alpha)/dt = pitchRate - (rate the flight path itself is pitching)`.
 * Dropping the second term is deliberate and conservative in the case that
 * matters: pulling hard means high lift, which pitches the flight path UP, so
 * ignoring it OVER-estimates how fast the pull drives alpha. What is left is
 * a bound on rate:
 *
 *     allowed pitch rate = (alphaCrit - alpha) / stallLimiterSeconds
 *
 * -- the margin, spent no faster than one time constant. As alpha approaches
 * the boundary the allowance goes to zero, so the limit is approached and not
 * crossed; past it the allowance goes NEGATIVE, which commands nose-down, so
 * the same expression that limits the pull is also the recovery. The lower
 * bound is the mirror image about `-alphaCrit`, because a bunt stalls the wing
 * upside down just as a pull stalls it the right way up, and the model's lift
 * curve breaks on |alpha| (`liftCoefficient`, finding C1).
 *
 * The two bounds are converted from rad/s into `Controls.pitch` units by
 * dividing by the rate FULL back stick would command in this exact state,
 * which is taken from `commandedBodyRates` -- `sim/`'s own rate model, called
 * rather than re-derived here. That matters more than saving the duplication:
 * the achievable rate scales with dynamic pressure, so the same margin is
 * worth a much bigger stick fraction slow than fast, and an assist carrying
 * its own copy of that authority curve would silently disagree with the
 * simulation the moment either was tuned. When that rate is zero -- no
 * airspeed, hence no pitch authority at all -- there is nothing to limit,
 * because the command cannot move alpha; the pilot's command is returned
 * untouched rather than clamped to something invented.
 *
 * Note what the limiter deliberately does NOT do: it never adds nose-up. The
 * pilot's command is clamped into `[lower, upper]`, so a gentler command
 * passes through byte-for-byte and ordinary manoeuvring is untouched (with
 * this aircraft's content, full back stick is unrestricted below about 8
 * degrees of alpha). It also cannot prevent every stall -- alpha rises when
 * the flight path falls away in a zoom, and no pitch command stops that -- so
 * `isStalled` remains reachable with the assist on. What it guarantees is that
 * the PILOT'S PITCH COMMAND is not what took the wing past the boundary.
 *
 * It bounds the same `angleOfAttack` that `isStalled` and `liftCoefficient`
 * read, on purpose. Design open item 8 claimed that function over-reports
 * alpha in a slipping turn and that the limiter should be built on a corrected
 * one; that item is retracted (it is already the in-plane angle -- see the
 * derivation on `angleOfAttack`, asserted in
 * `tests/sim/flight/angleOfAttack.test.ts`). Even had it been right, the
 * limiter would have to bound the quantity the simulation's own stall
 * boundary is expressed in, or it would clamp against a boundary the wing
 * does not have.
 */
function stallLimiter(state: AircraftState, spec: AircraftSpec, controls: Controls, _dt: number): Controls {
  const alpha = angleOfAttack(state)
  if (!(Math.abs(alpha) < DEPARTED_ALPHA_RAD)) return controls

  const fullBackStickRate = commandedBodyRates(spec, state, {
    pitch: 1,
    roll: 0,
    yaw: 0,
    throttle: 0,
  }).z
  // Also catches a NaN, which `>` is false for: `commandedBodyRates` cannot
  // produce one from a validated spec, but returning the pilot's command is
  // the right answer either way -- an assist that cannot compute a bound has
  // no business replacing a bound with a guess.
  if (!(fullBackStickRate > 0)) return controls

  const limit = alphaCritRad(spec)
  const asCommand = (marginRad: number) =>
    clampFinite(marginRad / spec.rates.stallLimiterSeconds / fullBackStickRate, -1, 1)
  // upper >= lower always: they differ by 2 * limit / (tau * rate) > 0 before
  // clamping, and clamping both into [-1, 1] preserves the order.
  const upper = asCommand(limit - alpha)
  const lower = asCommand(-limit - alpha)

  return { ...controls, pitch: Math.min(upper, Math.max(lower, clampFinite(controls.pitch, -1, 1))) }
}

/**
 * Plan 3 Task 2: the one Mark asked for after flying it. Roll into a turn,
 * level out, and the aeroplane keeps travelling diagonally instead of
 * straight -- `sim/flight/model.ts`'s weathercock term eventually swings the
 * NOSE back onto the velocity vector (that is aerodynamics: the fin doing
 * what a fin does), but nothing was pushing the pilot's own RUDDER pedal to
 * help it get there, which is what a real pilot would do and what this
 * assist automates. It runs after the stall limiter and before altitude
 * hold, per the stack-order comment on `applyAssists` above.
 *
 * Proportional on sideslip alone: `correction = gain * sideslipDeg`, clamped
 * into [-1, 1] before it is ever combined with anything else, then ADDED to
 * the pilot's own `controls.yaw` (also clamped back into [-1, 1] afterward,
 * since `Controls.yaw`'s documented range is [-1, 1] and this is the last
 * place in `assists/` that touches it). Additive, not a replacement, so a
 * pilot who is already standing on the rudder keeps full authority over it
 * with the assist on -- this only ever nudges the command the pilot gave,
 * never overrides it.
 *
 * Sign, derived (not copied) from two facts already documented elsewhere in
 * this codebase, because this project has shipped two critical sign/frame
 * bugs in exactly this area in three days:
 *  1. `Controls.yaw` (`sim/flight/state.ts`): "positive = nose right". This
 *     is pilot-command space, the same space `raw` and this function's
 *     return value live in -- UNLIKE `AircraftState.bodyRates.y`, which
 *     that same file documents as carrying the opposite sign (a positive
 *     rotation about body +Y turns the nose toward -Z, i.e. LEFT). This
 *     stage never touches `bodyRates` and must not import its negation.
 *  2. Sideslip here is `dot(normalize(velocity), bodyRight)`
 *     (`sim/flight/model.ts`'s weathercock term uses exactly this,
 *     `qRotate(state.attitude, v3(0, 0, 1))` for body right), positive when
 *     the airflow comes from the right, i.e. when the aeroplane is
 *     travelling to the right of where its nose points.
 * Combine them directly: if the aeroplane is travelling to the right of
 * where it points, the nose has to go RIGHT to meet the relative wind --
 * and "nose right" in `Controls.yaw`'s own space is already POSITIVE, so the
 * correction carries the SAME sign as the sideslip, with no negation at all.
 * (Contrast `sim/flight/model.ts`'s `weathercockY`, which negates the
 * identical sideslip value -- correctly, for ITS output space, because that
 * function returns a `bodyRates.y` contribution, not a `Controls.yaw` one.
 * Copying that negation here would have been exactly the class of bug this
 * comment exists to rule out.)
 *
 * `autoRudderGainPerDeg` lives in content (`rates`, beside
 * `weathercockSeconds`) rather than as a constant here, because it is
 * per-aircraft tuning and the Global Constraints forbid inventing a tuning
 * constant in code -- see that field's own doc comment in `schema.ts` for
 * how its value was chosen and what it is (and is not) sourced from.
 */
function autoRudder(state: AircraftState, spec: AircraftSpec, controls: Controls, _dt: number): Controls {
  const speed = length(state.velocity)
  // No sideslip is defined without airflow -- same guard `weathercockY` uses,
  // for the same reason: a stationary aeroplane has no relative wind to be
  // misaligned with.
  if (speed < 1e-6) return controls

  const bodyRight = qRotate(state.attitude, v3(0, 0, 1))
  const sideslipRad = Math.asin(clampFinite(dot(normalize(state.velocity), bodyRight), -1, 1))
  const sideslipDeg = (sideslipRad * 180) / Math.PI

  const correction = clampFinite(spec.rates.autoRudderGainPerDeg * sideslipDeg, -1, 1)
  return { ...controls, yaw: clampFinite(controls.yaw + correction, -1, 1) }
}

/** Task 4: trims pitch to hold altitude when the pilot's own pitch command
 *  is near neutral. Identity until then. */
function altitudeHold(_state: AircraftState, _spec: AircraftSpec, controls: Controls, _dt: number): Controls {
  return controls
}
