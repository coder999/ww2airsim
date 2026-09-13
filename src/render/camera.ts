import { type Vec3, v3, add } from '../sim/math/vec3.js'
import { type Quat, qFromAxisAngle, qMul, qRotate, qNormalize } from '../sim/math/quat.js'
import type { AircraftSpec } from '../sim/flight/schema.js'
import type { RenderState } from '../sim/interpolate.js'
import type { LookOffset } from '../input/lookAround.js'

export type CameraMode = 'chase' | 'cockpit'

export type EyeTransform = {
  readonly position: Vec3
  readonly attitude: Quat
}

/**
 * Vertical field of view, degrees, for both camera modes.
 *
 * Exported because it is a LAYOUT constraint, not just a camera setting: the
 * cockpit panel has to fit inside it, and `panel.test.ts` asserts that it
 * does. Before 2026-09-13 main.ts held the only copy as a literal, and the
 * panel sat with its labels 38 degrees below the eye line against a 30-degree
 * screen edge -- every label and readout was off the bottom of the screen, and
 * nothing could tell, because nothing else knew what the field of view was.
 */
export const CAMERA_VFOV_DEG = 60

/** Behind and above, on the centreline (z = 0). Body frame. Whether it
 *  should sit off-centre instead -- some chase views do, so the tail doesn't
 *  mask the aeroplane -- is a question about how it feels to fly behind it,
 *  decided in Task 13 with a view out of the window, not guessed here. */
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

const LOOK_ZERO: LookOffset = { yawRad: 0, pitchRad: 0 }

/**
 * Turns a body-frame attitude plus a look-around offset into the attitude the
 * eye actually faces.
 *
 * The offset is applied AFTER the mode's own attitude -- `qMul(attitude,
 * offset)`, not `qMul(offset, attitude)` -- so it composes in body frame:
 * turning your head is relative to the aeroplane, not the world. Get this
 * order backwards and the view swings the wrong way whenever the aeroplane
 * isn't level, which in a fighter is most of the time. See
 * tests/render/camera.test.ts's "body frame, not world frame" case, taken
 * steeply banked, where the two orders visibly disagree.
 */
function withLook(attitude: Quat, look: LookOffset): Quat {
  if (look.yawRad === 0 && look.pitchRad === 0) return attitude
  return qNormalize(
    qMul(
      attitude,
      qMul(qFromAxisAngle(v3(0, 1, 0), look.yawRad), qFromAxisAngle(v3(0, 0, 1), look.pitchRad)),
    ),
  )
}

/**
 * Places the eye for a mode. A pure function of its arguments: neither mode
 * smooths over time, so there is no previous-eye or dt parameter carried
 * unused. A later smoothed mode (external orbit, padlock) adds them when it
 * has a consumer for them.
 *
 * `look` defaults to centred so every existing call site (and the tests
 * written before Task 9) keeps working unchanged.
 */
export function cameraTransformFor(
  mode: CameraMode,
  spec: AircraftSpec,
  render: RenderState,
  look: LookOffset = LOOK_ZERO,
): EyeTransform {
  if (mode === 'cockpit') {
    const [ex, ey, ez] = spec.view.eyePointM
    return {
      position: add(render.position, qRotate(render.attitude, v3(ex, ey, ez))),
      // Rigid. Damping here would remove the information the view exists for.
      attitude: withLook(render.attitude, look),
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

  return { position, attitude: withLook(attitude, look) }
}
