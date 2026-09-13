import { type Vec3, v3, add } from '../sim/math/vec3.js'
import { type Quat, qFromAxisAngle, qMul, qRotate, qNormalize } from '../sim/math/quat.js'
import type { AircraftSpec } from '../sim/flight/schema.js'
import type { RenderState } from '../sim/interpolate.js'

export type CameraMode = 'chase' | 'cockpit'

export type EyeTransform = {
  readonly position: Vec3
  readonly attitude: Quat
}

/** Behind, above, and slightly off the centreline. Body frame. */
export const CHASE_OFFSET_M: readonly [number, number, number] = [-22, 6, 0]

/**
 * Fraction of the aircraft's pitch the chase camera follows. A little under
 * one, so a steep climb or dive keeps some horizon in frame.
 *
 * There is deliberately no roll constant. Roll is not damped, it is DISCARDED:
 * the chase attitude is rebuilt from heading and pitch only. Not a comfort
 * tweak -- Plan 1's golden trajectory is four continuous barrel rolls, and a
 * camera following roll through that is nauseating, with the flight model
 * getting the blame for a camera problem.
 */
export const CHASE_PITCH_FOLLOW = 0.92

/** Heading (yaw) of an attitude, radians, ignoring pitch and roll. */
function headingOf(q: Quat): number {
  const fwd = qRotate(q, v3(1, 0, 0))
  return Math.atan2(-fwd.z, fwd.x)
}

/** Pitch of an attitude, radians, positive nose-up. */
function pitchOf(q: Quat): number {
  const fwd = qRotate(q, v3(1, 0, 0))
  return Math.asin(Math.max(-1, Math.min(1, fwd.y)))
}

/**
 * Places the eye for a mode. A pure function of the current render state:
 * neither mode smooths over time, so there is no previous-eye or dt parameter
 * carried unused. A later smoothed mode (external orbit, padlock) adds them
 * when it has a consumer for them.
 */
export function cameraTransformFor(
  mode: CameraMode,
  spec: AircraftSpec,
  render: RenderState,
): EyeTransform {
  if (mode === 'cockpit') {
    const [ex, ey, ez] = spec.view.eyePointM
    return {
      position: add(render.position, qRotate(render.attitude, v3(ex, ey, ez))),
      // Rigid. Damping here would remove the information the view exists for.
      attitude: render.attitude,
    }
  }

  // Chase: follow position, heading and pitch; discard roll. Built from
  // heading and pitch rather than by damping the quaternion directly, because
  // blending toward level through an inverted attitude is ambiguous and can
  // flip -- this cannot.
  const heading = headingOf(render.attitude)
  const pitch = pitchOf(render.attitude) * CHASE_PITCH_FOLLOW
  const attitude = qNormalize(
    qMul(qFromAxisAngle(v3(0, 1, 0), heading), qFromAxisAngle(v3(0, 0, 1), pitch)),
  )

  const [ox, oy, oz] = CHASE_OFFSET_M
  const position = add(render.position, qRotate(attitude, v3(ox, oy, oz)))

  return { position, attitude }
}
