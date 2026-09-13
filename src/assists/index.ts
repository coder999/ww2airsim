import type { AircraftSpec } from '../sim/flight/schema.js'
import type { AircraftState, Controls } from '../sim/flight/state.js'
import { clampFinite } from '../sim/flight/model.js'
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
 * This is Plan 3 Task 1: the seam only, with no assist behaviour in it yet.
 * Each stage below is currently the identity function, chained in the order
 * later tasks are required to preserve -- see the stack-order comment below.
 * Building the wiring before any assist exists is deliberate: it proves the
 * seam in isolation, so that a later behavioural bug can be pinned on "this
 * assist's logic is wrong" rather than left ambiguous against "did this
 * assist even run" (`sim/loop.ts`'s `advance` calls this once per fixed
 * STEP, via an injected parameter -- see that file for why `sim/` invokes it
 * without importing it).
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

// The three stages below are stubs: Task 1 builds only the seam. Plan 3
// Tasks 2-4 replace each body in place; none of them may change this file's
// call order in `applyAssists` above without updating the comment that
// justifies it.

/** Task 2: bounds commanded pitch so the wing cannot be driven past
 *  `spec.aero.alphaCritDeg`. Identity until then. */
function stallLimiter(_state: AircraftState, _spec: AircraftSpec, controls: Controls, _dt: number): Controls {
  return controls
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
