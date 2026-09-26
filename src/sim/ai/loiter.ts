import type { AircraftEntity } from '../loop.js'
import { length, normalize, scale, v3, type Vec3 } from '../math/vec3.js'
import { qRotate } from '../math/quat.js'

/** A loitering pilot never slows below this multiple of its clean stall
 *  speed: the same 1.3 margin as an approach reference speed. */
export const LOITER_MIN_SPEED_STALL_RATIO = 1.3

/**
 * The loiter (7e spec §4.2): with no target, no leader and no home, hold
 * heading and altitude -- level flight along the current ground track at the
 * current speed. It is flown through the velocity controller and under the
 * §3.2 safety envelope, like everything else, so the floor still outranks it.
 */
export function loiterDesiredVelocity<M>(self: AircraftEntity<M>): Vec3 {
  const v = self.state.velocity
  let track = v3(v.x, 0, v.z)
  if (length(track) < 1) {
    const fwd = qRotate(self.state.attitude, v3(1, 0, 0))
    track = length(v3(fwd.x, 0, fwd.z)) < 1e-6 ? v3(1, 0, 0) : v3(fwd.x, 0, fwd.z)
  }
  const speed = Math.max(length(v), LOITER_MIN_SPEED_STALL_RATIO * self.spec.reference.stallSpeedMps)
  return scale(normalize(track), speed)
}
