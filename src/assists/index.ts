import type { AircraftSpec } from '../sim/flight/schema.js'
import type { AircraftState, Controls } from '../sim/flight/state.js'
import type { Assist } from '../sim/loop.js'
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
 * The protective assists default to `true`: one a pilot has to remember to
 * turn on is one most pilots never do, and master spec's stated intent is a
 * beginner-friendly default with an expert opt-out, not the reverse.
 *
 * `altitudeHold` is the exception, off since 2026-09-15. It is not protective
 * -- it flies the airplane somewhere -- and at zero thrust it trades speed
 * for altitude while the stall limiter prevents the departure that would end
 * it, so a page-load Hellcat with the engine off mushed along level for as
 * long as you watched. Mark flew exactly that and reported an airplane that
 * "seems like it would fly forever". Measured before the change: 1.04 m lost
 * in 30 s from 2000 m. `tests/render/frameAssists.test.ts` now flies the
 * page-load condition and requires a real descent, so this cannot silently
 * return. `H` still turns it on, as it always did.
 */
export type AssistSettings = {
  readonly stallLimiter: boolean
  readonly autoRudder: boolean
}

/** Both assists on. Both are protective; there is no longer a non-protective
 *  one to default off (see `AssistSettings`). */
export const DEFAULT_ASSIST_SETTINGS: AssistSettings = {
  stallLimiter: true,
  autoRudder: true,
}




/**
 * One flight's worth of assist stack as the reducer `advance` wants: memory in,
 * `{ controls, memory }` out, once per fixed step. The only thing a real caller
 * needs in order to get the altitude-hold memory right.
 *
 * This is what `createAssistRunner` was (Plan 3 Task 5), minus the mutable
 * cell. The pairing invariant it exists to enforce is unchanged and still
 * written exactly once, here: the memory is advanced BEFORE the stack runs,
 * from the same `state` and `raw`, and neither is a parameter a caller gets to
 * choose -- they are whatever `advance` passes in, once per step, by
 * construction. What is gone is the channel the memory used to leave by.
 * `advance` now carries it in `World` (see `Assist` in src/sim/loop.ts), so
 * this closes over `enabled` -- fixed for the flight -- and over nothing that
 * changes.
 *
 * Closing over nothing mutable is the point, not incidental tidiness: two
 * airplanes may share one `assistFor` result and cannot thereby share a
 * captured altitude, which `tests/assists/worldMemory.test.ts` asserts by
 * flying two of them through a single one.
 *
 * `enabled` being fixed for the returned function's lifetime is what makes a
 * mid-flight toggle a clean per-frame boundary: `nextFrameState` builds a new
 * one each frame from that frame's settings, so a flag cannot change between
 * two steps of one frame.
 */
export const assistFor = (enabled: AssistSettings): Assist<undefined> => {
  return (state, spec, raw, dt) => ({
    controls: applyAssists(state, spec, raw, dt, enabled),
    memory: undefined,
  })
}

/**
 * How the stack arbitrates the pitch axis: a BUDGET, narrowed and never
 * widened, rather than a growing collection of inter-stage flags.
 *
 * `{ lower, upper }` is the range of `Controls.pitch` the stack is still
 * willing to let a LATER stage produce. It starts at the pilot's full legal
 * control range and each stage may only narrow it, so the command that comes
 * out of `applyAssists` is inside the budget by construction -- which is the
 * property `tests/assists/index.test.ts`'s alpha sweep asserts, and the one
 * that was unassertable before this type existed.
 *
 * Why this replaces the two arguments it does (final whole-branch review, C1).
 * Task 4 fixed altitude hold overriding the stall limiter twice, first with a
 * `limiterEngaged` boolean and then with a nullable `limiterBounds` pair, and
 * BOTH fixes were inert in exactly the region that matters most. Past
 * `DEPARTED_ALPHA_RAD` the limiter stands down, so it changes nothing
 * (`limiterEngaged` false) and publishes no bound (`limiterBounds` null), and
 * altitude hold then ran with no bound at all. Measured 2026-09-13 with
 * shipped `DEFAULT_ASSIST_SETTINGS`, stick centred, 90 m/s, holding an
 * altitude 500 m above the airplane (`.superpowers/probes/c1_probe.ts`):
 *
 *     alpha      limiter only     all three assists
 *      89 deg      -1.0000            -1.0000
 *      91 deg       0.0000            +1.0000
 *     135 deg       0.0000            +1.0000
 *
 * -- full nose-up while the wing is gone. End to end from a departed state at
 * 120 degrees of alpha, hands off, 60 s: 126 ticks past 90 degrees with
 * altitude hold off against 801 with it on, and the first unstalled tick at
 * 2.18 s against 5.35 s. The assist was extending the departure it could not
 * see.
 *
 * A third boolean would have been the third instance of one mistake. A budget
 * cannot fail that way, because "the wing is gone, no assist may vote on
 * pitch" is expressible in it -- a budget narrowed to a single value, the
 * pilot's own command -- where a `null` bound could only say "there is no
 * bound here", which its one caller read, not unreasonably, as "anything
 * goes". (The comment that blessed that reading is gone with it.)
 */
export type PitchAuthority = { readonly lower: number; readonly upper: number }

/** What the budget starts at: the pilot's full legal control range.
 *  `Controls.pitch` is documented as [-1, 1] in `sim/flight/state.ts`, so this
 *  is that range restated, not a limit invented here. */
const FULL_PITCH_AUTHORITY: PitchAuthority = { lower: -1, upper: 1 }

/**
 * Narrow to the intersection with `[lower, upper]`, WHEN the two overlap: then
 * this cannot widen, because `Math.max` on the lower bound and `Math.min` on
 * the upper cannot move either outward.
 *
 * When they do not overlap there is no subset of both to return, so the
 * conflict has to be DECIDED rather than intersected, and the bound being
 * applied wins: it is the later and more specific of the two, computed from the
 * state the airplane is actually in, and in the shipped stack it is the stall
 * limiter's -- the one keeping the wing attached. The result is the single point
 * of `[lower, upper]` NEAREST the budget it replaces.
 *
 * Two caveats, both of which this comment previously got wrong or left out.
 *
 * FIRST, "cannot widen" is false on that branch, and the qualifier above is
 * there because of it: the point returned lies outside `a` whenever the two
 * ranges are disjoint, so the published budget is NOT a subset of the incoming
 * one. That is inherent rather than an oversight -- honouring both an incoming
 * `[0.25, 0.25]` and a bound of `[-1, 0]` is impossible, one of them has to
 * lose -- but it means the invariant callers may rely on is "the budget is
 * non-empty and the command is inside it", NOT "each budget is a subset of the
 * last". `tests/assists/stallLimiter.test.ts` asserts subset-ness only where
 * the ranges overlap, and pins the decided point where they do not.
 *
 * SECOND, the alternative to deciding is an empty budget, and the reason that
 * is worse is NOT that `withinAuthority` would answer arbitrarily per value: it
 * always returns `upper`, for every input, since `Math.min(upper, Math.max(
 * lower, p))` with `lower > upper` is `upper` whatever `p` is (measured
 * 2026-09-13: `[0.25, 0]` returns 0 from +1, from -1 and from 0.1; an earlier
 * revision of this comment, and of the design doc, claimed "upper or lower
 * depending on which side the value came from", which is simply untrue). The
 * real objection is that the answer would then come from the ORDER of a `min`
 * and a `max` inside a helper -- an implementation detail with no opinion about
 * airplanes -- rather than from a decision anybody wrote down, and that no
 * caller could state a true invariant about a budget that cannot contain
 * anything.
 *
 * Unreachable as of 2026-09-13, and measured so rather than asserted: the
 * shipped stack has exactly one stage that narrows to a RANGE, and it is only
 * ever handed `FULL_PITCH_AUTHORITY` (`runStack`'s departed collapse makes
 * `stallLimiterBounds` return `null`, so the narrowing stage returns before
 * reaching this), so nothing can disagree with it and the branch below never
 * runs -- reverting it leaves the whole suite green. It is written because the
 * stage guard test for design open item 3 is the first caller that CAN hand
 * this function a conflict, and it found the incoherent-claim case immediately.
 * `decided` is pinned by that test from both sides, after review 2026-09-13
 * found that replacing it with `lower`, with `upper` or with `(lower + upper) /
 * 2` left all 451 tests green, the suite as it stood before this test existed --
 * the same shape as this file's own "never adds
 * nose-up" history, where a sentence nothing arbitrated turned out to be false.
 */
const narrowAuthority = (a: PitchAuthority, lower: number, upper: number): PitchAuthority => {
  const lo = Math.max(a.lower, lower)
  const hi = Math.min(a.upper, upper)
  if (lo <= hi) return { lower: lo, upper: hi }
  const decided = Math.min(upper, Math.max(lower, a.lower))
  return { lower: decided, upper: decided }
}

/** The only way a stage is allowed to put a value on the pitch axis. */
const withinAuthority = (a: PitchAuthority, pitch: number): number =>
  Math.min(a.upper, Math.max(a.lower, pitch))

/** Narrow to a single command -- "this exact value and nothing else", which is
 *  how a stage says no later stage may vote. The value is clamped into the
 *  budget it narrows before becoming the new budget, so this cannot widen one
 *  either, including when a caller hands in a `Controls.pitch` outside the
 *  [-1, 1] its own type documents. */
const narrowToCommand = (a: PitchAuthority, pitch: number): PitchAuthority => {
  const p = withinAuthority(a, clampFinite(pitch, -1, 1))
  return { lower: p, upper: p }
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
 * `raw` is the pilot's held command for the whole frame (the aircraft
 * entity's `controls`);
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
 * runs last, and gets whatever pitch authority the stages before it have
 * left in the budget -- see `PitchAuthority`, which is how "whatever is left
 * over" is now written down rather than implied.
 *
 * That is a correction to this comment, not just to the code, and it is the
 * third one on this exact question. An early revision claimed altitude hold
 * "can never fight a decision either of them already made" and added its
 * correction to `controls.pitch` on that basis; measured at alpha 17.5
 * degrees against a 15.5-degree critical (90 m/s, stick centred, held
 * altitude 2500 m), the limiter alone commands -0.7085 and the sum was
 * +0.2915 -- the recovery command reversed to nose-up while stalled. Task 4
 * fixed that with a `limiterEngaged` stand-down, then found the stand-down
 * did not cover a centred pilot's already-legal 0 sitting inside a bound of
 * `[0, 1]` at alpha `-alphaCritRad` while this stage wanted -1, and added a
 * clamp into the limiter's bound. The final review then found BOTH inert
 * past `DEPARTED_ALPHA_RAD`, where the limiter changes nothing and has no
 * bound to publish -- see `PitchAuthority` for that measurement.
 *
 * The through-line in all three is that altitude hold's correction is
 * computed from the ALTITUDE ERROR, which has no idea the wing is stalled and
 * no business voting on the pitch axis while it is. What changed at the third
 * fix is that this is no longer enforced by asking the limiter questions
 * ("did you engage?", "have you a bound?") whose answers go blank exactly
 * when the airplane is in the most trouble. Instead every stage narrows one
 * budget, and the departed case narrows it to the pilot's own command before
 * any stage runs at all.
 */
export function applyAssists(
  state: AircraftState,
  spec: AircraftSpec,
  raw: Controls,
  dt: number,
  enabled: AssistSettings,
): Controls {
  return runStack(state, spec, raw, dt, enabled).controls
}

/**
 * `applyAssists`, plus the pitch-authority budget the stack ended with.
 *
 * Not a second implementation and not a diagnostic copy of one:
 * `applyAssists` IS this function's `.controls`, so the budget a test reads
 * here is the same object the stack actually clamped against, and the two
 * cannot drift. It exists because "the final command lies inside the
 * authority the stack claims" is the assertion that would have caught C1,
 * and there was previously no way for a test to see the claim at all -- the
 * old protocol's answer, past 90 degrees of alpha, was a `null` that meant
 * "no claim", which nothing can be asserted against.
 */
export function applyAssistsWithAuthority(
  state: AircraftState,
  spec: AircraftSpec,
  raw: Controls,
  dt: number,
  enabled: AssistSettings,
): { controls: Controls; pitchAuthority: PitchAuthority } {
  return runStack(state, spec, raw, dt, enabled)
}

function runStack(
  state: AircraftState,
  spec: AircraftSpec,
  raw: Controls,
  dt: number,
  enabled: AssistSettings,
): { controls: Controls; pitchAuthority: PitchAuthority } {
  // The pitch axis is sanitised into the range `Controls.pitch` documents
  // before any stage or any budget sees it -- design open item 2, closed
  // 2026-09-13.
  //
  // The item: handed a raw pitch of +5, -5 or NaN, this function returned that
  // value unchanged (on the paths where no stage rewrote it) while publishing
  // a budget of [1, 1], [-1, -1] or [0, 0] -- `narrowToCommand` clamps, the
  // command did not, so the budget said "the command is exactly 1" about a
  // command of 5. Nothing leaked, because the value reached `step` exactly as
  // it would have before the budget existed, but a published claim that is
  // false about the value it is published with is this project's recurring
  // defect and is treated as one here.
  //
  // Of the two available fixes -- clamp the input, or widen the claim to admit
  // the illegal value -- this is the first, for three reasons. Widening is not
  // available without destroying the type: a budget that has to contain 5 is
  // no longer inside the pilot's legal range, so "narrowed and never widened
  // beyond [-1, 1]", the property the whole arbitration rests on and the one
  // the sweep asserts, would have to go. Clamping is also behaviour-preserving
  // through the simulation rather than merely defensible: `commandedBodyRates`
  // (src/sim/flight/model.ts) puts every control channel through the SAME
  // `clampFinite(n, -1, 1)`, so 5 was already flown as 1 and NaN as 0 -- this
  // moves that clamp one stage earlier, where the claim is made, and
  // `tests/assists/index.test.ts` asserts the resulting state is identical
  // step-for-step. And it makes the stack's own contract total: `Controls` in,
  // legal `Controls` out, for every input a caller can construct.
  //
  // `raw` itself is deliberately NOT re-sanitised for the two GATES that read
  // it (`isPitchCentred` here and in `nextAltitudeHoldMemory`): NaN means a
  // malformed input event, not a centred stick, and mapping it to 0 before
  // those gates would engage altitude hold and capture a held altitude off a
  // broken input. The sanitised value is what goes on the AXIS; the pilot's
  // literal command is what answers "did the pilot ask for something".
  const rawPitch = clampFinite(raw.pitch, -1, 1)
  let controls: Controls = rawPitch === raw.pitch ? raw : { ...raw, pitch: rawPitch }
  // The budget starts at the pilot's full legal range -- UNLESS the wing is
  // gone, in which case it starts collapsed onto the pilot's own command and
  // no assist gets a vote on pitch for the rest of this tick.
  //
  // This sits here, before any stage, rather than inside the stall limiter,
  // because departure is a fact about the STATE and not about that stage's
  // opinion: a pilot who has switched the limiter off has opted out of having
  // their pull bounded, not into having altitude hold fly the airplane while
  // it tumbles. `isDeparted` is the same predicate `stallLimiterBounds` stands
  // down on, called rather than re-stated, so the two cannot disagree about
  // where the boundary is.
  let pitchAuthority = isDeparted(state)
    ? narrowToCommand(FULL_PITCH_AUTHORITY, rawPitch)
    : FULL_PITCH_AUTHORITY

  if (enabled.stallLimiter) {
    const limited = stallLimiter(state, spec, controls, dt, pitchAuthority)
    controls = limited.controls
    pitchAuthority = limited.authority
  }
  // Auto-rudder narrows nothing: it reads sideslip and writes `yaw`, and has
  // no opinion about the pitch axis to spend.
  controls = enabled.autoRudder ? autoRudder(state, spec, controls, dt) : controls
  return { controls, pitchAuthority }
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
 * rate by the remaining margin" -- is about an airplane still flying roughly
 * forwards. Past 90 degrees it is not: the airplane is departed, `alpha` is
 * an atan2 running to +/-180 (see `angleOfAttack`, and `sim/aero.ts`'s note
 * that 40.8% of soak steps sit past 90.5 degrees), and the margin term would
 * simply saturate at full nose-down and PIN it there -- taking pitch authority
 * away from a pilot who needs all of it to fly out of a departure. An assist
 * that cannot help must not interfere.
 */
const DEPARTED_ALPHA_RAD = Math.PI / 2

/** Written once and called from both places that need it -- `runStack`, which
 *  collapses the pitch budget onto the pilot's own command here, and
 *  `stallLimiterBounds`, which stands down here. Negated rather than written
 *  `>=` so a NaN alpha counts as departed: an assist that cannot tell where
 *  the wing is must not vote on it. */
const isDeparted = (state: AircraftState): boolean =>
  !(Math.abs(angleOfAttack(state)) < DEPARTED_ALPHA_RAD)

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
 *     allowed pitch rate = (alphaCrit - alpha) / max(stallLimiterSeconds, dt)
 *
 * -- the margin, spent no faster than one time constant (or one step, if the
 * caller's step is the longer of the two -- see `stallLimiterBounds` for why
 * that `max` is the limiter's own business and not its caller's). As alpha approaches
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
/**
 * The stall limiter's own `[lower, upper]` pitch-command bound at this state,
 * shared with `altitudeHold` (Task 4 fix round 2) rather than duplicated --
 * exactly the reasoning this file already applies to `commandedBodyRates`
 * itself: a private second copy of this formula could silently disagree with
 * the limiter's actual bound the moment either was retuned, which is the
 * class of bug fix round 2 exists to close.
 *
 * `null` in the same two cases `stallLimiter` itself stands down in: departed
 * past 90 degrees (`DEPARTED_ALPHA_RAD`), or no pitch authority to bound
 * anything with. Both mean "this function has no bound to contribute".
 *
 * An earlier revision of this paragraph went on to say that "a caller that
 * treats `null` as 'anything goes' is using this correctly". That was false
 * and it was load-bearing: the only caller did exactly that, and past 90
 * degrees of alpha it let altitude hold command full nose-up on a departed
 * wing (the numbers are on `PitchAuthority`). The two cases are not one case
 * and the caller now tells them apart -- see `stallLimiter` below, and note
 * that the departed one is no longer this function's news to break, because
 * `runStack` has already collapsed the budget onto the pilot's own command
 * before this is ever called.
 *
 * `dt` is real here, and was ignored until Task 5. The derivation spends the
 * remaining margin over one time constant, so a STEP longer than that time
 * constant spends more than the whole margin in one go and sails past the
 * boundary the limiter exists to defend -- the bound is a rate, and a rate is
 * only a bound on the next step if the step is shorter than the interval the
 * rate was computed for. `Math.max(tau, dt)` is the whole fix: at any dt <=
 * tau (every production step, and every pre-Task-5 test, which all pass `DT` =
 * 1/60 against a 0.15 s tau) it is exactly the old expression, byte for byte;
 * at dt > tau it rations the margin over the step actually being taken
 * instead. Task 3's implementer and its re-reviewer both flagged this
 * independently: `src/sim/flight/schema.ts`'s `stallLimiterSeconds` comment
 * asserts "the pilot's command alone cannot cross the boundary at any tau >=
 * DT", and until this that guarantee belonged to whoever called the limiter
 * rather than to the limiter, which is a guarantee nobody owns. Task 5 is the
 * task that first puts a real caller (`nextFrameState`) in front of it, so it
 * is the task that owes it.
 *
 * A non-finite or non-positive `dt` falls back to `tau` alone rather than
 * poisoning the bound: `Math.max(tau, NaN)` is `NaN`, which would make every
 * bound `NaN`, which `clampFinite` would turn into a hard 0 -- i.e. pinning
 * the pilot's pitch command to exactly zero, the precise failure the "no pitch
 * authority" guard below exists to prevent.
 */
function stallLimiterBounds(
  state: AircraftState,
  spec: AircraftSpec,
  dt: number,
): { lower: number; upper: number } | null {
  if (isDeparted(state)) return null
  const alpha = angleOfAttack(state)

  const fullBackStickRate = commandedBodyRates(spec, state, {
    pitch: 1,
    roll: 0,
    yaw: 0,
    throttle: 0,
  }).z
  // Also catches a NaN, which `>` is false for: `commandedBodyRates` cannot
  // produce one from a validated spec, but returning "no bound" is the right
  // answer either way -- an assist that cannot compute a bound has no
  // business replacing a bound with a guess.
  if (!(fullBackStickRate > 0)) return null

  const limit = alphaCritRad(spec)
  // See this function's doc comment: the margin is rationed over one time
  // constant OR one step, whichever is longer, so the bound is a real bound on
  // the step about to be taken rather than only on a step at most `tau` long.
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0
  const tau = Math.max(spec.rates.stallLimiterSeconds, step)
  const asCommand = (marginRad: number) => clampFinite(marginRad / tau / fullBackStickRate, -1, 1)
  // upper >= lower always: they differ by 2 * limit / (tau * rate) > 0 before
  // clamping, and clamping both into [-1, 1] preserves the order.
  return { upper: asCommand(limit - alpha), lower: asCommand(-limit - alpha) }
}

/**
 * The limiter as a stage: the command it hands on, and what it leaves of the
 * pitch budget for the stages after it.
 *
 * Three outcomes, and telling them apart is the whole of finding C1:
 *
 *  - No bound and the wing is DEPARTED. Nothing is narrowed here, because
 *    `runStack` narrowed the budget to the pilot's own command before this
 *    stage ran. The pilot's command comes back (see `DEPARTED_ALPHA_RAD`: a
 *    pilot flying out of a departure needs all of the axis), and so does the
 *    budget, so no later stage can spend what this one declined to take.
 *  - No bound because there is no pitch AUTHORITY. Genuinely nothing to
 *    narrow: the command cannot move alpha at all, so no vote on this axis
 *    changes anything. Nothing downstream can exploit it either -- zero pitch
 *    authority means zero dynamic pressure means zero airspeed
 *    (`ratesFromDynamicPressure` scales linearly with q, and density is never
 *    zero), and altitude hold's own `v < 1` guard already stands it down
 *    there.
 *
 *    Both no-bound paths still put their value on the axis through the budget
 *    rather than beside it, which is why they are not a bare
 *    `return { controls, authority }`. On both, the value that comes out is
 *    provably the one that went in as of 2026-09-13: departed, `runStack` has
 *    already collapsed the budget onto that exact command; unauthorised,
 *    nothing has narrowed the budget at all, so it is still [-1, 1] and the
 *    command inside it. The clamp is there so that "what this stage returns is
 *    inside what this stage publishes" is true of the FUNCTION rather than true
 *    of one caller's ordering -- writing these as pass-throughs was found by
 *    this stage's own guard test (design open item 3), which handed the
 *    departed path a budget of [-0.4, 0.4] and got the pilot's raw +1 back
 *    alongside it.
 *  - A real bound. The budget narrows to it. And if the limiter had to CHANGE
 *    the pilot's value to respect it, the budget narrows further, to the
 *    single value the limiter chose: the axis is now spent on recovery, and
 *    an airplane near departure needs the nose down, so even the least-bad
 *    nose-up the bound would still permit is the wrong trade at that moment
 *    (Task 4's ruling, unchanged -- this is that stand-down, expressed as a
 *    budget instead of as a boolean handed to the stage that must honour it).
 *    "Changed the value" is read from this stage's own before and after, not
 *    re-derived from alpha, so it cannot disagree with the bound it came from.
 *
 * The clamp goes through `withinAuthority` on the ALREADY-NARROWED budget
 * (`bounded`), not into `bounds` alone -- design open item 3, closed
 * 2026-09-13. This stage is the only place in the file that puts a value on
 * the pitch axis without consulting the budget it was handed, and the budget
 * is the thing every other stage is made to obey; a stage that narrows ahead
 * of this one would have been silently overruled by it. It is a behavioural
 * no-op today and measurably so: the incoming budget is `FULL_PITCH_AUTHORITY`
 * on every reachable path (`runStack`'s only narrowing-before-this-stage is
 * the departed collapse, and `stallLimiterBounds` returns `null` on exactly
 * that predicate, so this line is unreachable when it has fired), and
 * `stallLimiterBounds` already clamps both of its bounds into [-1, 1], so
 * intersecting them with [-1, 1] cannot move either. Verified by reverting
 * this one line: all 442 pre-existing tests stay green, which is why the guard
 * below is a direct call on the stage rather than a case through
 * `applyAssists`.
 *
 * Which is also why this one stage is exported while its two siblings are not:
 * a guard that "a narrowing stage inserted ahead of the limiter is honoured"
 * has no reachable input through `applyAssists` to work with -- the only
 * narrowing that exists today is the one whose predicate makes this code
 * unreachable -- so the only way to assert it is to hand the stage a narrowed
 * budget directly. The export exists for that test and has no production
 * caller other than `runStack` below.
 */
export function stallLimiter(
  state: AircraftState,
  spec: AircraftSpec,
  controls: Controls,
  dt: number,
  authority: PitchAuthority,
): { controls: Controls; authority: PitchAuthority } {
  const bounds = stallLimiterBounds(state, spec, dt)
  if (bounds === null) {
    return { controls: { ...controls, pitch: withinAuthority(authority, clampFinite(controls.pitch, -1, 1)) }, authority }
  }
  const bounded = narrowAuthority(authority, bounds.lower, bounds.upper)
  const pitch = withinAuthority(bounded, clampFinite(controls.pitch, -1, 1))
  return {
    controls: { ...controls, pitch },
    authority: pitch !== controls.pitch ? narrowToCommand(bounded, pitch) : bounded,
  }
}

/**
 * Plan 3 Task 2: the one Mark asked for after flying it. Roll into a turn,
 * level out, and the airplane keeps travelling diagonally instead of
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
 *     the airflow comes from the right, i.e. when the airplane is
 *     travelling to the right of where its nose points.
 * Combine them directly: if the airplane is travelling to the right of
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
  // for the same reason: a stationary airplane has no relative wind to be
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

