import { v3, length, scale, dot, sub, type Vec3 } from './math/vec3.js'
import { qRotate } from './math/quat.js'
import type { AircraftSpec } from './flight/schema.js'
import type { AircraftState, Controls } from './flight/state.js'
import { surfaceAt } from './contact.js'

/** Standard gravity, m/s^2. Duplicated per-file rather than shared, matching
 *  how `flight/model.ts`, `autopilot.ts`, `invariants.ts` and
 *  `atmosphere.ts` already each carry their own copy. */
const G = 9.80665

/**
 * Gear travel after one step.
 *
 * `gearDown === undefined` means the pilot said nothing this step, which for a
 * lever that stays where it is left means "keep moving toward wherever it was
 * last commanded" — so `undefined` is treated as the current target, i.e. hold.
 * A non-finite `dt` holds position rather than moving by NaN, the same guard
 * `controlsFromKeys` applies for the same reason.
 */
export function gearAfter(
  spec: AircraftSpec,
  gearFraction: number,
  gearDown: boolean | undefined,
  dt: number,
): number {
  if (gearDown === undefined) return gearFraction
  const step = Number.isFinite(dt) && dt > 0 ? dt / spec.gear.travelSeconds : 0
  const next = gearDown ? gearFraction + step : gearFraction - step
  return next < 0 ? 0 : next > 1 ? 1 : next
}

/**
 * Parasitic drag from extended gear, newtons.
 *
 * `dragAreaM2` is a drag AREA (Cd·A), so it multiplies dynamic pressure
 * directly and needs no separate coefficient — the same shape the wing's
 * `q * wingAreaM2 * cd` takes in `step`, with the coefficient already folded
 * in. Linear in travel: a gear halfway down is treated as half the drag,
 * which is a simplification and is not worth more than that at this model's
 * fidelity.
 */
export function gearDragN(spec: AircraftSpec, gearFraction: number, q: number): number {
  return q * spec.gear.dragAreaM2 * gearFraction
}

/**
 * Rolling-friction magnitude, newtons: the runway drags on the wheels
 * whether or not the brakes are on, and the brakes drag harder.
 *
 * A friction coefficient times weight, blended linearly between
 * `rollingResistanceCoeff` (brakes off) and `brakingResistanceCoeff` (brakes
 * fully applied) by `brake`. `brake` is clamped to `[0, 1]`, and a
 * non-finite value (missing control channel, `undefined`, NaN from a bad
 * input event) is treated as 0 -- brakes off -- the same posture
 * `clampFinite` takes for every other control channel in `step`: a broken
 * input must fail toward the less aggressive behavior, not toward locking
 * the wheels.
 *
 * Returns a magnitude only, not a direction -- `step` applies it opposing
 * the ground track.
 */
export function rollingResistanceN(
  spec: AircraftSpec,
  massKg: number,
  brake: number | undefined,
): number {
  const b = Number.isFinite(brake) ? Math.min(1, Math.max(0, brake as number)) : 0
  const { rollingResistanceCoeff, brakingResistanceCoeff } = spec.gear
  const coeff = rollingResistanceCoeff + b * (brakingResistanceCoeff - rollingResistanceCoeff)
  return coeff * massKg * G
}

/**
 * How close to the surface counts as resting on it, meters.
 *
 * Wanted because the constraint below must not fight the integrator: an
 * airplane rolling at 50 m/s over ground that rises 2.12% (measured at L0
 * through Tacloban, 2026-09-16) climbs about 1.8 cm per step, and a tolerance
 * tighter than that would have it flicker between airborne and grounded every
 * tick. Loose enough to absorb that, tight enough that an airplane a wingspan
 * up is unambiguously flying.
 */
export const GROUND_CONTACT_TOLERANCE_M = 0.25

/**
 * Whether the airplane is resting on the surface beneath it.
 *
 * Derived, never stored: five consumers read this, and a stored flag is one
 * that can disagree with the state it claims to describe.
 *
 * Deliberately NOT gated on the gear being down -- a belly landing is still on
 * the ground. Whether the airplane survives being there is
 * `contactOutcome`'s judgment (Plan 10), and folding it in here would make
 * "is it touching" depend on "is it flyable".
 *
 * Written as a positive comparison so a non-finite position comes back
 * `false`: a broken state must not be handed to the constraint.
 *
 * Takes `spec` as of Task 15: `state.position.y` is the airplane's BODY
 * ORIGIN, not its wheel contact point (`view.eyePointM` in the content file
 * is measured from that same origin, which fixes the convention), so what
 * touches the ground is `position.y - spec.gear.heightM`, not `position.y`
 * itself. Before this, a parked airplane's origin sat exactly on the
 * surface and the whole airframe below it -- fuselage, wing, a 3.9 m
 * propeller disc -- was underground (Mark's screenshot, 2026-09-16).
 */
export function onGround(spec: AircraftSpec, state: AircraftState, groundHeightM: number): boolean {
  const contactHeightM = state.position.y - spec.gear.heightM
  return contactHeightM - groundHeightM <= GROUND_CONTACT_TOLERANCE_M
    && contactHeightM - groundHeightM >= -GROUND_CONTACT_TOLERANCE_M
}

/**
 * Rests the airplane on the surface: a surface PROJECTION, not a one-sided
 * clamp.
 *
 * Amended 2026-09-16 (design doc §2) after the original one-sided rule --
 * "never lift, whatever it costs" -- turned out to make take-off impossible:
 * a constraint that can only push down holds a constant ALTITUDE on any
 * upslope instead of following the ground, so the airplane buries itself and
 * `advance` records it destroyed. The real rule is narrower and survives
 * rising terrain: never GAIN ENERGY. `invariants.ts`'s `assertNoEnergyGain`
 * asserts specific energy never rises at idle throttle, and that rule
 * constrains this function in exactly two places:
 *
 * - **Separating (climbing) and not sinking into the surface:** left
 *   completely alone, position included. Clamping position here anyway,
 *   even while vertical velocity is left untouched, is what Finding 3 (the
 *   whole-branch review) caught: it pinned a take-off roll to exactly ground
 *   level while vy built up, then let go in a single tick once vy crossed
 *   `GROUND_CONTACT_TOLERANCE_M / DT` -- a 15 m/s leap rather than a
 *   rotation.
 * - **At or sinking below the surface:** `position.y` is clamped DOWN to
 *   `groundHeightM` and `velocity.y` clamped UP to 0 only when negative --
 *   both only ever remove kinetic or potential energy, so they are always
 *   safe.
 *
 * The remaining case is the one the amendment added: the airplane is BELOW
 * the surface (ground has risen past it since the last step) but within
 * `GROUND_CONTACT_TOLERANCE_M` of it. Farther below than that is still Plan
 * 10's business -- `advance`'s impact check, not this function's -- and is
 * left untouched exactly as before. Within tolerance, this now projects the
 * airplane UP onto the surface and pays for the rise out of kinetic energy:
 * `g * dh` joules per kilogram come off the specific kinetic energy, which is
 * what rolling a real vehicle up a real hill does to its speed. The whole
 * velocity vector is scaled down (not just its vertical component) so the
 * trade is exact regardless of heading, and the resulting `after` energy is
 * `before - g * dh` to within floating-point error --
 * `tests/sim/invariants.test.ts`'s sweep and `tests/sim/ground.test.ts` both
 * pin this.
 *
 * If the available kinetic energy is less than `g * dh`, the airplane cannot
 * climb the rise this tick: the state is left EXACTLY as it came in, velocity
 * included. Fix-wave round 2 caught a bug here: an earlier version zeroed the
 * whole velocity vector in this branch, which -- since this function runs
 * every tick a still-buried airplane is here -- confiscated each tick's
 * thrust increment before it could ever accumulate toward `g * dh`. Measured:
 * buried 1 cm below flat ground at full throttle, speed stayed 0.0000 m/s for
 * 300 s of simulated time. Leaving the state untouched instead lets `step`'s
 * normal thrust/drag integration keep building speed tick over tick (the
 * pre-integration ground-reaction force, gated on `supportedContact`,
 * prevents it sinking any further in the meantime) until there is enough
 * kinetic energy to pay for the climb, at which point the branch above this
 * one fires and it lifts out. Never gains energy either way: doing nothing
 * cannot raise `before`.
 *
 * This function does not itself re-validate `state` for finiteness -- it
 * trusts its two callers in `step` (`src/sim/flight/model.ts`) to have
 * already gated on `supportedContact`, which rejects a non-finite state
 * before this is ever reached. A NaN `position.y` handed to this function
 * directly would produce a NaN `dh` that satisfies neither `dh <= 0` nor
 * `dh > GROUND_CONTACT_TOLERANCE_M`, falling through into the climb-payment
 * branch below and returning a fabricated on-surface position paired with a
 * NaN velocity, rather than being left alone the way every other non-finite
 * case in this file is. Flagged rather than guarded here: unreachable
 * through the only call sites that exist today, and out of scope for this
 * fix wave to change behavior on.
 *
 * Takes `spec` as of Task 15, for the same reason `onGround` now does: the
 * surface this projects the airplane onto is `groundHeightM + spec.gear.heightM`
 * -- the wheels' contact point -- not `groundHeightM` itself, which is where
 * the body origin `position` names would otherwise be pinned, burying the
 * airframe below it. Only the DATUM moves: every comparison and the `g * dh`
 * energy trade below are unchanged in substance, now measured against
 * `groundHeightM + spec.gear.heightM` rather than `groundHeightM` directly --
 * `tests/sim/invariants.test.ts`'s sweep re-verifies this after the move.
 */
export function restOnSurface(spec: AircraftSpec, state: AircraftState, groundHeightM: number): AircraftState {
  const contactTargetM = groundHeightM + spec.gear.heightM
  const dh = contactTargetM - state.position.y

  if (dh <= 0) {
    // At or above the surface. A separating (climbing) airplane is left
    // completely alone -- position included (Finding 3).
    if (state.velocity.y > 0) return state
    // Sinking or level: stop the sink, no more.
    return {
      ...state,
      position: v3(state.position.x, contactTargetM, state.position.z),
      velocity: v3(state.velocity.x, 0, state.velocity.z),
    }
  }

  if (dh > GROUND_CONTACT_TOLERANCE_M) {
    // Below the surface by more than contact tolerance: Plan 10's business.
    return state
  }

  // Below the surface, within tolerance: the ground rose under the airplane.
  // Follow it up and pay for the climb out of kinetic energy -- but only if
  // there is enough of it yet (see the doc comment's fix-wave-round-2 note).
  const speed = length(state.velocity)
  const keJPerKg = 0.5 * speed * speed
  const climbCostJPerKg = G * dh
  if (keJPerKg < climbCostJPerKg) return state
  const newSpeed = Math.sqrt(2 * (keJPerKg - climbCostJPerKg))
  const factor = speed > 1e-9 ? newSpeed / speed : 0
  return {
    ...state,
    position: v3(state.position.x, contactTargetM, state.position.z),
    velocity: scale(state.velocity, factor),
  }
}

/**
 * Gear travel counted as "down" for weight-bearing purposes.
 *
 * Not `=== 1`: gear that has traveled 95% of the way is carrying the
 * airplane's weight exactly as surely as gear that finished the trip an
 * instant earlier -- `gearAfter`'s travel time is a cosmetic animation
 * duration, not a structural one, and requiring the exact endpoint would
 * flicker a landing between supported and unsupported for no physical
 * reason, purely because of where in its travel `gearFraction` happened to
 * sample.
 */
export const GEAR_DOWN_FRACTION = 0.95

/**
 * Landing-gear sink-rate limit, m/s: how hard an arrival can hit before the
 * gear is judged to have failed rather than carried the airplane.
 *
 * An UNTUNED GUESS, the same standing `DITCH_MAX_SINK_MPS` has in
 * `src/sim/contact.ts` -- nobody has flown this yet, so getting it wrong
 * makes a landing too easy or impossible; it does not make anything
 * incorrect. Set a little above the ditching gate on the reasoning that a
 * wheeled undercarriage is built to take a harder arrival than a hull
 * ditching onto water is, not from any cited figure. This drags a sliver of
 * Plan 11b (landing) into 11a on purpose -- an airplane has to not-crash
 * while stationary before it can roll -- and 11b tunes it together with the
 * rest of the landing-survivability gates it owns. Expect it to move.
 */
export const MAX_SUPPORTED_SINK_MPS = 4.0

/**
 * Landing-gear approach-speed limit, m/s: how fast an ARRIVAL can be and
 * still be judged carried rather than crashed into, whatever its sink rate.
 *
 * An UNTUNED GUESS, the same standing `DITCH_MAX_SPEED_STALL_MULTIPLE` has in
 * `src/sim/contact.ts` -- nobody has flown this yet, so getting it wrong
 * makes a landing too easy or impossible; it does not make anything
 * incorrect. Relative to the spec's stall speed, not absolute, for the same
 * reason that constant is: a second airplane in the roster gets a sane
 * judgment without a second constant. For the F6F this is 1.6 * 43.81 =
 * 70.1 m/s -- comfortably above a rotation or approach speed and well below a
 * low pass, which is the gap the multiple is picked to sit in. Before this
 * existed, `supportedContact` had no speed limit at all, so a gear-down
 * arrival at 150 m/s with a gentle sink recorded no impact and rolled away
 * from what should have been a wreck. Expect this to move once 11b tunes the
 * rest of the landing-survivability gates it owns.
 *
 * Only applies to a genuine ARRIVAL -- see `ARRIVAL_SINK_THRESHOLD_MPS`.
 * Fix-wave round 2 caught this cap firing on a normal, level take-off roll:
 * `supportedContact` is read every tick of a ground roll, not once on
 * arrival, so an airplane accelerating straight down the runway crossed
 * 70.1 m/s and was instantly judged unsupported -- gravity stopped being
 * cancelled and `advance` recorded it destroyed, on FLAT ground, at `vy = 0`,
 * with nothing wrong. A cap meant to catch "flew into the jungle at 291
 * knots" must not also catch "rolling fast because take-off is imminent".
 */
export const MAX_SUPPORTED_SPEED_STALL_MULTIPLE = 1.6

/**
 * Sink rate beyond which an airplane counts as ARRIVING rather than rolling
 * level, m/s: what tells the two apart for `MAX_SUPPORTED_SPEED_STALL_MULTIPLE`
 * above.
 *
 * An UNTUNED GUESS, the same standing every other threshold in this file has.
 * `restOnSurface` holds a non-climbing airplane's `velocity.y` at EXACTLY 0
 * every tick it is not climbing (both the plain clamp and the rising-ground
 * projection leave a zero vertical component zero, since scaling zero by any
 * finite factor is still zero) -- so a real ground roll never carries any
 * sink at all, and this threshold only has to clear floating-point noise, not
 * a genuine slow descent. Set well below even a gentle touchdown sink so the
 * speed cap still catches Finding 4's original case -- a fast arrival with a
 * gentle sink must still read as descending, not as a roll.
 */
export const ARRIVAL_SINK_THRESHOLD_MPS = 0.1

/**
 * Whether ground contact is CARRIED rather than crashed into: the surface is
 * LAND, the gear is down, the airplane is within `onGround`'s tolerance of
 * the surface, and it arrived slowly enough to survive.
 *
 * **Requires land** (Task 16, found by Mark driving off the end of the
 * Tacloban runway onto the ocean and rolling on top of it): every other gate
 * here asks about the AIRPLANE -- gear, sink, speed -- and none of them ask
 * what it is standing on, so a gear-down airplane rolling level at sea level
 * satisfied all of them and got the ground constraint and rolling friction
 * over open water. Wheels cannot roll on water. `surfaceAt` (`src/sim/
 * contact.ts`) is Plan 10's own single source of truth for the land/water
 * classification -- re-testing `groundHeightM <= SEA_LEVEL_M` here instead
 * would be a second copy of that rule, free to drift from the first, so this
 * imports `surfaceAt` rather than reimplementing it. Requiring land here
 * makes `contactOutcome`'s existing "on land, never survivable"
 * (`src/sim/contact.ts`) and this file's ground constraint agree on the same
 * classification for the same reason `supportedContact` itself exists: two
 * places judging the same thing by different rules is how the take-off/
 * landing seam broke before Task 5b.
 *
 * The one predicate gating both sides of the Plan 10 / Plan 11a seam: `step`
 * applies `restOnSurface` only for a supported contact, and `advance`
 * (`src/sim/loop.ts`) records an impact only for an UNsupported one. Before
 * this predicate existed the two disagreed -- `restOnSurface` clamped a
 * resting airplane exactly onto the surface, and `advance`'s geometric
 * `position.y <= groundHeightM` test then read that as a fresh crash on
 * every following tick, which made sitting on a runway indistinguishable
 * from hitting the ground and take-off impossible.
 *
 * Every condition is a POSITIVE comparison, combined with `&&` -- the same
 * posture `contactOutcome` (`src/sim/contact.ts`) already takes: a non-finite
 * state fails every one of them and comes back `false`, i.e. unsupported,
 * i.e. a crash. A broken state must fail toward "this is a crash", never
 * toward "this is a normal landing". The sink-rate gate spells out
 * `Number.isFinite` explicitly rather than relying on the comparison alone,
 * because `+Infinity >= -MAX_SUPPORTED_SINK_MPS` is true -- a bare positive
 * comparison against a NEGATIVE bound lets an infinite climb rate straight
 * through it, which is exactly the non-finite state this predicate's posture
 * is supposed to catch. `Number.isFinite(speed)` guards the same posture for
 * the speed cap below: a non-finite value anywhere in `velocity` (not just
 * its `y` component) propagates into `length`, and a broken state must not
 * silently skip the cap because the one arithmetic comparison against it
 * happens to be false for a NaN or an Infinity.
 *
 * `MAX_SUPPORTED_SPEED_STALL_MULTIPLE`'s cap is gated on `descending`
 * (`velocity.y` below `-ARRIVAL_SINK_THRESHOLD_MPS`), not applied
 * unconditionally -- fix-wave round 2's fix for the cap firing on a normal
 * take-off roll (see that constant's comment). A level or climbing airplane
 * is supported at any speed; only a genuine descent onto the surface is
 * speed-limited.
 */
export function supportedContact(
  spec: AircraftSpec,
  state: AircraftState,
  groundHeightM: number,
): boolean {
  const speed = length(state.velocity)
  const descending = state.velocity.y < -ARRIVAL_SINK_THRESHOLD_MPS
  return surfaceAt(groundHeightM) === 'land'
    && onGround(spec, state, groundHeightM)
    && state.gearFraction >= GEAR_DOWN_FRACTION
    && Number.isFinite(state.velocity.y) && state.velocity.y >= -MAX_SUPPORTED_SINK_MPS
    && Number.isFinite(speed)
    && (!descending || speed <= MAX_SUPPORTED_SPEED_STALL_MULTIPLE * spec.reference.stallSpeedMps)
}

const GROUND_DEG = Math.PI / 180

/**
 * What the airplane on its wheels actually does, given the rates the AIR
 * would have commanded (`ratesFromDynamicPressure`, `src/sim/flight/model.ts`).
 *
 * The flight model commands body ROTATION RATES, not moments -- correct in
 * the air, where the airframe is free to rotate about its own center of
 * mass, and simply wrong on the ground, where the wheels are a hinge the
 * airframe cannot rotate through. Bolting ground reaction forces onto the
 * unmodified air rate command barrel-rolls the airplane down the runway:
 * full aileron still commands the air's full roll rate, and nothing on the
 * ground opposes it, because this model has no moments of inertia for a
 * ground-reaction TORQUE to act against in the first place.
 *
 * Each axis is answered on its own terms, because "on the ground" does not
 * mean the same thing for all three:
 *
 * - **Roll: always zero, exactly, not reduced.** A wheeled airplane cannot
 *   roll about its own axis while both mains are on the ground -- the gear
 *   IS the roll constraint, full stop, at any speed and any stick
 *   deflection. This is the case the whole-plan warning is about: leave it
 *   nonzero and the ailerons move while the airplane does not, until they
 *   pick up enough authority to become believable and the airplane snaps
 *   into a roll it has no business doing on the runway.
 * - **Pitch: gated on a SPEED, not an elevator moment.** Ruling taken here
 *   rather than left open (spec §9 question 3): the tail comes up once
 *   ground speed reaches `spec.gear.tailUpSpeedMps`, full stop, rather than
 *   through an elevator-authority-against-a-moment-arm model. The
 *   alternative reintroduces moments this model does not carry anywhere
 *   else and would model the tail in more detail than the airframe it is
 *   attached to. Whether a hard speed gate feels arbitrary next to a
 *   progressive one is a Tier 3 question for whoever flies this next, not
 *   settled here. Compared against GROUND speed -- the horizontal
 *   component of velocity -- not `airspeed` (`src/sim/flight/model.ts`),
 *   because the tail lifting off the runway is a mechanical event driven by
 *   how fast the wheels are moving over the ground, not by the (identical,
 *   absent wind) number the wing sees. Guarded on `Number.isFinite(groundSpeed)`
 *   rather than a bare comparison -- fix round 1, Minor 3: `+Infinity >=
 *   tailUpSpeedMps` is true, so an unguarded comparison would let a broken
 *   (infinite) ground speed buy full pitch authority, the LEAST conservative
 *   of the two outcomes for a state that cannot be trusted at all. Guarded,
 *   a non-finite ground speed comes back with the tail down, matching the
 *   posture `onGround` and `supportedContact` already take.
 * - **Yaw: the tailwheel AND the rudder, blended by speed, available at ANY
 *   speed including zero.** Design §3: tailwheel/differential-braking
 *   steering is "blended into rudder authority as speed builds", not a
 *   switch between the two. `airRates.y` already carries whatever the
 *   rudder (and the weathercock term ahead of this function in `step`) is
 *   commanding, scaled by `ratesFromDynamicPressure`'s own dynamic-pressure
 *   authority -- that term is summed with a SEPARATE tailwheel rate,
 *   proportional to `controls.yaw` and capped at
 *   `spec.gear.tailwheelYawRateDegPerSec`, that fades from full authority at
 *   rest to zero at `tailUpSpeedMps`, the same speed pitch gates on: the
 *   tailwheel is what leaves the ground there, so its authority has to be
 *   gone by the moment it does.
 *
 *   Fix round 1, Important 1: an earlier revision DISCARDED `airRates.y` and
 *   substituted a constant tailwheel rate at every ground speed, which is
 *   wrong on both ends -- no rudder authority at all while rolling, and a
 *   step discontinuity at liftoff (measured: 20.00 deg/s on the runway,
 *   1.95 deg/s the very next tick once airborne, because the constant
 *   tailwheel term vanishes at exactly the tick `onGroundStart` goes false
 *   while the rudder term it replaced was never restored). Summing instead
 *   of switching makes the total continuous by construction: at
 *   `tailUpSpeedMps` the tailwheel term is already 0 by the fade, so the
 *   total is `airRates.y` on both sides of that speed, and `airRates.y`
 *   again the instant the airplane leaves the ground (`step` stops calling
 *   this function at all once `onGroundStart` is false) -- no seam to jump
 *   across. A blend against dynamic-pressure authority ALONE (the same
 *   authority `ratesFromDynamicPressure` itself uses) was considered and
 *   rejected instead of this speed-based fade: that authority is only 0.15
 *   at 40 m/s for this airframe, so it would still be granting the
 *   tailwheel 85% of its steering rate one tick before a typical rotation,
 *   which is not what "the tailwheel lifts off with the tail" means.
 *
 *   Negated for the same reason `ratesFromDynamicPressure` negates yaw: a
 *   positive rotation about body +Y (right-hand rule) turns +X (forward)
 *   toward -Z (left) in this right-handed frame, but the documented
 *   convention is `Controls.yaw > 0` = nose right. The fade uses the same
 *   `Number.isFinite` guard as the pitch gate above -- a non-finite ground
 *   speed reads as "still on the tailwheel", i.e. full fade (1), which
 *   together with the pitch gate's own guard keeps a broken state pinned to
 *   the tail-down, wheels-steering case rather than handing it any new
 *   authority.
 */
export function groundBodyRates(
  spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
  airRates: Vec3,
): Vec3 {
  const groundSpeed = length(v3(state.velocity.x, 0, state.velocity.z))
  const validSpeed = Number.isFinite(groundSpeed)
  const pitch = validSpeed && groundSpeed >= spec.gear.tailUpSpeedMps ? airRates.z : 0

  const fade = validSpeed ? Math.min(1, Math.max(0, 1 - groundSpeed / spec.gear.tailUpSpeedMps)) : 1
  const yawInput = Number.isFinite(controls.yaw) ? Math.min(1, Math.max(-1, controls.yaw)) : 0
  const tailwheelYaw = -yawInput * spec.gear.tailwheelYawRateDegPerSec * GROUND_DEG * fade

  return v3(0, tailwheelYaw + airRates.y, pitch)
}

/**
 * The velocity after one step of tire grip: the component ACROSS the wheels
 * decays toward zero; the component along them, and the vertical, are
 * untouched.
 *
 * 11a measured a taxi turn reaching **113.6 degrees of sideslip** because
 * nothing made the airplane travel where its wheels pointed. Its handoff also
 * rejected the cheap fix and said why, and that ruling stands: restoring the
 * fin's weathercock term models the wrong SIGN of the right effect, because a
 * real taildragger is directionally UNSTABLE on the ground and the term would
 * fight the tailwheel.
 *
 * A projection rather than a spring, for the same reason `restOnSurface` is
 * one: a spring-damper tire model would be more physically detailed than an
 * airframe that carries no moments of inertia. And a first-order DECAY rather
 * than outright removal, so that a mishandled touchdown can still skid and
 * swap ends -- a ground loop is the characteristic taildragger hazard, not an
 * edge case, and a rail would abolish it.
 *
 * **Structurally cannot add energy**, which is what keeps `assertNoEnergyGain`
 * (`src/sim/invariants.ts`) true across it: `keep` is in (0, 1], so this only
 * ever scales one component down.
 *
 * Measured 2026-09-17, worst sideslip during a 20 s full-rudder taxi turn at
 * 12 m/s: **113.6 degrees before, 2.7 degrees after.** That is the whole
 * acceptance evidence for this function, and the figure to re-measure if
 * `lateralGripSeconds` is ever retuned.
 */
export function lateralGripAfter(spec: AircraftSpec, state: AircraftState, dt: number): Vec3 {
  if (!Number.isFinite(dt) || dt <= 0) return state.velocity
  // The wheels roll along the body's nose, projected flat onto the ground.
  const nose = qRotate(state.attitude, v3(1, 0, 0))
  const flat = v3(nose.x, 0, nose.z)
  const flatLen = length(flat)
  // A vertical nose has no rolling direction to resolve against, so the honest
  // answer is to change nothing rather than to pick an axis.
  if (!Number.isFinite(flatLen) || flatLen < 1e-6) return state.velocity
  const dir = scale(flat, 1 / flatLen)

  const horizontal = v3(state.velocity.x, 0, state.velocity.z)
  const along = scale(dir, dot(horizontal, dir))
  const across = sub(horizontal, along)

  const keep = Math.exp(-dt / spec.gear.lateralGripSeconds)
  const damped = scale(across, keep)
  return v3(along.x + damped.x, state.velocity.y, along.z + damped.z)
}
