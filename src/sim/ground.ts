import { v3, length, scale, ZERO } from './math/vec3.js'
import type { AircraftSpec } from './flight/schema.js'
import type { AircraftState } from './flight/state.js'

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
 */
export function onGround(state: AircraftState, groundHeightM: number): boolean {
  return state.position.y - groundHeightM <= GROUND_CONTACT_TOLERANCE_M
    && state.position.y - groundHeightM >= -GROUND_CONTACT_TOLERANCE_M
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
 * pin this. If the available kinetic energy is less than `g * dh`, the
 * airplane cannot climb the rise: it stops (velocity zeroed) rather than
 * being dragged up a slope it does not have the speed for, and is left below
 * the surface exactly as the too-far-below case is.
 */
export function restOnSurface(state: AircraftState, groundHeightM: number): AircraftState {
  const dh = groundHeightM - state.position.y

  if (dh <= 0) {
    // At or above the surface. A separating (climbing) airplane is left
    // completely alone -- position included (Finding 3).
    if (state.velocity.y > 0) return state
    // Sinking or level: stop the sink, no more.
    return {
      ...state,
      position: v3(state.position.x, groundHeightM, state.position.z),
      velocity: v3(state.velocity.x, 0, state.velocity.z),
    }
  }

  if (dh > GROUND_CONTACT_TOLERANCE_M) {
    // Below the surface by more than contact tolerance: Plan 10's business.
    return state
  }

  // Below the surface, within tolerance: the ground rose under the airplane.
  // Follow it up and pay for the climb out of kinetic energy.
  const speed = length(state.velocity)
  const keJPerKg = 0.5 * speed * speed
  const climbCostJPerKg = G * dh
  if (keJPerKg < climbCostJPerKg) {
    // Not enough speed to climb this rise: it stops rather than climbing it.
    return { ...state, velocity: ZERO }
  }
  const newSpeed = Math.sqrt(2 * (keJPerKg - climbCostJPerKg))
  const factor = speed > 1e-9 ? newSpeed / speed : 0
  return {
    ...state,
    position: v3(state.position.x, groundHeightM, state.position.z),
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
 * Landing-gear approach-speed limit, m/s: how fast an arrival can be and
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
 */
export const MAX_SUPPORTED_SPEED_STALL_MULTIPLE = 1.6

/**
 * Whether ground contact is CARRIED rather than crashed into: the gear is
 * down, the airplane is within `onGround`'s tolerance of the surface, and it
 * arrived slowly enough to survive.
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
 * is supposed to catch.
 */
export function supportedContact(
  spec: AircraftSpec,
  state: AircraftState,
  groundHeightM: number,
): boolean {
  return onGround(state, groundHeightM)
    && state.gearFraction >= GEAR_DOWN_FRACTION
    && Number.isFinite(state.velocity.y) && state.velocity.y >= -MAX_SUPPORTED_SINK_MPS
    && length(state.velocity) <= MAX_SUPPORTED_SPEED_STALL_MULTIPLE * spec.reference.stallSpeedMps
}
