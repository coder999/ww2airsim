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
