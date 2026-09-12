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

/** Order-of-magnitude flat-plate drag coefficient, approached as the angle of
 *  attack nears 90 degrees. Real flat plates run roughly 1.0-1.2; the exact
 *  value only matters for how briskly a departed aircraft decelerates. */
const FLAT_PLATE_CD = 1.1

/**
 * cd0 + k*cl^2 in the attached-flow region (|alpha| <= alphaCritDeg),
 * unchanged from Task 6. Past the stall, blends linearly in |alpha| from that
 * attached-flow value toward FLAT_PLATE_CD at 90 degrees: a stalled wing is
 * closer to a barn door than an airfoil, and Task 9's post-stall spiral needs
 * that drag to actually shed the energy the wing-drop puts into the departure.
 *
 * `alphaRad` defaults to 0 so the existing two-argument call form used by
 * Task 6's tests (and any caller that only cares about induced drag) keeps
 * working unchanged -- 0 is always within the attached-flow region since
 * alphaCritDeg is validated positive.
 */
export function dragCoefficient(spec: AircraftSpec, cl: number, alphaRad = 0): number {
  const cdAttached = spec.aero.cd0 + inducedDragFactor(spec) * cl * cl
  const alphaCrit = (spec.aero.alphaCritDeg * Math.PI) / 180
  const a = Math.abs(alphaRad)
  if (a <= alphaCrit) return cdAttached

  const ninety = Math.PI / 2
  // Clamped on both ends: schema.ts only requires alphaCritDeg > 0, so a
  // spec with alphaCritDeg > 90 (nothing shipped does, but nothing forbids
  // it either) would otherwise divide by a negative span and drive t, and
  // therefore Cd, negative -- drag that accelerates the aircraft.
  const t = Math.max(0, Math.min(1, (a - alphaCrit) / (ninety - alphaCrit)))
  return cdAttached + (FLAT_PLATE_CD - cdAttached) * t
}
