import type { AircraftEntity } from '../loop.js'
import { length, v3, type Vec3 } from '../math/vec3.js'
import { qRotate } from '../math/quat.js'

/** A loitering pilot never slows below this multiple of its clean stall
 *  speed: the same 1.3 margin as an approach reference speed. */
export const LOITER_MIN_SPEED_STALL_RATIO = 1.3
/** Desired climb rate per meter of altitude error, 1/s, clamped to
 *  ±LOITER_MAX_VERTICAL_MPS: the ingress route's law (ingress.ts). */
export const LOITER_ALTITUDE_GAIN_PER_S = 0.3
export const LOITER_MAX_VERTICAL_MPS = 10

export type LoiterReference = { readonly headingRad: number; readonly altitudeM: number }

/** The heading and altitude a loiter starting now holds: the current ground
 *  track (or the nose, when barely moving) and the current altitude. */
export function loiterReference<M>(self: AircraftEntity<M>): LoiterReference {
  const v = self.state.velocity
  const track = Math.hypot(v.x, v.z) >= 1 ? v : qRotate(self.state.attitude, v3(1, 0, 0))
  const headingRad = Math.hypot(track.x, track.z) < 1e-6 ? 0 : Math.atan2(track.z, track.x)
  return { headingRad, altitudeM: self.state.position.y }
}

/**
 * The loiter (7e spec §4.2): with no target, no leader and no home, hold the
 * heading and altitude latched when the loiter began, at the current speed.
 * Flown through the velocity controller and under the §3.2 safety envelope,
 * like everything else, so the floor still outranks it.
 */
export function loiterDesiredVelocity<M>(self: AircraftEntity<M>, ref: LoiterReference): Vec3 {
  const speed = Math.max(length(self.state.velocity), LOITER_MIN_SPEED_STALL_RATIO * self.spec.reference.stallSpeedMps)
  const vy = Math.min(LOITER_MAX_VERTICAL_MPS, Math.max(-LOITER_MAX_VERTICAL_MPS, LOITER_ALTITUDE_GAIN_PER_S * (ref.altitudeM - self.state.position.y)))
  const h = Math.sqrt(Math.max(0, speed * speed - vy * vy))
  return v3(Math.cos(ref.headingRad) * h, vy, Math.sin(ref.headingRad) * h)
}
