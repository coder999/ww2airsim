import type { AircraftSpec } from '../sim/flight/schema.js'
import type { AircraftState, Controls } from '../sim/flight/state.js'

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

/** Task 3: adds a yaw command that coordinates the turn implied by bank and
 *  rate, so the aeroplane stops flying crabbed after a roll. Identity until
 *  then. */
function autoRudder(_state: AircraftState, _spec: AircraftSpec, controls: Controls, _dt: number): Controls {
  return controls
}

/** Task 4: trims pitch to hold altitude when the pilot's own pitch command
 *  is near neutral. Identity until then. */
function altitudeHold(_state: AircraftState, _spec: AircraftSpec, controls: Controls, _dt: number): Controls {
  return controls
}
