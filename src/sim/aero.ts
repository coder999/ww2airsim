import type { AircraftSpec } from './flight/schema.js'

/**
 * `alphaCritDeg` in radians. The single place that conversion happens: the
 * stall boundary has to mean the identical number to the lift curve, the
 * post-stall drag blend and `isStalled` in `flight/model.ts`, and when those
 * three each recomputed it independently they did in fact disagree about what
 * the curve does on one side of it (finding C1 -- the negative-alpha lift
 * discontinuity fixed below).
 */
export const alphaCritRad = (spec: AircraftSpec): number =>
  (spec.aero.alphaCritDeg * Math.PI) / 180

export const aspectRatio = (spec: AircraftSpec): number =>
  (spec.geometry.wingSpanM * spec.geometry.wingSpanM) / spec.geometry.wingAreaM2

export const inducedDragFactor = (spec: AircraftSpec): number =>
  1 / (Math.PI * aspectRatio(spec) * spec.aero.oswaldE)

/**
 * Induced-drag multiplier in ground effect: McCormick's
 * `phi = (16h/b)^2 / (1 + (16h/b)^2)`, with `h` the WING's height above the
 * surface and `b` the span.
 *
 * Within about a wingspan of the ground the trailing vortex system is
 * constrained and induced drag falls. Measured on this airplane 2026-09-17:
 * x0.600 at 1 m, x0.857 at 2 m, x0.931 at 3 m, x0.996 at one span.
 *
 * **No fitted constant, and that is load-bearing rather than tidy.** It is
 * what leaves `flap.dragAreaM2` as the only unknown entering the graded
 * full-flaps take-off card, so that card characterises flap drag rather than
 * characterising two guesses against each other.
 *
 * The lift INCREASE in ground effect is deliberately not modeled: the
 * induced-drag reduction is the dominant and best-published half, and the
 * published forms of the lift half disagree more. Stated so a later reader
 * knows it was a decision.
 *
 * Returns 0 at or below the surface -- the formula's own limit -- and is
 * clamped into [0, 1] for any non-finite input, because this multiplies a drag
 * term that reaches the integrator.
 */
export const groundEffectFactor = (spec: AircraftSpec, wingHeightM: number): number => {
  if (!Number.isFinite(wingHeightM) || wingHeightM <= 0) return 0
  const ratio = (16 * wingHeightM) / spec.geometry.wingSpanM
  const x = ratio * ratio
  const phi = x / (1 + x)
  return phi < 0 ? 0 : phi > 1 ? 1 : phi
}

/**
 * Parasitic drag added by a propeller that is not pulling, as a Cd0 increment.
 *
 * Exists because the model had NO engine-state drag at all: `thrustMagnitude`
 * returns zero at closed throttle and `cd0` never learned the engine stopped,
 * so a dead-stick Hellcat glided like one with the propeller feathered. Mark
 * flew it on 2026-09-16 and reported the deceleration as unrealistic; measured
 * at the time, altitude pinned so drag was the only loss, 250 mph bled to
 * 100 mph in 79.3 s over 6.01 km.
 *
 * The airframe was NOT the problem and is deliberately untouched. `cd0` is
 * 0.0211, the published clean F6F figure, and `maxPowerW` is the R-2800-10W's
 * real 2000 hp -- checked together on 2026-09-16 precisely because a `cd0`
 * bent to hit the graded 391 mph top speed would have needed a compensating
 * engine error to hide it, and neither is bent. The clean max L/D of 13.2:1
 * is what those two published numbers imply, and is left alone.
 *
 * What was missing is that an airplane with its engine off is not clean. A
 * 13 ft constant-speed disc in flat pitch is a flat-plate brake comparable to
 * the whole clean airframe, which is why heavy fighters are described as
 * gliding like bricks despite a paper L/D in the teens.
 *
 * Linear in throttle rather than modeling blade pitch, disc solidity or engine
 * braking: this model commands rates rather than moments and carries no
 * propeller state, so anything finer would be more detailed than the airframe
 * it attaches to. Full penalty at closed throttle, nothing at full power, and
 * a non-finite throttle reads as idle -- the draggier end, which fails toward
 * an airplane that slows down rather than one that does not.
 */
export const windmillDragCd0 = (spec: AircraftSpec, throttle: number): number => {
  const t = Number.isFinite(throttle) ? (throttle < 0 ? 0 : throttle > 1 ? 1 : throttle) : 0
  return spec.engine.windmillCd0 * (1 - t)
}

/** Post-stall decay floor, as a fraction of the peak Cl the attached-flow
 *  branch reaches at alphaCrit. It does not bind anywhere between the stall
 *  and 90 degrees on the shipped F6F curve -- the decay factor at exactly 90
 *  degrees is 0.255, just above it -- but it is NOT a dead branch: for this
 *  aircraft it starts binding at |alpha| = 90.5 degrees exactly and holds for
 *  everything beyond, and that region is routinely reached, because
 *  `angleOfAttack` is an atan2 spanning the full +/-180 degrees. Measured
 *  2026-09-12 on the soak (seed 1337, 200 iterations, 611,160 steps): 40.8%
 *  of steps sat past 90.5 degrees of |alpha|, peak 180.0 degrees. It
 *  additionally guards a spec with a small `alphaCritDeg`, where the decay
 *  would otherwise reach zero and change sign inside 90 degrees. */
const POST_STALL_FLOOR = 0.25

/** Fraction of the peak lost per radian past the stall. 0.9/(pi/2) means a
 *  full 90 degrees past alphaCrit would cost 90% of the peak if the floor
 *  above did not intervene first. */
const POST_STALL_DECAY_PER_QUARTER_TURN = 0.9

/**
 * Lift coefficient against angle of attack.
 *
 * Linear through the attached-flow region (Cl = clAtZeroAlpha + clSlopePerRad *
 * alpha, unscaled — see plan Ruling R2) for alpha of either sign, so the whole
 * attached branch is one straight line through `clAtZeroAlpha`. Past
 * +/-alphaCrit the magnitude decays toward a flat-plate value. Spec §5: the
 * curve must peak and fall, because that fall is what makes the stall a real
 * event rather than a number that keeps growing.
 *
 * Finding C1: the post-stall branch used to decay from `clMax` regardless of
 * the sign of alpha, so on the negative side it STEPPED UP onto a bigger
 * magnitude at the stall -- Cl(-15.50 deg) = -1.200013 then Cl(-15.51 deg) =
 * -1.399860, a 0.2007 jump worth 1.17 g at the trial weight, in the direction
 * of *more* lift past the stall. The peak is now taken from the attached
 * branch evaluated at the signed boundary, so continuity is structural rather
 * than the numerical coincidence it was on the positive side (where
 * clAtZeroAlpha + clSlopePerRad*alphaCrit = 1.400013 happened to sit 1.3e-4
 * from this aircraft's clMax of 1.4). Note the consequence: `clMax` is no
 * longer read by this curve at all -- the peak is whatever the linear branch
 * reaches at alphaCrit, which is the only value that can meet it without a
 * step. Measured 2026-09-12: peak |Cl| is 1.400013 at +15.5 deg and 1.200013
 * at -15.5 deg; Cl(+15.51 deg) = 1.399873 and Cl(-15.51 deg) = -1.199893, so
 * both boundaries now fall away; Cl(+90 deg) = 0.357003 and Cl(-90 deg) =
 * -0.306003; and the largest Cl change over any 0.001 deg interval in
 * +/-180 deg is 8.39e-5, which is just the attached branch's own slope (it
 * was 0.19997, the jump, before this fix).
 */
export function liftCoefficient(spec: AircraftSpec, alphaRad: number, clIncrement = 0): number {
  const { clSlopePerRad, clAtZeroAlpha } = spec.aero
  const alphaCrit = alphaCritRad(spec)
  /**
   * The attached-flow line, valid for signed alpha in [-alphaCrit, alphaCrit].
   *
   * `clIncrement` is the flaps (`flapClIncrement`, src/sim/flaps.ts) and
   * belongs HERE rather than on this function's result. The post-stall branch
   * below takes its peak from this same closure, which is what makes the two
   * branches meet; adding the increment outside would lift the attached branch
   * and leave the peak behind, re-opening finding C1's discontinuity -- a
   * 0.2007 step worth 1.17 g in the direction of MORE lift past the stall --
   * but only with the flaps down, which is where nobody would look for it.
   *
   * Defaults to 0, so every caller predating Plan 11b is unchanged.
   */
  const attached = (a: number) => clAtZeroAlpha + clIncrement + clSlopePerRad * a
  const a = Math.abs(alphaRad)

  if (a <= alphaCrit) return attached(alphaRad)

  const sign = alphaRad < 0 ? -1 : 1
  // The signed peak this branch has to start from, so the two branches meet:
  // attached(+alphaCrit) going positive, attached(-alphaCrit) going negative.
  const peak = attached(sign * alphaCrit)
  const over = a - alphaCrit
  const decay = Math.max(
    POST_STALL_FLOOR,
    1 - POST_STALL_DECAY_PER_QUARTER_TURN * (over / (Math.PI / 2)),
  )
  return peak * decay
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
export function dragCoefficient(
  spec: AircraftSpec,
  cl: number,
  alphaRad = 0,
  inducedFactorScale = 1,
): number {
  // `inducedFactorScale` is ground effect (`groundEffectFactor`) and defaults
  // to 1, so every caller predating Plan 11b is unchanged. It scales the
  // INDUCED term alone: ground effect constrains the trailing vortex system
  // and has no business touching `cd0`.
  const cdAttached = spec.aero.cd0 + inducedDragFactor(spec) * inducedFactorScale * cl * cl
  const alphaCrit = alphaCritRad(spec)
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
