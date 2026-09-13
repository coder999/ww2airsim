import type { AircraftSpec } from '../sim/flight/schema.js'
import type { AircraftState, Controls } from '../sim/flight/state.js'
import { clampFinite, angleOfAttack, commandedBodyRates, airspeed, massKg } from '../sim/flight/model.js'
import { alphaCritRad } from '../sim/aero.js'
import { densityAt } from '../sim/atmosphere.js'
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
 * The one piece of state this layer needs. The stall limiter and auto-rudder
 * are pure functions of the CURRENT `AircraftState` -- everything they need to
 * decide is already sitting in alpha, sideslip, whatever `spec` says. Altitude
 * hold cannot be: "hold the altitude at which the stick was last centred"
 * names a quantity (the altitude at some PAST tick) that does not appear
 * anywhere in `AircraftState`, `Controls` or `World`, and cannot be recovered
 * from them after the fact -- `World.previous` is exactly one tick back, not
 * "however many ticks since the stick was last touched".
 *
 * `null` means "the pilot has the stick, or nothing has been captured yet";
 * a number is the altitude, metres, being held.
 *
 * Design decision, argued rather than assumed (the brief asked for this): the
 * memory is external and explicit, not carried inside `applyAssists` itself,
 * and not added to `World` in `sim/loop.ts`. Three constraints ruled out the
 * alternatives:
 *
 *  1. `applyAssists(state, spec, raw, dt, enabled)` is an established contract
 *     -- every test written for Tasks 1-3 calls it with exactly those five
 *     arguments and reads the result as a bare `Controls`. Widening the
 *     return type to smuggle memory out (e.g. `{ controls, memory }`) would
 *     touch every one of those pre-existing call sites for a need only the
 *     third stage has. It stays five arguments in, `Controls` out, with this
 *     type as an OPTIONAL sixth argument -- every caller that omits it (all
 *     of Tasks 1-3's tests, unchanged) gets `NOT_HOLDING`, under which
 *     altitude hold behaves exactly as its old identity stub did.
 *  2. `sim/` must not gain assist state. `World` is `sim/`'s type, and a
 *     captured altitude is exactly the kind of thing "sim/ is a pure physics
 *     model, assists sit outside it" (spec §3, this file's own boundary
 *     rule) says does not belong there.
 *  3. A hidden mutable cell (a module-level variable, or an object this file
 *     owns and mutates in place) would make two callers fight over it -- two
 *     test files running concurrently, or two aeroplanes once Plan 5 exists,
 *     would silently share one captured altitude. Making the type exported
 *     and the transition function pure means each caller holds its OWN
 *     memory value in its OWN per-session state (the same way `World` and
 *     `FrameState` are already threaded by their callers in `sim/loop.ts` and
 *     `src/render/frame.ts`, never mutated in place) -- so there is nothing
 *     to fight over by construction, not by discipline.
 *
 * `nextAltitudeHoldMemory` is the pure function that advances it; a caller
 * that wants a real hold calls it once per tick and threads the result
 * forward exactly the way `nextFrameState` already threads `World` forward.
 * Task 4 does not wire this into the render loop -- that is Task 5's
 * "switching" work -- so nothing in `src/render/` calls it yet; the seam is
 * proved from tests only, the same way Task 1 proved `applyAssists` itself.
 */
export type AltitudeHoldMemory = {
  readonly heldAltitudeM: number | null
}

/** No altitude captured. The default every pre-Task-4 caller gets for free. */
export const NOT_HOLDING: AltitudeHoldMemory = { heldAltitudeM: null }

/**
 * "Centred", for this assist, means exactly `pitch === 0` -- not a deadband
 * magnitude, so there is nothing here to tune or invent. That is also
 * precisely what a released stick settles to in production:
 * `src/input/keyboard.ts`'s `controlsFromKeys` ramps pitch toward 0 and its
 * `approach` helper SNAPS to the target once within one frame's step of it
 * (`if (Math.abs(delta) <= maxStep) return target`), so a released key
 * reaches literal `0`, not an asymptote that merely gets close. Tests that
 * build `Controls` by hand use the same literal for the same reason.
 */
const isPitchCentred = (raw: Controls): boolean => raw.pitch === 0

/**
 * Advances the memory by one tick. Pure: same inputs, same output, and the
 * caller owns the result (see `AltitudeHoldMemory`'s doc for why this is not
 * mutated in place).
 *
 * Two rules, both required by the brief in these exact words: "yield to
 * pilot pitch input" and "re-capture on release".
 *  - Pitch off-centre: always `NOT_HOLDING`, regardless of what was captured
 *    before. This is what makes "yield" durable across a manoeuvre -- the
 *    old target is not kept warm somewhere waiting to reassert itself; it is
 *    gone the instant the pilot touches pitch, so whatever altitude the
 *    manoeuvre ends at is what gets captured next, not wherever it started.
 *  - Pitch centred: if nothing is currently held, capture THIS tick's
 *    altitude and start holding it -- this is the "re-capture on release"
 *    moment. If something is already held, leave it untouched: capturing
 *    every centred tick would make the target track the aeroplane's current
 *    altitude in real time, which is a target that can never disagree with
 *    where the aeroplane already is -- i.e. a hold that can never do
 *    anything. The target has to be pinned at the release moment and left
 *    alone so that later drift has something to be measured against.
 */
export function nextAltitudeHoldMemory(
  state: AircraftState,
  raw: Controls,
  memory: AltitudeHoldMemory,
): AltitudeHoldMemory {
  if (!isPitchCentred(raw)) return NOT_HOLDING
  return memory.heldAltitudeM === null ? { heldAltitudeM: state.position.y } : memory
}

/**
 * Turns the pilot's raw command into what the simulation actually flies.
 *
 * All three stages are real as of Task 4. Task 1 built this seam with all
 * three stubbed deliberately: it proved the wiring in isolation, so that a
 * behavioural bug in any of them can be pinned on "this assist's logic is
 * wrong" rather than left ambiguous against "did this assist even run"
 * (`sim/loop.ts`'s `advance` calls this once per fixed STEP, via an injected
 * parameter -- see that file for why `sim/` invokes it without importing it).
 *
 * `raw` is the pilot's held command for the whole frame (`World.controls`);
 * `state` is the aircraft as of the START of this step, i.e. what the pilot
 * was actually seeing when they gave that command. `dt` is always the fixed
 * step (`DT` in `src/sim/flight/model.ts`) in production; tests may vary it.
 * `altitudeHoldMemory` is optional and defaults to `NOT_HOLDING`, which is
 * indistinguishable from Task 1-3's identity stub -- see `AltitudeHoldMemory`
 * for why this parameter exists and is shaped the way it is.
 *
 * Stack order is fixed: stall limiter, then auto-rudder, then altitude hold.
 * The limiter bounds the pilot's pitch command first, so every later stage
 * reacts to a command the wing can actually sustain rather than the pilot's
 * raw, possibly-illegal one. Auto-rudder runs next and coordinates the turn
 * implied by THAT bounded attitude, not the pre-limiter one. Altitude hold
 * runs last, trimming whatever pitch authority the first two stages left
 * over -- it is a correction on top of their result, not a competing vote,
 * so it can never fight a decision either of them already made. Any other
 * order lets a later stage silently undo an earlier one's correction. This is
 * why altitude hold ADDS its correction to `controls.pitch` rather than
 * replacing it (see that function's own comment): replacing would throw away
 * a stall-recovery command the limiter already decided was necessary, the
 * exact failure this ordering comment warns about.
 */
export function applyAssists(
  state: AircraftState,
  spec: AircraftSpec,
  raw: Controls,
  dt: number,
  enabled: AssistSettings,
  altitudeHoldMemory: AltitudeHoldMemory = NOT_HOLDING,
): Controls {
  let controls = raw
  controls = enabled.stallLimiter ? stallLimiter(state, spec, controls, dt) : controls
  controls = enabled.autoRudder ? autoRudder(state, spec, controls, dt) : controls
  controls = enabled.altitudeHold
    ? altitudeHold(state, spec, controls, raw, dt, altitudeHoldMemory)
    : controls
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
 * Inside the boundary the limiter is passive: the pilot's command is clamped
 * into `[lower, upper]`, which both sit outside `[-1, 1]` while the margin is
 * large, so a legal command passes through byte-for-byte and ordinary
 * manoeuvring is untouched. With this aircraft's content the onset is
 * `alphaCrit - stallLimiterSeconds * fullBackStickRate`: full back stick is
 * unrestricted below 11.0 degrees of alpha wherever the rate authority is
 * saturated (at or above 103 m/s at sea level), and below more than that when
 * slower, because a smaller achievable rate buys the same margin more stick --
 * measured 2026-09-13 at sea level, 12.06 degrees at 90 m/s and 13.42 at 70;
 * at the 2000 m the tests spawn at, 13.79 at 70 m/s.
 *
 * OUTSIDE the boundary it is not passive, and it will fight the pilot in
 * either direction. Once |alpha| exceeds alphaCrit the relevant bound crosses
 * zero, so the clamp does not merely reduce the pilot's command, it reverses
 * it: at +45 degrees of alpha a pilot holding full BACK stick gets -1.000, and
 * at -45 degrees a pilot holding full FORWARD stick gets +1.000. The second
 * one is deliberate, not a side effect of the mirror -- recovering from an
 * inverted departure is the same physics as recovering from an upright one,
 * and a limiter that declined to command nose-up would leave the negative-alpha
 * stall with no recovery at all. Both are asserted in
 * `tests/assists/stallLimiter.test.ts`. (An earlier revision of this comment
 * claimed the limiter "never adds nose-up". It was wrong, it contradicted the
 * mirror described three paragraphs above, and nothing in the suite arbitrated
 * between them -- the review found that clamping the bound to match the
 * sentence left all 399 tests green. The mirrored test below exists so that
 * cannot recur.)
 *
 * It also cannot prevent every stall -- alpha rises when the flight path falls
 * away in a zoom, and no pitch command stops that -- so `isStalled` remains
 * reachable with the assist on. What it guarantees is that the PILOT'S PITCH
 * COMMAND is not what took the wing past the boundary, and that the command
 * handed to the simulation is asking for recovery at every tick inside the
 * band where recovery is possible.
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

/** Standard gravity, m/s^2. Duplicated from `sim/flight/model.ts` and
 *  `sim/autopilot.ts`, which already each carry their own copy of this exact
 *  literal rather than exporting it -- following that existing precedent
 *  rather than being the first module here to export a physics constant. */
const G = 9.80665

/**
 * Plan 3 Task 4: altitude hold. Not "combat trim" (master spec's name) -- see
 * this file's header comment on `AssistSettings` for why: in this rate-command
 * model a released stick already holds attitude for free, so what a real
 * pilot's trim wheel would be fighting here is the FLIGHT PATH drifting as
 * speed changes, not attitude, and this is named for what it actually does.
 *
 * Stands down completely -- returns `controls` untouched -- unless
 * `memory.heldAltitudeM` is set AND the pilot's own pitch is centred. The
 * second check is not redundant with the first: `memory` is whatever the
 * caller last threaded through `nextAltitudeHoldMemory`, and a caller that
 * skipped a tick (or a test exercising this function directly, as several
 * below do) could hand it a captured altitude alongside a `raw.pitch` that
 * has since gone non-zero. Reading `raw` here rather than trusting the
 * memory alone is what makes "yields to pilot pitch input" a guarantee of
 * THIS function, provable by calling it directly, rather than a property
 * that only holds if some other caller kept its bookkeeping consistent.
 *
 * Checked against `raw`, the ORIGINAL pilot command, not `controls` -- the
 * value already run through the stall limiter and (a no-op for pitch)
 * auto-rudder. The two differ exactly when the limiter has forced a
 * non-neutral pitch onto an aeroplane whose pilot is holding the stick dead
 * centre (alpha already at or past its boundary). That is deliberately NOT
 * "centred" for this assist's purposes: capturing a hold target mid-stall-
 * recovery, while the limiter is actively fighting to bring alpha back, is
 * not a moment with a meaningful "altitude the pilot wants" to remember.
 *
 * The mechanism, once engaged, is feed-forward plus a two-loop proportional
 * correction -- structurally the same idea as `sim/autopilot.ts`'s
 * `holdLevelFlight` (that function's own doc comment: "the pitch attitude
 * needed for a given flight-path angle is that angle plus the angle of
 * attack that trims lift against weight... inverting it here means the loop
 * is already at the right attitude before the error term does anything").
 * This is prior art, cited rather than reused wholesale, for two reasons
 * neither of which is "not invented here":
 *  1. `holdLevelFlight` also drives ROLL to wings-level. This assist must
 *     not fight a banked turn the pilot is holding -- altitude hold is a
 *     PITCH-only correction, added on top of whatever roll/yaw the earlier
 *     stages and the pilot already decided.
 *  2. Its gains (`PITCH_GAIN`, `VS_GAIN`, `ALT_GAIN`) are that function's own
 *     doc comment's words: "deliberately stiff -- the autopilot exists so a
 *     measurement harness can fly the aeroplane repeatably, not so it flies
 *     comfortably." A pilot-facing assist wants the opposite feel, and
 *     Global Constraints forbid inventing a tuning constant in code -- so
 *     this needs its OWN content-sourced knob, the same as
 *     `autoRudderGainPerDeg` needed its own rather than borrowing
 *     `weathercockSeconds`.
 *
 * Derivation. `clTrim` is the lift coefficient that balances weight at the
 * current dynamic pressure (`liftN = q * wingArea * cl` inverted against
 * `mass * G`), and `alphaTrim` inverts `aero.ts`'s linear lift curve to the
 * angle of attack that produces it -- both exactly `holdLevelFlight`'s own
 * formulas, algebra pulled from `spec.aero`/`spec.mass` directly rather than
 * from an independently-tunable curve, so unlike `commandedBodyRates` there
 * is no authority curve here that could drift out of sync by being
 * duplicated. `errorM` is the altitude still to close; treating it as a
 * target CLIMB RATE closed over one time constant (`errorM / tau`) and that
 * climb rate as a target FLIGHT-PATH ANGLE at the current airspeed
 * (`asin(vsTarget / v)`) gives a target body pitch angle,
 * `alphaTrim + gamma`, exactly `holdLevelFlight`'s `command` minus its
 * separate `VS_GAIN` rate-error term (folded away, not forgotten -- see
 * below). The SAME tau then closes the gap between that target attitude and
 * the aeroplane's actual one (`asin(forward.y)`, `bodyAxes`'s definition of
 * pitch) into a desired pitch RATE, which is converted to a stick fraction by
 * dividing by the rate full back stick would actually command in this exact
 * state (`commandedBodyRates`, the same technique the stall limiter uses and
 * the same reason: authority scales with dynamic pressure, so a private
 * copy of that curve would silently disagree with the simulation the moment
 * either was tuned).
 *
 * Reusing one tau for both loops (instead of `holdLevelFlight`'s separate
 * `ALT_GAIN` and `VS_GAIN`) is what keeps this to a single content constant.
 * It is not a free simplification -- a pure position-error term feeding a
 * rate command has no term standing in for the aeroplane's OWN current
 * attitude, and a triple-integrator plant (pitch rate -> pitch angle ->
 * vertical acceleration -> climb rate -> altitude) fed back on position and
 * climb rate alone, with no attitude term, is structurally unstable for any
 * gain (its closed-loop characteristic polynomial is missing its middle
 * term). Feeding back the aeroplane's actual pitch ATTITUDE (`pitchNowRad`
 * below) supplies exactly that missing term, which is why this bothers to
 * compute a target ATTITUDE rather than a target rate directly from the
 * altitude error.
 *
 * Measured, not assumed (`/tmp/althold_probe.ts`, 2026-09-13, node v22.22.1,
 * this aircraft's content, `step()` end to end -- not the idealised plant
 * above): hands off, `pitch = 0` held for 60 s from level cruise, altitude
 * drifts by a wide margin exactly as the brief says --
 * -236 m at 70 m/s / 50% throttle, -167 m at 90 m/s / 70%, -77 m at 130 m/s
 * full throttle, -19 m at 180 m/s. With this assist engaged and
 * `altitudeHoldSeconds = 3`, the same six conditions (including full and
 * partial throttle at the same speeds) finish within 0.4 m of the captured
 * altitude, worst-case excursion during the 60 s under 11 m. Re-run from a
 * captured altitude with the aeroplane already climbing or descending at
 * capture (+/-20 to 40 m/s of vertical speed, 46-150 m/s true airspeed) stays
 * within 16 m worst case. tau = 1 tightens this further (worst excursion
 * under 4 m) at the cost of a visibly twitchier stick; tau = 3 was chosen as
 * the looser of the two candidates that still keeps every measured case
 * comfortably inside a few percent of the starting altitude, leaving room
 * for Task 6 (flying it) to retune either direction. What tau CANNOT do:
 * at zero throttle the aeroplane cannot hold any altitude at all -- lift
 * demand rises as speed bleeds off, which bleeds more speed, and the probe's
 * idle-throttle case departs (2277 m of drift in 120 s) exactly the way
 * `holdLevelFlight`'s own doc comment says its command "saturates and the
 * aeroplane sinks" once the wing cannot deliver the demanded angle of
 * attack. That is correct behaviour, not a bug this assist could fix, and
 * `tests/assists/altitudeHold.test.ts` asserts it honestly rather than
 * claiming a guarantee that does not hold.
 */
function altitudeHold(
  state: AircraftState,
  spec: AircraftSpec,
  controls: Controls,
  raw: Controls,
  _dt: number,
  memory: AltitudeHoldMemory,
): Controls {
  const target = memory.heldAltitudeM
  if (target === null || !isPitchCentred(raw)) return controls

  const v = airspeed(state)
  // Mirrors `holdLevelFlight`'s own guard and its stated reason: below 1 m/s
  // the trim inversion divides by a vanishing dynamic pressure and the
  // flight-path angle is not defined.
  if (v < 1) return controls

  const mass = massKg(spec, state)
  const q = 0.5 * densityAt(state.position.y) * v * v
  const clTrim = (mass * G) / (q * spec.geometry.wingAreaM2)
  const alphaTrim = (clTrim - spec.aero.clAtZeroAlpha) / spec.aero.clSlopePerRad

  const tau = spec.rates.altitudeHoldSeconds
  const errorM = target - state.position.y
  const vsTargetMps = errorM / tau
  const gammaRad = Math.asin(clampFinite(vsTargetMps / v, -1, 1))
  const targetPitchRad = alphaTrim + gammaRad

  const forward = qRotate(state.attitude, v3(1, 0, 0))
  const pitchNowRad = Math.asin(clampFinite(forward.y, -1, 1))
  const desiredPitchRateRadPerS = (targetPitchRad - pitchNowRad) / tau

  const fullBackStickRate = commandedBodyRates(spec, state, {
    pitch: 1,
    roll: 0,
    yaw: 0,
    throttle: 0,
  }).z
  // No separate "no pitch authority" guard, unlike the stall limiter's
  // otherwise-identical one just above: that one clamps `controls.pitch`
  // BETWEEN two bounds, so an unguarded 0/0 there would collapse both bounds
  // to 0 and force the pilot's command to exactly 0 regardless of what they
  // held (the stall limiter's own guard exists to prevent exactly that,
  // proven by that file's "no pitch authority" test). This stage only ever
  // ADDS a correction, so the equivalent failure -- `fullBackStickRate` at
  // or below 0, which the schema's `positive` rate fields and a `q >= 0`
  // dynamic pressure mean cannot happen for any validated spec, but is worth
  // being deliberate about -- degrades to `correction = clampFinite(NaN, -1,
  // 1) = 0`, i.e. no correction at all, which is already the right answer.
  const correction = clampFinite(desiredPitchRateRadPerS / fullBackStickRate, -1, 1)
  // Additive, not a replacement -- see `applyAssists`'s stack-order comment.
  // Adding to whatever the stall limiter already left in `controls.pitch`
  // (typically the pilot's own centred 0, but not always) means a
  // stall-recovery command already in flight is nudged, never discarded.
  return { ...controls, pitch: clampFinite(controls.pitch + correction, -1, 1) }
}
