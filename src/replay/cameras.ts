import { aircraftById, playerAircraft, type World } from '../sim/loop.js'
import type { RenderState } from '../sim/interpolate.js'
import type { AircraftSpec } from '../sim/flight/schema.js'
import { DT } from '../sim/flight/model.js'
import { type Vec3, v3, add, sub, scale, length, normalize } from '../sim/math/vec3.js'
import { type Quat, qFromAxisAngle, qMul, qNormalize, qRotate } from '../sim/math/quat.js'
import {
  CHASE_OFFSET_M, CHASE_PITCH_FOLLOW, ORBIT_SURFACE_CLEARANCE_M, cameraTransformFor, chaseDistanceScale, chaseSizeScale, headingOf, pitchOf,
  type EyeTransform, type SurfaceHeightAt,
} from '../render/camera.js'
import { LOOK_CENTRE } from '../input/lookAround.js'
import {
  ORBIT_PITCH_MAX_RAD, ORBIT_PITCH_MIN_RAD, ORBIT_RAD_PER_PX, ORBIT_ZERO, ORBIT_ZOOM_MAX, ORBIT_ZOOM_MIN, orbitFromMouse,
  type MouseDelta, type OrbitOffset,
} from '../input/orbit.js'
import type { Recording } from './recorder.js'
import type { ReplayPoses } from './view.js'

/**
 * The six replay cameras (instant replay spec §5; plan rulings R-6, R-7,
 * R-10, R-11, R-13). Every function here is pure: the surface is passed in,
 * and `main.ts` owns the clock and the DOM.
 */
export type ReplayCameraId = 'auto' | 'orbit' | 'flyby' | 'target' | 'cockpit' | 'manual'
/** Button and `C`-cycle order (spec §5's table). */
export const REPLAY_CAMERAS: readonly ReplayCameraId[] = ['auto', 'orbit', 'flyby', 'target', 'cockpit', 'manual']

export type ManualCamera = { readonly position: Vec3; readonly yawRad: number; readonly pitchRad: number; readonly lock: boolean; readonly speedMps: number }
export type ReplayCameraState = {
  readonly selected: ReplayCameraId
  /** What Auto resolved to at replay start (spec §5): flyby, target or orbit. */
  readonly auto: 'orbit' | 'flyby' | 'target'
  readonly orbit: OrbitOffset
  readonly spin: boolean
  readonly flybyPoint: Vec3
  /** R-6: attacker, else nearest live aircraft within 3 km, else null (Target greyed out). */
  readonly targetId: string | null
  readonly manual: ManualCamera
}

export type ReplayCameraInput = { readonly mouse: MouseDelta; readonly held: ReadonlySet<string>; readonly realDtS: number }

/** Spec §5: Orbit spins at 12 deg per REAL second, so it keeps turning while paused (R-7). */
export const SPIN_RAD_PER_S = (12 * Math.PI) / 180
/** R-6: how near another airplane must be, at the last recorded world, to be Target's subject. */
export const TARGET_RADIUS_M = 3000
const TARGET_BACK_M = 25
const TARGET_UP_M = 6
const TARGET_RIGHT_M = 8
/** Spec §5 / R-11: the flyby point is picked from 3 s before the end, 2 s ahead, 25 m aside, 8 m up. */
const FLYBY_LOOKBACK_S = 3
const FLYBY_LEAD_S = 2
const FLYBY_SIDE_M = 25
const FLYBY_UP_M = 8
const MANUAL_START_SPEED_MPS = 30
const MANUAL_SPEED_MIN_MPS = 5
const MANUAL_SPEED_MAX_MPS = 200
const MANUAL_SPEED_PER_NOTCH = 1.25
const MANUAL_PITCH_LIMIT_RAD = (85 * Math.PI) / 180

const Y = v3(0, 1, 0)
const Z = v3(0, 0, 1)
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))
/** Same wrap as `input/orbit.ts`: to (-PI, PI]. */
const wrapPi = (a: number): number => {
  const w = a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI))
  return w === -Math.PI ? Math.PI : w
}
/** Attitude from a heading and a pitch: body +X forward, the chase camera's own construction. */
const headingPitch = (yawRad: number, pitchRad: number): Quat =>
  qNormalize(qMul(qFromAxisAngle(Y, yawRad), qFromAxisAngle(Z, pitchRad)))
/** Horizontal unit vector to the right of a direction (east -> south, +X -> +Z); zero when it is vertical. */
const rightOf = (d: Vec3): Vec3 => normalize(v3(-d.z, 0, d.x))
/** Every replay camera but Cockpit stays `ORBIT_SURFACE_CLEARANCE_M` above the surface under it (spec §5, orbit spec OC-3). */
const clampAbove = (p: Vec3, surfaceHeightAt: SurfaceHeightAt): Vec3 => {
  const floor = surfaceHeightAt(p.x, p.z) + ORBIT_SURFACE_CLEARANCE_M
  return p.y >= floor ? p : v3(p.x, floor, p.z)
}

/** An attitude whose body +X points from `from` at `to`, rolled level. Identity-heading when the two coincide. */
export function lookAt(from: Vec3, to: Vec3): Quat {
  const f = normalize(sub(to, from))
  return headingPitch(Math.atan2(-f.z, f.x), Math.asin(clamp(f.y, -1, 1)))
}

/**
 * The orbit offset that places the chase/orbit eye at `eye` (R-13): the exact
 * inverse of `cameraTransformFor('chase', ...)`'s placement, which rotates
 * `CHASE_OFFSET_M` (elevation `atan2(6, 22)` behind the airplane) by
 * `chase * Y(-yaw) * Z(-pitch)`. Clamped to the orbit limits, so a handover
 * from far away keeps the bearing but not the distance.
 */
export function orbitFromEye(eye: Vec3, render: RenderState, speedMps: number, spec: AircraftSpec): OrbitOffset {
  const chase = headingPitch(headingOf(render.attitude), pitchOf(render.attitude) * CHASE_PITCH_FOLLOW)
  const inverse: Quat = { x: -chase.x, y: -chase.y, z: -chase.z, w: chase.w }
  const local = qRotate(inverse, sub(eye, render.position))
  const d = length(local)
  if (d === 0) return { ...ORBIT_ZERO, zoom: ORBIT_ZOOM_MIN }
  const [ox, oy, oz] = CHASE_OFFSET_M
  const e0 = Math.atan2(oy, -ox)
  return {
    yawRad: wrapPi(Math.atan2(-local.z, -local.x)),
    pitchRad: clamp(Math.asin(clamp(local.y / d, -1, 1)) - e0, ORBIT_PITCH_MIN_RAD, ORBIT_PITCH_MAX_RAD),
    zoom: clamp(d / (Math.hypot(ox, oy, oz) * chaseDistanceScale(speedMps) * chaseSizeScale(spec)), ORBIT_ZOOM_MIN, ORBIT_ZOOM_MAX),
  }
}

const isLive = (w: World<undefined>, id: string): boolean => {
  const a = aircraftById(w, id)
  return a !== undefined && a.impact === null && (w.combat.aircraft[id]?.damage.destroyedAt ?? null) === null
}

/** R-6: the attacker if it is still in the recording, else the nearest live airplane within 3 km, else null. */
function targetAt(w: World<undefined>): string | null {
  const attacker = w.combat.aircraft[w.player]?.damage.attacker ?? null
  if (attacker !== null && attacker !== w.player && aircraftById(w, attacker) !== undefined) return attacker
  const me = playerAircraft(w).state.position
  let best: string | null = null
  let bestM = TARGET_RADIUS_M
  for (const a of w.aircraft) {
    if (a.id === w.player || !isLive(w, a.id)) continue
    const m = length(sub(a.state.position, me))
    if (m <= bestM) { best = a.id; bestM = m }
  }
  return best
}

/** Spec §5 / R-11: beside the player's recent path, so the player passes the point rather than flies at it. */
function flybyPointOf(rec: Recording, surfaceHeightAt: SurfaceHeightAt): Vec3 {
  const ws = rec.worlds
  const wantS = ws[ws.length - 1]!.tick * DT - FLYBY_LOOKBACK_S
  const from = ws.reduce((b, w) => (Math.abs(w.tick * DT - wantS) < Math.abs(b.tick * DT - wantS) ? w : b))
  const { position: p, velocity: v } = playerAircraft(from).state
  const side = rightOf(v)
  const q = add(add(p, scale(v, FLYBY_LEAD_S)), scale(length(side) === 0 ? Z : side, FLYBY_SIDE_M))
  return clampAbove(v3(q.x, q.y + FLYBY_UP_M, q.z), surfaceHeightAt)
}

/**
 * The camera state at replay start. `kind: 'auto'` resolves Auto once, at the
 * last recorded world (spec §5): a shoot-down with a target frames the
 * attacker -- checked first, so shot down and then into the sea still does --
 * a crash is a flyby, anything else orbits. `kind: 'orbit'` is a manual replay.
 */
export function initialCameraState(rec: Recording, surfaceHeightAt: SurfaceHeightAt, kind: 'auto' | 'orbit'): ReplayCameraState {
  const last = rec.worlds[rec.worlds.length - 1]!
  const player = playerAircraft(last)
  const targetId = targetAt(last)
  const destroyed = (last.combat.aircraft[last.player]?.damage.destroyedAt ?? null) !== null
  const auto = destroyed && targetId !== null ? 'target' : player.impact !== null ? 'flyby' : 'orbit'
  return {
    selected: kind,
    auto,
    orbit: ORBIT_ZERO,
    spin: true,
    flybyPoint: flybyPointOf(rec, surfaceHeightAt),
    targetId,
    manual: { position: player.state.position, yawRad: 0, pitchRad: 0, lock: false, speedMps: MANUAL_START_SPEED_MPS },
  }
}

export function effectiveCamera(s: ReplayCameraState): Exclude<ReplayCameraId, 'auto'> {
  return s.selected === 'auto' ? s.auto : s.selected
}

const orbitEye = (s: ReplayCameraState, pose: ReplayPoses, surfaceHeightAt: SurfaceHeightAt): EyeTransform =>
  cameraTransformFor('chase', playerAircraft(pose.world).spec, pose.render, LOOK_CENTRE, pose.speedMps, s.orbit, surfaceHeightAt)

/** Where the eye is for this state at this recorded moment. */
export function replayEye(s: ReplayCameraState, pose: ReplayPoses, surfaceHeightAt: SurfaceHeightAt): EyeTransform {
  const player = pose.render.position
  switch (effectiveCamera(s)) {
    case 'orbit':
      return orbitEye(s, pose, surfaceHeightAt)
    case 'cockpit':
      return cameraTransformFor('cockpit', playerAircraft(pose.world).spec, pose.render)
    case 'flyby':
      return { position: s.flybyPoint, attitude: lookAt(s.flybyPoint, player) }
    case 'target': {
      const i = s.targetId === null ? -1 : pose.world.aircraft.findIndex((a) => a.id === s.targetId)
      if (i < 0) return orbitEye(s, pose, surfaceHeightAt)
      const target = pose.poses[i]!.position
      const d = normalize(sub(target, player))
      const over = add(add(sub(player, scale(d, TARGET_BACK_M)), v3(0, TARGET_UP_M, 0)), scale(rightOf(d), TARGET_RIGHT_M))
      const position = clampAbove(over, surfaceHeightAt)
      return { position, attitude: lookAt(position, target) }
    }
    case 'manual': {
      const m = s.manual
      const position = clampAbove(m.position, surfaceHeightAt)
      return { position, attitude: m.lock ? lookAt(position, player) : headingPitch(m.yawRad, m.pitchRad) }
    }
  }
}

/** Manual starts exactly where the previous camera's eye was, looking the same way (spec §5). */
const manualFrom = (eye: EyeTransform): ManualCamera => ({
  position: eye.position,
  yawRad: headingOf(eye.attitude),
  pitchRad: clamp(pitchOf(eye.attitude), -MANUAL_PITCH_LIMIT_RAD, MANUAL_PITCH_LIMIT_RAD),
  lock: false,
  speedMps: MANUAL_START_SPEED_MPS,
})

/**
 * Switch camera. `eye` is the current eye (Manual starts there); `pose` is
 * unused today but is the moment the switch happens at, kept for symmetry
 * with `stepCameraState`. Never changes `flybyPoint` or `auto`; Target with
 * no target is a no-op returning `s` itself (R-6).
 */
export function selectCamera(s: ReplayCameraState, id: ReplayCameraId, eye: EyeTransform, _pose: ReplayPoses): ReplayCameraState {
  if (id === 'target' && s.targetId === null) return s
  if (id === s.selected) return s
  if (id === 'manual') return { ...s, selected: 'manual', manual: manualFrom(eye) }
  return { ...s, selected: id }
}

/** `C`: the next camera in `REPLAY_CAMERAS` order, skipping a greyed-out Target. */
export function cycleCamera(s: ReplayCameraState, eye: EyeTransform, pose: ReplayPoses): ReplayCameraState {
  let i = REPLAY_CAMERAS.indexOf(s.selected)
  do i = (i + 1) % REPLAY_CAMERAS.length
  while (REPLAY_CAMERAS[i] === 'target' && s.targetId === null)
  return selectCamera(s, REPLAY_CAMERAS[i]!, eye, pose)
}

/** `O` / the Spin button. Only Orbit reads it. */
export const toggleSpin = (s: ReplayCameraState): ReplayCameraState => ({ ...s, spin: !s.spin })
/** `L` / the Lock button: Manual as a tripod that turns to keep the player in frame. */
export const toggleLock = (s: ReplayCameraState): ReplayCameraState => ({ ...s, manual: { ...s.manual, lock: !s.manual.lock } })

const axis = (held: ReadonlySet<string>, plus: string, minus: string): number => (held.has(plus) ? 1 : 0) - (held.has(minus) ? 1 : 0)

function stepManual(m: ManualCamera, input: ReplayCameraInput, eye: EyeTransform): ManualCamera {
  const { mouse, held, realDtS } = input
  const yawRad = wrapPi(m.yawRad - mouse.dxPx * ORBIT_RAD_PER_PX)
  const pitchRad = clamp(m.pitchRad - mouse.dyPx * ORBIT_RAD_PER_PX, -MANUAL_PITCH_LIMIT_RAD, MANUAL_PITCH_LIMIT_RAD)
  const speedMps = clamp(m.speedMps * MANUAL_SPEED_PER_NOTCH ** -mouse.wheelNotches, MANUAL_SPEED_MIN_MPS, MANUAL_SPEED_MAX_MPS)
  // Fold the surface clamp back into the state: `eye` is this camera's
  // clamped eye (same x/z, only y raised), so holding Q into the sea does not
  // bank depth that E must then climb out of before anything moves.
  const base = eye.position.x === m.position.x && eye.position.z === m.position.z && eye.position.y > m.position.y
    ? eye.position
    : m.position
  const forward = v3(Math.cos(yawRad), 0, -Math.sin(yawRad))
  const move = add(add(scale(forward, axis(held, 'KeyW', 'KeyS')), scale(rightOf(forward), axis(held, 'KeyD', 'KeyA'))), v3(0, axis(held, 'KeyE', 'KeyQ'), 0))
  // Normalized, so a diagonal is no faster than a straight line.
  const position = add(base, scale(normalize(move), speedMps * realDtS))
  return { ...m, position, yawRad, pitchRad, speedMps }
}

/**
 * One real frame of camera input. `eye` is this state's current eye (from
 * `replayEye`). A drag while on Flyby or Target hands over to Orbit from
 * that eye, so taking over never jumps (spec §5, R-13), then applies the
 * drag. Orbit's spin advances with REAL time, paused or not (R-7), and any
 * drag or wheel stops it.
 */
export function stepCameraState(s: ReplayCameraState, input: ReplayCameraInput, eye: EyeTransform, pose: ReplayPoses): ReplayCameraState {
  const { mouse, realDtS } = input
  const drag = mouse.dxPx !== 0 || mouse.dyPx !== 0
  let cam = effectiveCamera(s)
  let next = s
  if (drag && (cam === 'flyby' || cam === 'target')) {
    next = { ...s, selected: 'orbit', orbit: orbitFromEye(eye.position, pose.render, pose.speedMps, playerAircraft(pose.world).spec), spin: false }
    cam = 'orbit'
  }
  if (cam === 'orbit') {
    const spin = next.spin && !drag && mouse.wheelNotches === 0
    const moved = orbitFromMouse(next.orbit, mouse)
    const orbit = spin && realDtS !== 0 ? { ...moved, yawRad: wrapPi(moved.yawRad + SPIN_RAD_PER_S * realDtS) } : moved
    return orbit === next.orbit && spin === next.spin ? next : { ...next, orbit, spin }
  }
  if (cam === 'manual') return { ...next, manual: stepManual(next.manual, input, eye) }
  return next
}
