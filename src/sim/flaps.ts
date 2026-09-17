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
