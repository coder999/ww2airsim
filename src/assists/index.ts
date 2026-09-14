import type { AircraftSpec } from '../sim/flight/schema.js'
import type { AircraftState, Controls } from '../sim/flight/state.js'
import type { Assist } from '../sim/loop.js'
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
 * `nextAltitudeHoldMemory` is the pure function that advances it, and it must
 * run once per fixed step, BEFORE `applyAssists`, on the same `state` and
 * `raw`. Task 5 made that pairing structural rather than a rule to remember:
 * `createAssistRunner` below is the one place it is written, `nextFrameState`
 * (src/render/frame.ts) is the production caller, and it threads the runner's
 * memory from frame to frame the way it already threads `World`. Tests that
 * predate it call the pair by hand, which is still legal and still the way to
 * test either half in isolation.
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
 * One flight's worth of assist stack, ready to hand to `advance` -- and the
 * only thing a real caller should need to get the altitude-hold memory right.
 *
 * Why this exists at all (Plan 3 Task 5). `applyAssists` and
 * `nextAltitudeHoldMemory` have a pairing invariant: the memory must be
 * advanced BEFORE the stack runs, with the SAME `state` and `raw`, exactly once
 * per fixed step. Until this, that invariant was prose in a doc comment plus a
 * hand-rolled two-liner copied into each test's own `fly` helper -- a rule
 * somebody has to remember at every call site, which is precisely the shape of
 * rule this project has already had go wrong. Here it is one function body
 * that cannot be called half-way: `state`, `raw` and the ordering are not
 * parameters a caller chooses, they are whatever `advance` passes in, once per
 * step, by construction.
 *
 * Why a closure over a mutable local rather than threading the memory the way
 * `nextFrameState` threads `World`. `advance` calls the assist once per fixed
 * STEP inside its own loop and has no channel to hand anything back: its
 * return type is `AdvanceResult`, `World` comes back out of it and a memory
 * does not. So the memory has to leave by the only route that exists -- a
 * variable the caller still holds a reference to after `advance` returns. The
 * tempting alternative, updating the memory once per FRAME outside `advance`,
 * is wrong twice over: it would capture from `world.aircraft` rather than from
 * the state the step actually ran on (those differ from the second step of a
 * multi-step frame onward, which is the whole reason `advance` calls the assist
 * inside its loop), and it could not clear mid-frame.
 *
 * This is NOT the "hidden mutable cell" `AltitudeHoldMemory`'s own doc comment
 * rules out, and the difference is the one that matters there: the cell is
 * created fresh by each `createAssistRunner` call and reachable only through
 * the returned object, so two callers -- two test files, or two aeroplanes once
 * Plan 5 exists -- cannot share one captured altitude unless they deliberately
 * share a runner. A module-level variable could not offer that.
 *
 * Lifetime: one runner per `advance` call (i.e. per frame in `nextFrameState`),
 * created with the memory the previous frame ended on and read back with
 * `memory()` afterward. `enabled` is fixed for a runner's lifetime, which is
 * what makes a mid-flight toggle a clean per-frame boundary rather than
 * something that can change between two steps of one frame.
 */
export type AssistRunner = {
  /** Exactly `sim/loop.ts`'s injected-assist shape, typed as that type so a
   *  change to it is a compile error here rather than a silent mismatch at the
   *  one call site that matters. */
  readonly assist: Assist
  /** The memory as of the last step run, for the caller to thread into the
   *  next frame's runner. Unchanged from what was passed in if no step ran. */
  readonly memory: () => AltitudeHoldMemory
}

export function createAssistRunner(
  enabled: AssistSettings,
  initialMemory: AltitudeHoldMemory = NOT_HOLDING,
): AssistRunner {
  let memory = initialMemory
  return {
    assist: (state, spec, raw, dt) => {
      // Altitude hold switched off does not merely stop correcting, it stops
      // REMEMBERING. Otherwise a pilot who turns it off at 2000 m, descends to
      // 1000 m with the stick centred (so nothing ever clears the memory) and
      // turns it back on would get an immediate full-authority climb command
      // back to an altitude they deliberately left -- a stale target
      // reasserting itself, which is exactly the failure
      // `nextAltitudeHoldMemory`'s "yield" rule exists to prevent for pitch
      // input. Re-enabling instead re-captures at the first centred step, the
      // same way releasing the stick does.
      memory = enabled.altitudeHold ? nextAltitudeHoldMemory(state, raw, memory) : NOT_HOLDING
      return applyAssists(state, spec, raw, dt, enabled, memory)
    },
    memory: () => memory,
  }
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
 * altitude 500 m above the aeroplane (`.superpowers/probes/c1_probe.ts`):
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
 * state the aeroplane is actually in, and in the shipped stack it is the stall
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
 * aeroplanes -- rather than from a decision anybody wrote down, and that no
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
 * 2` left all 453 tests green -- the same shape as this file's own "never adds
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
 * when the aeroplane is in the most trouble. Instead every stage narrows one
 * budget, and the departed case narrows it to the pilot's own command before
 * any stage runs at all.
 */
export function applyAssists(
  state: AircraftState,
  spec: AircraftSpec,
  raw: Controls,
  dt: number,
  enabled: AssistSettings,
  altitudeHoldMemory: AltitudeHoldMemory = NOT_HOLDING,
): Controls {
  return runStack(state, spec, raw, dt, enabled, altitudeHoldMemory).controls
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
  altitudeHoldMemory: AltitudeHoldMemory = NOT_HOLDING,
): { controls: Controls; pitchAuthority: PitchAuthority } {
  return runStack(state, spec, raw, dt, enabled, altitudeHoldMemory)
}

function runStack(
  state: AircraftState,
  spec: AircraftSpec,
  raw: Controls,
  dt: number,
  enabled: AssistSettings,
  altitudeHoldMemory: AltitudeHoldMemory,
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
  // their pull bounded, not into having altitude hold fly the aeroplane while
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
  controls = enabled.altitudeHold
    ? altitudeHold(state, spec, controls, raw, dt, altitudeHoldMemory, pitchAuthority)
    : controls
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
 * rate by the remaining margin" -- is about an aeroplane still flying roughly
 * forwards. Past 90 degrees it is not: the aeroplane is departed, `alpha` is
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
 *    an aeroplane near departure needs the nose down, so even the least-bad
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
 * `memory.heldAltitudeM` is set AND the pilot's own pitch is centred. Two
 * gates about the PILOT's intent; everything about what the aeroplane's
 * situation permits arrives instead as the `authority` budget, and the
 * correction this stage computes is put on the axis through it
 * (`withinAuthority`) rather than beside it.
 *
 *  - `memory.heldAltitudeM === null`: nothing captured, or the pilot has the
 *    stick (see `nextAltitudeHoldMemory`).
 *  - `!isPitchCentred(raw)`: checked against `raw`, the ORIGINAL pilot
 *    command, not `controls` (the value already run through the stall
 *    limiter and, a no-op for pitch, auto-rudder). `memory` is whatever the
 *    caller last threaded through `nextAltitudeHoldMemory`, and a caller
 *    that skipped a tick (or a test exercising this function directly, as
 *    several below do) could hand it a captured altitude alongside a
 *    `raw.pitch` that has since gone non-zero -- reading `raw` here rather
 *    than trusting the memory alone is what makes "yields to pilot pitch
 *    input" a guarantee of THIS function, provable by calling it directly,
 *    rather than a property that only holds if some other caller kept its
 *    bookkeeping consistent.
 *
 *    Whether this reads `raw` or `controls` is NOT CURRENTLY DISTINGUISHABLE
 *    by any reachable input -- proven 2026-09-13 by mutating it to read
 *    `controls.pitch !== 0` instead and finding no test fails. The only stage
 *    between "raw" and here that ever touches pitch is the stall limiter, and
 *    whenever it changes the value the budget it left is a single value, so
 *    whatever this stage computes is clamped straight back onto the limiter's
 *    own answer regardless of which of the two this check reads; whenever it
 *    does not change the value, `raw.pitch` and `controls.pitch` are the same
 *    number. `raw` is kept because it is the more directly honest statement of
 *    what the check means ("did the pilot ask for something", not "does the
 *    value downstream happen to be zero"), not because a test requires it.
 *
 * What is NOT a gate here any more, deliberately: anything about the stall
 * limiter. Task 4 gated this stage on `limiterEngaged` and then also clamped
 * its output into `limiterBounds`, and the final review found both inert past
 * `DEPARTED_ALPHA_RAD` -- a stand-down conditioned on the limiter having
 * something to say cannot fire when the limiter has stood down itself. Both
 * arguments are gone, replaced by the one `authority` budget that the limiter
 * (and, for departure, `runStack`) narrows. See `PitchAuthority` for the
 * measurements and for why a third boolean was the wrong answer.
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
 * altitude, worst-case excursion during the 60 s under 11 m -- all LEVEL
 * entries, alpha at or near trim when the stick was released.
 *
 * Capturing mid-manoeuvre is a different, larger number. Task 4 fix round 1
 * measured it wrong once already: tipping `velocity` while leaving
 * `attitude` at identity reaches alpha -17.9 degrees, a combination no real
 * manoeuvre in this flight model produces, and understated the true
 * transient by 5 to 25 times. Re-measured through an actual pull-and-release
 * (`/tmp/real_maneuver_probe.ts`, 2026-09-13: hold a real pitch input via
 * `step()`, release, then hold): a mild 0.3 for 3 s at 90-180 m/s transients
 * 46-146 m over the 60 s hold, converging under 0.2 m by the end; a moderate
 * 0.6 for 3 s at 130 m/s transients 189 m, converging to 0.04 m; a full pull
 * (1.0) for 5 s at 130 m/s transients 394 m and is still 22 m off at 60 s --
 * a slow phugoid, converging but not yet damped in that window. `schema.ts`'s
 * `altitudeHoldSeconds` doc comment carries the same corrected figures; see
 * that comment for how tau was chosen. What tau CANNOT do:
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
  authority: PitchAuthority,
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
  // Additive (`controls.pitch + correction`), not a replacement -- even
  // though `controls.pitch` is 0 every time this line runs on the ordinary
  // path, since `isPitchCentred(raw)` required `raw.pitch === 0` and the only
  // earlier stage that touches pitch is the limiter. When the limiter DID
  // move it, the budget below is a single value and this sum is discarded
  // onto it, which is that stand-down. Kept additive as a structural
  // invariant rather than a load-bearing one: the same "never overwrite, only
  // nudge" shape autoRudder uses, correct for free if a stage is ever
  // inserted between the limiter and this one that leaves a non-zero
  // `controls.pitch` inside a budget that still has room in it.
  const uncapped = clampFinite(controls.pitch + correction, -1, 1)
  // The one place this stage puts a value on the pitch axis, and it goes
  // through the budget -- which is [-1, 1] when nothing has narrowed it, the
  // limiter's bound when the limiter published one, and a single value when
  // either the limiter spent the axis on recovery or the wing is departed.
  // Written once, after every path that reaches here, rather than at the
  // `return controls` guards above: those hand back a `controls.pitch` that
  // is provably already inside the budget, because the only two producers of
  // it are the pilot's own command (which the departed narrowing collapses
  // the budget onto) and the limiter's own clamped output.
  return { ...controls, pitch: withinAuthority(authority, uncapped) }
}
