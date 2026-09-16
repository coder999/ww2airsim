import type { AircraftSpec } from './flight/schema.js'

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
