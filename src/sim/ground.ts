import { v3 } from './math/vec3.js'
import type { AircraftSpec } from './flight/schema.js'
import type { AircraftState } from './flight/state.js'

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
 * How close to the surface counts as resting on it, metres.
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
 * Rests the airplane on the surface: stops it sinking through the ground
 * without ever lifting it off the ground.
 *
 * One-directional in both components, and that is the whole design:
 * `invariants.ts`'s `assertNoEnergyGain` asserts specific energy never rises
 * at idle throttle, and raising `position.y` toward the surface from below
 * adds `g * h` -- a real energy gain, not a rounding artefact. So this
 * function clamps `position.y` DOWN to `groundHeightM` only when it is
 * currently above that (an airplane already below the surface is left where
 * it is -- that is Plan 10's `advance` impact check to handle, not this
 * function's), and clamps `velocity.y` UP to 0 only when it is negative,
 * which only ever removes kinetic energy. A climbing or level airplane
 * within tolerance of the ground (e.g. rotating on the take-off roll) is
 * left completely alone.
 */
export function restOnSurface(state: AircraftState, groundHeightM: number): AircraftState {
  const y = state.position.y > groundHeightM ? groundHeightM : state.position.y
  const vy = state.velocity.y < 0 ? 0 : state.velocity.y
  return {
    ...state,
    position: v3(state.position.x, y, state.position.z),
    velocity: v3(state.velocity.x, vy, state.velocity.z),
  }
}

/**
 * Gear travel counted as "down" for weight-bearing purposes.
 *
 * Not `=== 1`: gear that has travelled 95% of the way is carrying the
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
 * All three conditions are POSITIVE comparisons, combined with `&&` -- the
 * same posture `contactOutcome` (`src/sim/contact.ts`) already takes: a
 * non-finite state fails every one of them and comes back `false`, i.e.
 * unsupported, i.e. a crash. A broken state must fail toward "this is a
 * crash", never toward "this is a normal landing".
 *
 * `spec` is unused today and named with a leading underscore for that reason
 * -- carried in the signature so a future per-aircraft sink limit (11b, next
 * to the ditching gates it will sit beside) does not need to change every
 * call site to arrive.
 */
export function supportedContact(
  _spec: AircraftSpec,
  state: AircraftState,
  groundHeightM: number,
): boolean {
  return onGround(state, groundHeightM)
    && state.gearFraction >= GEAR_DOWN_FRACTION
    && state.velocity.y >= -MAX_SUPPORTED_SINK_MPS
}
