import type { AircraftSpec } from './flight/schema.js'

/**
 * Flap travel after one step.
 *
 * `flapDown === undefined` means the pilot said nothing this step, which for a
 * lever that stays where it is left means hold. A non-finite or non-positive
 * `dt` holds position rather than moving by NaN.
 *
 * Both rules, and the reasons for them, are `gearAfter`'s in `ground.ts` --
 * this is deliberately its twin rather than a shared generic actuator, because
 * two call sites do not justify the abstraction and the two devices are free
 * to diverge (the gear has a weight-on-wheels gate; the flaps will want a
 * speed limit the day anything enforces one).
 */
export function flapAfter(
  spec: AircraftSpec,
  flapFraction: number,
  flapDown: boolean | undefined,
  dt: number,
): number {
  if (flapDown === undefined) return flapFraction
  const step = Number.isFinite(dt) && dt > 0 ? dt / spec.flap.travelSeconds : 0
  const next = flapDown ? flapFraction + step : flapFraction - step
  return next < 0 ? 0 : next > 1 ? 1 : next
}

/**
 * Lift-coefficient increment from the flaps at their current travel.
 *
 * Linear in travel -- the same simplification `gearDragN` makes and for the
 * same reason: a partially extended flap is treated as a fraction of a fully
 * extended one, which is not worth more than that at this model's fidelity.
 *
 * A NaN fraction reads as RETRACTED, because "I do not know" must not put
 * lift on the wing; an out-of-range fraction clamps, so Infinity reads as
 * fully extended. Both matter because this value reaches the lift curve and
 * from there the integrator, which is master spec §9's named hazard.
 */
export function flapClIncrement(spec: AircraftSpec, flapFraction: number): number {
  if (Number.isNaN(flapFraction)) return 0
  const f = flapFraction < 0 ? 0 : flapFraction > 1 ? 1 : flapFraction
  return spec.flap.clIncrement * f
}

/**
 * Parasitic drag from extended flaps, newtons.
 *
 * `dragAreaM2` is a drag AREA (Cd·A), so it multiplies dynamic pressure
 * directly with the coefficient already folded in -- the same shape
 * `gearDragN` takes, and the reason both are added OUTSIDE the wing-area
 * product in `step` rather than folded into `cd` the way `windmillDragCd0`
 * is.
 *
 * Non-finite inputs return 0 rather than a NaN force: this is summed into
 * `dragN` and integrated, so one bad value would poison the whole trajectory.
 */
export function flapDragN(spec: AircraftSpec, flapFraction: number, q: number): number {
  if (!Number.isFinite(q)) return 0
  if (Number.isNaN(flapFraction)) return 0
  const f = flapFraction < 0 ? 0 : flapFraction > 1 ? 1 : flapFraction
  return q * spec.flap.dragAreaM2 * f
}
