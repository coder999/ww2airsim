import type { AircraftSpec } from './flight/schema.js'

export const aspectRatio = (spec: AircraftSpec): number =>
  (spec.geometry.wingSpanM * spec.geometry.wingSpanM) / spec.geometry.wingAreaM2

export const inducedDragFactor = (spec: AircraftSpec): number =>
  1 / (Math.PI * aspectRatio(spec) * spec.aero.oswaldE)

/**
 * Lift coefficient against angle of attack.
 *
 * Linear through the attached-flow region (Cl = clAtZeroAlpha + clSlopePerRad *
 * alpha, unscaled — see plan Ruling R2), peaking at clMax at alphaCrit, then
 * decaying post-stall toward a flat-plate value. Spec §5: the curve must peak
 * and fall, because that fall is what makes the stall a real event rather than
 * a number that keeps growing.
 */
export function liftCoefficient(spec: AircraftSpec, alphaRad: number): number {
  const { clSlopePerRad, clMax, alphaCritDeg, clAtZeroAlpha } = spec.aero
  const alphaCrit = (alphaCritDeg * Math.PI) / 180
  const sign = alphaRad < 0 ? -1 : 1
  const a = Math.abs(alphaRad)

  if (a <= alphaCrit) {
    const cl = clAtZeroAlpha + clSlopePerRad * a
    return sign > 0 ? cl : -(cl - 2 * clAtZeroAlpha)
  }

  // Post-stall: decay from clMax toward ~0.6*clMax at 90 degrees, monotonically
  // down over the first 30 degrees past the stall.
  const over = a - alphaCrit
  const decayed = clMax * Math.max(0.25, 1 - 0.9 * (over / (Math.PI / 2)))
  return sign * decayed
}

/** cd0 + k*cl^2. Symmetric in the sign of lift. */
export function dragCoefficient(spec: AircraftSpec, cl: number): number {
  return spec.aero.cd0 + inducedDragFactor(spec) * cl * cl
}
