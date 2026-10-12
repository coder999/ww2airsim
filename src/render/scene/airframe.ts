// src/render/scene/airframe.ts
import { Quaternion, Vector3, type Object3D } from 'three'
import { createRng } from '../../sim/rng.js'

/** A part an airframe module can articulate. `parts` lists only the ones its
 *  model actually has, so the Hangar bench can show the rest as "not
 *  modeled" instead of a slider that moves nothing (Hangar spec §7, Mark's
 *  decision 1, 2026-09-25). */
export type PartId = 'prop' | 'gear' | 'flaps' | 'surfaces' | 'doors' | 'turrets' | 'stores'

/** A fatal surface contact's renderer-only aftermath. The simulation keeps
 * its impact pose immutable for scoring and replay; an airframe uses this to
 * animate that frozen pose without feeding anything back into physics. */
export interface SurfaceCrashVisual {
  readonly mode: 'breakup' | 'submerge'
  readonly seed: number
  /** Frozen world velocity at contact. Solid-crash choreography inherits this momentum. */
  readonly velocity?: { readonly x: number; readonly y: number; readonly z: number }
  /** Empty mass plus remaining fuel. Heavy aircraft rebound and tumble less. */
  readonly massKg?: number
  /** Lifts a penetrated impact pose back to the captured solid surface before bouncing. */
  readonly surfaceLiftM?: number
}

/** The sea has covered the largest flyable airframe by this depth. ESTIMATE. */
export const WATER_CRASH_SUBMERGE_M = 12
/** Seconds from impact to the full submergence depth. ESTIMATE. */
export const WATER_CRASH_SUBMERGE_S = 2.5

export interface SurfaceCrashClock {
  readonly key: string | null
  readonly ageS: number
}

export const NO_SURFACE_CRASH_CLOCK: SurfaceCrashClock = { key: null, ageS: 0 }

/** Advance one airframe's visual crash clock. A changed crash (or a replay
 * scrubbed back before it) starts clean; invalid frame deltas cannot poison
 * the animation. Pure so both airframe implementations share one rule. */
export function stepSurfaceCrashClock(
  before: SurfaceCrashClock,
  crash: SurfaceCrashVisual | null | undefined,
  frameS: number,
): SurfaceCrashClock {
  if (crash == null) return NO_SURFACE_CRASH_CLOCK
  const key = `${crash.mode}:${crash.seed}`
  if (before.key !== key) return { key, ageS: 0 }
  const dt = Number.isFinite(frameS) && frameS > 0 ? frameS : 0
  return { key, ageS: before.ageS + dt }
}

/** Smoothly lower a fatal water crash below the ocean while its splash hides
 * the transition. The root is re-posed from simulation every frame, so this
 * is an absolute offset rather than an accumulated one. */
export function waterCrashSubmergeM(ageS: number): number {
  const t = Math.min(1, Math.max(0, ageS / WATER_CRASH_SUBMERGE_S))
  const smooth = t * t * (3 - 2 * t)
  return WATER_CRASH_SUBMERGE_M * smooth
}

/** Renderer time after which a solid-impact fuselage has effectively settled. ESTIMATE. */
export const SOLID_CRASH_SETTLE_S = 8

export interface SolidCrashMotion {
  readonly offset: { readonly x: number; readonly y: number; readonly z: number }
  /** World-space rotation composed in front of the frozen impact attitude. */
  readonly rotation: { readonly x: number; readonly y: number; readonly z: number; readonly w: number }
  /** Longitudinal compression fraction. A restrained silhouette deformation, not structural FEA. */
  readonly crush: number
}

const finite = (n: number | undefined, fallback = 0): number =>
  typeof n === 'number' && Number.isFinite(n) ? n : fallback
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

/** Height of a point-mass rebound with successively smaller hops. This is analytical per hop, so
 * frame rate cannot change the result and a replay can jump directly to any age. */
function reboundHeightM(ageS: number, firstUpMps: number, restitution: number): number {
  let left = ageS
  let up = firstUpMps
  const gravity = 9.80665
  for (let bounce = 0; bounce < 12 && up >= 0.35; bounce++) {
    const duration = 2 * up / gravity
    if (left <= duration) return Math.max(0, up * left - 0.5 * gravity * left * left)
    left -= duration
    up *= restitution
  }
  return 0
}

/** A deterministic, deliberately bounded solid-impact aftermath. It preserves the contact
 * direction, but caps slide distance and rebound so an arcade crash stays in the debrief camera.
 * Mass changes the choreography: a fighter can hop and tumble; a bomber heaves, slides and settles.
 * The simulation remains frozen at its authoritative impact pose. */
export function solidCrashMotion(ageS: number, crash: SurfaceCrashVisual): SolidCrashMotion {
  const age = clamp(finite(ageS), 0, SOLID_CRASH_SETTLE_S)
  const r = createRng(crash.seed)
  const v = crash.velocity
  const vx = finite(v?.x), vy = finite(v?.y), vz = finite(v?.z)
  const horizontalMps = Math.hypot(vx, vz)
  const speedMps = Math.hypot(vx, vy, vz)
  const sinkMps = Math.max(0, -vy)
  const randomHeading = r() * Math.PI * 2
  const alongX = horizontalMps > 0.01 ? vx / horizontalMps : Math.cos(randomHeading)
  const alongZ = horizontalMps > 0.01 ? vz / horizontalMps : Math.sin(randomHeading)
  // A damaged airframe rarely tracks perfectly straight after first contact. Keep the swerve small.
  const swerve = (r() * 2 - 1) * 0.12
  const dx0 = alongX - alongZ * swerve
  const dz0 = alongZ + alongX * swerve
  const directionLength = Math.hypot(dx0, dz0)
  const dx = dx0 / directionLength, dz = dz0 / directionLength

  const massKg = clamp(finite(crash.massKg, 3500), 1000, 70000)
  const heavy = clamp((massKg - 3500) / 30000, 0, 1)
  const severity = clamp((speedMps - 15) / 95, 0, 1)
  const steep = clamp(sinkMps / Math.max(1, speedMps), 0, 1)
  const moving = clamp(speedMps / 12, 0, 1)
  const reboundMps = clamp(0.6 + sinkMps * 0.14 + horizontalMps * 0.018, 0.6, 8) * (1 - 0.42 * heavy) * moving
  const bounceM = reboundHeightM(age, reboundMps, 0.3 - 0.1 * heavy)

  // Cap inherited ground speed: enough travel to read as momentum without letting the frozen
  // debrief camera lose the wreck. Exponential drag approaches a finite resting point.
  const slideMps = Math.min(horizontalMps, 55) * (0.9 + 0.2 * r())
  const dragPerS = 1.45 + 0.65 * heavy + 0.35 * steep
  const slideM = slideMps / dragPerS * (1 - Math.exp(-dragPerS * age))

  const tumbleAxis = new Vector3(-dz, (r() * 2 - 1) * 0.28, dx).normalize()
  const tumbleRate = (0.75 + 2.8 * severity + 1.1 * steep) * (1 - 0.55 * heavy) * (0.85 + 0.3 * r()) * moving
  const tumbleDamping = 0.7 + 0.4 * heavy
  const tumbleRad = tumbleRate / tumbleDamping * (1 - Math.exp(-tumbleDamping * age))
  const yawRate = (r() * 2 - 1) * (0.35 + 0.9 * severity) * (1 - 0.35 * heavy) * moving
  const yawRad = yawRate / 1.1 * (1 - Math.exp(-1.1 * age))
  const rotation = new Quaternion().setFromAxisAngle(tumbleAxis, tumbleRad)
  rotation.premultiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yawRad))

  const crushEase = 1 - Math.exp(-age / 0.12)
  const crush = (0.025 + 0.055 * severity) * crushEase * moving
  return {
    offset: { x: dx * slideM, y: Math.max(0, finite(crash.surfaceLiftM)) + bounceM, z: dz * slideM },
    rotation: { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
    crush,
  }
}

/** Apply a renderer-only crash pose after main.ts has restored the immutable simulation pose.
 * Reset scale unconditionally because unlike position/orientation it is not set by main each frame. */
export function applySurfaceCrashPose(root: Object3D, crash: SurfaceCrashVisual | null | undefined, ageS: number): void {
  root.scale.set(1, 1, 1)
  if (crash == null) return
  if (crash.mode === 'submerge') {
    root.position.y -= waterCrashSubmergeM(ageS)
    return
  }
  const motion = solidCrashMotion(ageS, crash)
  root.position.x += motion.offset.x
  root.position.y += motion.offset.y
  root.position.z += motion.offset.z
  root.quaternion.premultiply(new Quaternion(
    motion.rotation.x, motion.rotation.y, motion.rotation.z, motion.rotation.w,
  ))
  // A small longitudinal compression and belly flattening read as a buckled hull at game distance.
  // Keeping it below eight percent avoids turning shared aircraft art into rubber.
  root.scale.set(1 - motion.crush, 1 - motion.crush * 0.35, 1 + motion.crush * 0.08)
}

/** Everything one airframe needs to pose itself for one rendered frame. */
export interface AirframeUpdate {
  /** `AircraftState.gearFraction`: 1 = down, 0 = up. */
  readonly gearFraction: number
  /** `AircraftState.flapFraction`: 0 = up, 1 = fully down. */
  readonly flapFraction: number
  /** `AircraftState.bayDoorFraction`: 0 = shut, 1 = open (C2). */
  readonly bayDoorFraction: number
  /** [0, 1]. Pass 0 for a wreck, so its propeller stops. */
  readonly throttle: number
  /** Per prop, port to starboard, for a multi-engine airplane whose engines differ (one dead and
   *  windmilling); null or absent, every prop follows `throttle`. */
  readonly propThrottles?: readonly number[] | null
  /** The pilot's command, for control surfaces where a model has them. */
  readonly controls: { readonly roll: number; readonly pitch: number; readonly yaw: number }
  /** Seconds since the last rendered frame. */
  readonly frameS: number
  /** Eye to this aircraft, meters: what a level-of-detail switch reads (Z3). */
  readonly cameraDistanceM: number
  /** Where the turrets point: a direction in the airframe's own frame (x forward, y up, z starboard),
   *  or null/absent to stow them. Visual only (turret aim plan, 2026-10-09). */
  readonly aim?: { readonly x: number; readonly y: number; readonly z: number } | null
  /** Destroyed in the air (damage stages, 2026-10-09): seconds since, and a per-aircraft seed, for
   *  the propellers and control surfaces breaking away. Null or absent: whole. A pure function of
   *  these two, so a replay scrubbed backwards puts the parts back. */
  readonly debris?: { readonly ageS: number; readonly seed: number } | null
  /** Fatal surface contact: land/deck breaks loose parts away; water lowers the wreck beneath the
   *  surface. Renderer-only because the immutable impact pose remains the simulation truth. */
  readonly surfaceCrash?: SurfaceCrashVisual | null
}

/** Implemented by every airframe module (hellcat.ts, wildcat.ts, and each
 *  model the registry in airframes.ts names). main.ts and scenarioEntities.ts
 *  drive whichever concrete airframe a spec's `view.model` names through this
 *  alone (A6M Zero spec §7.3). */
export interface Airframe {
  readonly root: Object3D
  readonly parts: readonly PartId[]
  setStores(bombsLeft: number, rocketsLeft: number): void
  /** One call per aircraft per rendered frame. Replaces spinProp/setGear (Z1). */
  update(u: AirframeUpdate): void
  /** Frees what this airframe owns and releases its model instances. Idempotent. */
  dispose(): void
}

/** Purely visual: gauges.ts explains why no tachometer is fitted -- there is
 *  no modeled engine RPM to drive it honestly. The prop turns at an arbitrary
 *  rate scaled by throttle; it confirms throttle reaches the frame state, not
 *  that it reaches the simulation (Task 13 review, measured 2026-09-13).
 *  Moved here from main.ts (Z1) when every aircraft's prop started turning. */
export const PROP_MAX_RAD_PER_SEC = 40

/** The propeller angle one frame later, wrapped to [0, 2 pi). Pure, so the rate is a test, not a claim. */
export function propAngle(prevRad: number, throttle: number, frameS: number): number {
  const next = prevRad + throttle * PROP_MAX_RAD_PER_SEC * frameS
  const turn = 2 * Math.PI
  return ((next % turn) + turn) % turn
}
