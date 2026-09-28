/**
 * Where the pilot has swung the chase camera, relative to its default place
 * behind and above the airplane (orbit camera spec, 2026-09-27).
 *
 * An OFFSET on chase, like `LookOffset` is on both modes, not a mode of its
 * own (spec ruling OC-1): an unmoved orbit IS today's chase view. Measured in
 * the chase frame (heading + 0.92 x pitch, roll discarded), so a swing to the
 * wingtip stays on the wingtip through a turn -- Mark's "tethered".
 */
export type OrbitOffset = {
  /** Positive swings the eye to the airplane's LEFT (plan ruling P-4). Wrapped to (-PI, PI]. */
  readonly yawRad: number
  /** Positive raises the eye. Clamped to [ORBIT_PITCH_MIN_RAD, ORBIT_PITCH_MAX_RAD]. */
  readonly pitchRad: number
  /** Multiplies the chase distance. Clamped to [ORBIT_ZOOM_MIN, ORBIT_ZOOM_MAX]. */
  readonly zoom: number
}

export const ORBIT_ZERO: OrbitOffset = { yawRad: 0, pitchRad: 0, zoom: 1 }
