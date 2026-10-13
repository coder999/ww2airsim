import type { AircraftSpec } from './flight/schema.js'
import type { AircraftState, Controls } from './flight/state.js'
import { attitudeAngles } from './flight/attitude.js'
import { GROUND_CONTACT_TOLERANCE_M, SEPARATION_MPS } from './ground.js'
import { add, length, sub, v3, ZERO, type Vec3 } from './math/vec3.js'
import type { WaterSurfaceSample } from './waterSurface.js'

const G = 9.80665
const DEG = Math.PI / 180
const MAX_BANK_RAD = 10 * DEG
const MIN_PITCH_RAD = -2 * DEG
const MAX_PITCH_RAD = 12 * DEG
const GEAR_UP_FRACTION = 0.05
const FLOATS_DOWN_FRACTION = 0.95
const ATTITUDE_SETTLE_SECONDS = 1.5
const ATTITUDE_RATE_LIMIT_RAD_PER_S = 8 * DEG
const WATER_SEPARATION_DEPTH_M = 0.02

const clamp01 = (n: number): number => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0

/** Velocity of the sampled support height along a craft's horizontal path:
 * fixed-point wave rise plus the slope crossed each second. */
export function waterSupportVelocity(
  surfaceVelocity: Vec3,
  sample: WaterSurfaceSample | null,
  craftVelocity: Vec3,
): Vec3 {
  if (sample === null) return surfaceVelocity
  return v3(
    surfaceVelocity.x,
    surfaceVelocity.y + sample.slopeX * craftVelocity.x + sample.slopeZ * craftVelocity.z,
    surfaceVelocity.z,
  )
}

/** Keel height in world metres. The water contract deliberately uses one
 * content dimension rather than pretending the wheel datum is the hull. */
export function waterContactHeightM(spec: AircraftSpec, state: AircraftState): number {
  return state.position.y - (spec.waterOperations?.hullDepthM ?? 0)
}

/** Whether the opted-in hull has met the surface and has not sunk below its
 * authored displacement draft. The upper edge remains the narrow touchdown
 * band; the lower edge is the supported volume of the hull. */
export function onWater(spec: AircraftSpec, state: AircraftState, waterHeightM: number): boolean {
  if (spec.waterOperations === undefined) return false
  if (!Number.isFinite(state.position.y) || !Number.isFinite(state.velocity.y)) return false
  const height = waterContactHeightM(spec, state) - waterHeightM
  // A rising hull is still supported while its keel remains immersed. Only
  // release it once it has climbed through the final skin of the surface.
  if (height >= -WATER_SEPARATION_DEPTH_M && state.velocity.y > SEPARATION_MPS) return false
  return height >= -spec.waterOperations.displacementDraftM - GROUND_CONTACT_TOLERANCE_M
    && height <= GROUND_CONTACT_TOLERANCE_M
}

/** Safe, load-bearing water contact. A level/planing run is not speed-capped;
 * the landing-speed limit applies only to a genuine descending arrival. */
export function supportedWaterContact(
  spec: AircraftSpec,
  state: AircraftState,
  waterHeightM: number,
  surfaceVelocity: Vec3 = ZERO,
): boolean {
  const w = spec.waterOperations
  // Amphibians reuse the flap lever/state for their retractable stabilizing floats: they have
  // no aerodynamic flaps in this first water-aircraft contract. Safe hull support therefore
  // requires wheels up and floats fully down.
  if (w === undefined || state.gearFraction > GEAR_UP_FRACTION || state.flapFraction < FLOATS_DOWN_FRACTION) return false
  const rel = sub(state.velocity, surfaceVelocity)
  const speed = length(rel)
  if (departingWater(spec, state, surfaceVelocity)) return false
  const { pitchRad, rollRad } = attitudeAngles(state)
  return onWater(spec, { ...state, velocity: rel }, waterHeightM)
    && Number.isFinite(speed)
    && Number.isFinite(rel.y)
    && rel.y >= -w.maxLandingSinkMps
    && Math.abs(rollRad) <= MAX_BANK_RAD
    && pitchRad >= MIN_PITCH_RAD
    && pitchRad <= MAX_PITCH_RAD
}

/** A planing hull releases support once it has reached takeoff speed and is
 * moving upward relative to the water. It can still be partly immersed on
 * this first free-flight step; that is a normal unstick, not an impact. */
export function departingWater(
  spec: AircraftSpec,
  state: AircraftState,
  surfaceVelocity: Vec3 = ZERO,
): boolean {
  const w = spec.waterOperations
  if (w === undefined) return false
  const rel = sub(state.velocity, surfaceVelocity)
  return Math.hypot(rel.x, rel.z) >= w.takeoffSpeedMps && rel.y > 0
}

/** Extra gate for the instant an airborne keel first crosses into water.
 * Once afloat, planing craft may safely exceed their landing-speed limit. */
export function safeWaterArrival(
  spec: AircraftSpec,
  state: AircraftState,
  waterHeightM: number,
  surfaceVelocity: Vec3 = ZERO,
): boolean {
  const w = spec.waterOperations
  if (w === undefined || !supportedWaterContact(spec, state, waterHeightM, surfaceVelocity)) return false
  const rel = sub(state.velocity, surfaceVelocity)
  return length(rel) <= w.maxLandingSpeedMps
}

/** Linear displacement-to-planing blend, clamped outside the authored band. */
export function planingFraction(spec: AircraftSpec, speedMps: number): number {
  const w = spec.waterOperations
  if (w === undefined) return 0
  return clamp01((speedMps - w.planingSpeedMps) / (w.takeoffSpeedMps - w.planingSpeedMps))
}

/** Water resistance magnitude. The coefficients are weight fractions, the
 * same simple shape runway rolling resistance uses. */
export function waterResistanceN(spec: AircraftSpec, massKg: number, speedMps: number): number {
  const w = spec.waterOperations
  if (w === undefined) return 0
  const f = planingFraction(spec, speedMps)
  const coeff = w.displacementDragCoeff + f * (w.planingDragCoeff - w.displacementDragCoeff)
  return coeff * massKg * G
}

/** Seat a supported hull at its speed-dependent draft and carry the local
 * surface's vertical velocity. A moving support sea can exchange energy with
 * the craft; unlike fixed terrain that is real wave work, not numerical gain. */
export function restOnWater(
  spec: AircraftSpec,
  state: AircraftState,
  waterHeightM: number,
  surfaceVelocity: Vec3 = ZERO,
): AircraftState {
  const w = spec.waterOperations
  if (w === undefined) return state
  const rel = sub(state.velocity, surfaceVelocity)
  const trackSpeed = Math.hypot(rel.x, rel.z)
  const f = planingFraction(spec, trackSpeed)
  const draftM = w.displacementDraftM + f * (w.planingDraftM - w.displacementDraftM)
  const targetY = waterHeightM + w.hullDepthM - draftM
  return {
    ...state,
    position: v3(state.position.x, targetY, state.position.z),
    velocity: add(v3(rel.x, 0, rel.z), surfaceVelocity),
  }
}

/** Low-speed hull/float attitude constraint. Roll and pitch settle toward a
 * stable water attitude; rudder supplies taxi yaw and fades by liftoff. */
export function waterBodyRates(
  spec: AircraftSpec,
  state: AircraftState,
  controls: Controls,
  airRates: Vec3,
  surfaceVelocity: Vec3 = ZERO,
  surfaceAttitude: { readonly pitchRad: number; readonly rollRad: number } = { pitchRad: 0, rollRad: 0 },
): Vec3 {
  const w = spec.waterOperations
  if (w === undefined) return airRates
  const rel = sub(state.velocity, surfaceVelocity)
  const trackSpeed = Math.hypot(rel.x, rel.z)
  const f = planingFraction(spec, trackSpeed)
  const { pitchRad, rollRad } = attitudeAngles(state)
  const waveResponse = 1 - 0.72 * f
  const targetPitch = (w.restPitchDeg + f * (w.planingPitchDeg - w.restPitchDeg)) * DEG
    + surfaceAttitude.pitchRad * waveResponse
  const clampRate = (n: number): number => Math.max(-ATTITUDE_RATE_LIMIT_RAD_PER_S, Math.min(ATTITUDE_RATE_LIMIT_RAD_PER_S, n))
  const roll = clampRate((surfaceAttitude.rollRad * waveResponse - rollRad) / ATTITUDE_SETTLE_SECONDS)
  const pitch = clampRate((targetPitch - pitchRad) / ATTITUDE_SETTLE_SECONDS)
  const taxiAuthority = Math.max(0, 1 - trackSpeed / w.takeoffSpeedMps)
  const taxiYaw = -Math.max(-1, Math.min(1, controls.yaw)) * w.taxiYawRateDegPerSec * DEG * taxiAuthority
  return v3(roll, airRates.y + taxiYaw, pitch)
}

