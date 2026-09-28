import { type Vec3, v3, add } from '../sim/math/vec3.js'
import { type Quat, qFromAxisAngle, qMul, qRotate, qNormalize } from '../sim/math/quat.js'
import type { AircraftSpec } from '../sim/flight/schema.js'
import type { RenderState } from '../sim/interpolate.js'
import type { LookOffset } from '../input/lookAround.js'
import { ORBIT_PITCH_MAX_RAD, ORBIT_ZERO, type OrbitOffset } from '../input/orbit.js'

export type CameraMode = 'chase' | 'cockpit'

/** How far above the surface under it the chase/orbit eye is held (orbit spec OC-3). */
export const ORBIT_SURFACE_CLEARANCE_M = 2

/** Bisection steps for the clamp's pitch search: 140 deg of range / 2^24, far below a pixel. */
const CLAMP_BISECTIONS = 24

/** Height of the surface (terrain, deck or sea) under a world x/z, metres. */
export type SurfaceHeightAt = (x: number, z: number) => number

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
 *  mask the airplane -- is a question about how it feels to fly behind it,
 *  decided in Task 13 with a view out of the window, not guessed here. */
export const CHASE_OFFSET_M: readonly [number, number, number] = [-22, 6, 0]

/** A smooth, bounded distance cue: 17.6 m aft at low speed, 26.4 m at high.
 * Scaling height with distance preserves framing as the aircraft gets smaller. */
export function chaseDistanceScale(speedMps: number): number {
  const t = Math.max(0, Math.min(1, (speedMps - 40) / 160))
  return 0.8 + 0.4 * t * t * (3 - 2 * t)
}

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

/** Rotation about world +Y from the identity nose (+X/east), not a compass
 * bearing. North (-Z) is +pi/2 here; the compass reads 000 there. */
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

/** DEV-only `?look=<yawDeg>,<pitchDeg>`: a fixed head offset (yaw positive
 *  left, pitch positive up, same axes as `LookOffset`) used whenever no look
 *  key is held. Added for Cloud Fidelity II's "photo" view (spec §5: from the
 *  runway, ~30 deg up), which the quarter-turn hat cannot produce. Throws on
 *  a malformed value rather than silently looking straight ahead. */
export const LOOK_PARAM = 'look'
export function lookFromQuery(search: string): LookOffset | undefined {
  const raw = new URLSearchParams(search).get(LOOK_PARAM)
  if (raw === null) return undefined
  const parts = raw.split(',')
  const [yaw, pitch] = parts.map((s) => (s.trim() === '' ? NaN : Number(s)))
  if (parts.length !== 2 || !Number.isFinite(yaw) || !Number.isFinite(pitch) || Math.abs(pitch!) > 80) {
    throw new Error(`${LOOK_PARAM}: ${JSON.stringify(raw)} is not "<yawDeg>,<pitchDeg>" with |pitch| <= 80`)
  }
  return { yawRad: (yaw! * Math.PI) / 180, pitchRad: (pitch! * Math.PI) / 180 }
}

/**
 * Turns a body-frame attitude plus a look-around offset into the attitude the
 * eye actually faces.
 *
 * The offset is applied AFTER the mode's own attitude -- `qMul(attitude,
 * offset)`, not `qMul(offset, attitude)` -- so it composes in body frame:
 * turning your head is relative to the airplane, not the world. Get this
 * order backwards and the view swings the wrong way whenever the airplane
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
 *
 * `orbit` (chase only) is the pilot's mouse swing, and still not smoothing:
 * it is an input like `look`, so the function stays pure. `surfaceHeightAt`
 * lets chase keep the eye out of the sea, the ground and a deck (orbit spec
 * OC-3); omitted, nothing is clamped. Neither touches the cockpit.
 */
export function cameraTransformFor(
  mode: CameraMode,
  spec: AircraftSpec,
  render: RenderState,
  look: LookOffset = LOOK_ZERO,
  speedMps = 120,
  orbit: OrbitOffset = ORBIT_ZERO,
  surfaceHeightAt?: SurfaceHeightAt,
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
  const chase = qNormalize(
    qMul(qFromAxisAngle(v3(0, 1, 0), heading), qFromAxisAngle(v3(0, 0, 1), pitch)),
  )
  const [ox, oy, oz] = CHASE_OFFSET_M
  const distanceScale = chaseDistanceScale(speedMps) * orbit.zoom
  const offset = v3(ox * distanceScale, oy * distanceScale, oz)
  // The orbit rotates the offset AND the eye's attitude by the same amount,
  // about the airplane, so the airplane keeps exactly the framing the default
  // view gives it (spec §3). Negated angles make +yaw swing left and +pitch
  // rise (plan ruling P-4). Skipped when there is no swing, so an unmoved
  // orbit is today's chase eye bit for bit (spec §7).
  const placedAt = (pitchRad: number): EyeTransform => {
    const attitude =
      orbit.yawRad === 0 && pitchRad === 0
        ? chase
        : qNormalize(
            qMul(chase, qMul(qFromAxisAngle(v3(0, 1, 0), -orbit.yawRad), qFromAxisAngle(v3(0, 0, 1), -pitchRad))),
          )
    return { position: add(render.position, qRotate(attitude, offset)), attitude }
  }
  // The floor is the surface under the eye, but never lower than the surface
  // under the AIRPLANE: raised around its orbit, the eye swings outward, and
  // off a carrier's deck edge the surface under it drops to the sea -- a floor
  // there would park the eye inside the hull, below the deck the airplane
  // sits on (final review fix pass).
  const airplaneFloor = surfaceHeightAt === undefined ? -Infinity : surfaceHeightAt(render.position.x, render.position.z)
  const floorAt = (p: Vec3): number => Math.max(surfaceHeightAt!(p.x, p.z), airplaneFloor) + ORBIT_SURFACE_CLEARANCE_M
  const belowFloor = (eye: EyeTransform): boolean =>
    surfaceHeightAt !== undefined && eye.position.y < floorAt(eye.position)

  // OC-3: never under the sea, the ground or a deck. The eye is RAISED
  // around its orbit -- the steepest pitch that clears the floor, found by
  // bisection -- rather than lifted straight up, because a lifted eye keeps an
  // attitude aimed from the unclamped place and a parked airplane drops off
  // the bottom of the screen (final review, Important 1). Raising keeps
  // position and attitude consistent, so spec §7's framing holds.
  let eye = placedAt(orbit.pitchRad)
  if (belowFloor(eye)) {
    let clear = ORBIT_PITCH_MAX_RAD
    if (belowFloor(placedAt(clear))) {
      // Nothing on the orbit clears (only possible with the airplane itself
      // almost on the surface): fall back to lifting the height.
      eye = { position: v3(eye.position.x, floorAt(eye.position), eye.position.z), attitude: eye.attitude }
    } else {
      let under = orbit.pitchRad
      for (let i = 0; i < CLAMP_BISECTIONS; i++) {
        const mid = (under + clear) / 2
        if (belowFloor(placedAt(mid))) under = mid
        else clear = mid
      }
      eye = placedAt(clear)
    }
  }

  return { position: eye.position, attitude: withLook(eye.attitude, look) }
}
