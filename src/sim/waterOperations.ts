import type { AircraftSpec } from './flight/schema.js'
import type { AircraftState, Controls } from './flight/state.js'
import { attitudeAngles } from './flight/attitude.js'
import { GROUND_CONTACT_TOLERANCE_M, SEPARATION_MPS } from './ground.js'
import { add, length, scale, sub, v3, ZERO, type Vec3 } from './math/vec3.js'

const G = 9.80665
const DEG = Math.PI / 180
const MAX_BANK_RAD = 10 * DEG
const MIN_PITCH_RAD = -2 * DEG
const MAX_PITCH_RAD = 12 * DEG
const GEAR_UP_FRACTION = 0.05
const FLOATS_DOWN_FRACTION = 0.95
const ARRIVAL_SINK_THRESHOLD_MPS = 0.1
const ATTITUDE_SETTLE_SECONDS = 1.5
const ATTITUDE_RATE_LIMIT_RAD_PER_S = 8 * DEG

const clamp01 = (n: number): number => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0

/** Keel height in world metres. The water contract deliberately uses one
 * content dimension rather than pretending the wheel datum is the hull. */
export function waterContactHeightM(spec: AircraftSpec, state: AircraftState): number {
  return state.position.y - (spec.waterOperations?.hullDepthM ?? 0)
}

/** Whether the opted-in hull is inside the same narrow contact band used by
 * the wheel model and is not already separating from the water. */
export function onWater(spec: AircraftSpec, state: AircraftState, waterHeightM: number): boolean {
  if (spec.waterOperations === undefined) return false
  if (!Number.isFinite(state.position.y) || !Number.isFinite(state.velocity.y)) return false
  if (state.velocity.y > SEPARATION_MPS) return false
  const height = waterContactHeightM(spec, state) - waterHeightM
  return height >= -GROUND_CONTACT_TOLERANCE_M && height <= GROUND_CONTACT_TOLERANCE_M
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
  const { pitchRad, rollRad } = attitudeAngles(state)
  const descending = rel.y < -ARRIVAL_SINK_THRESHOLD_MPS
  return onWater(spec, { ...state, velocity: rel }, waterHeightM)
    && Number.isFinite(speed)
    && Number.isFinite(rel.y)
    && rel.y >= -w.maxLandingSinkMps
    && (!descending || speed <= w.maxLandingSpeedMps)
    && Math.abs(rollRad) <= MAX_BANK_RAD
    && pitchRad >= MIN_PITCH_RAD
    && pitchRad <= MAX_PITCH_RAD
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

/** Project a supported hull onto flat water without creating mechanical
 * energy. This is the water equivalent of `restOnSurface`, with no terrain
 * rise or moving-wave term in the first implementation. */
export function restOnWater(
  spec: AircraftSpec,
  state: AircraftState,
  waterHeightM: number,
  surfaceVelocity: Vec3 = ZERO,
): AircraftState {
  const w = spec.waterOperations
  if (w === undefined) return state
  const targetY = waterHeightM + w.hullDepthM
  const dh = targetY - state.position.y
  const rel = sub(state.velocity, surfaceVelocity)
  if (dh <= 0) {
    if (rel.y > 0) return state
    return {
      ...state,
      position: v3(state.position.x, targetY, state.position.z),
      velocity: add(v3(rel.x, 0, rel.z), surfaceVelocity),
    }
  }
  if (dh > GROUND_CONTACT_TOLERANCE_M) return state
  const speed = length(rel)
  const available = 0.5 * speed * speed
  const cost = G * dh
  if (available < cost) return state
  const keptSpeed = Math.sqrt(2 * (available - cost))
  const kept = speed > 1e-9 ? scale(rel, keptSpeed / speed) : ZERO
  return {
    ...state,
    position: v3(state.position.x, targetY, state.position.z),
    velocity: add(v3(kept.x, 0, kept.z), surfaceVelocity),
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
): Vec3 {
  const w = spec.waterOperations
  if (w === undefined) return airRates
  const rel = sub(state.velocity, surfaceVelocity)
  const trackSpeed = Math.hypot(rel.x, rel.z)
  const f = planingFraction(spec, trackSpeed)
  const { pitchRad, rollRad } = attitudeAngles(state)
  const targetPitch = (w.restPitchDeg + f * (w.planingPitchDeg - w.restPitchDeg)) * DEG
  const clampRate = (n: number): number => Math.max(-ATTITUDE_RATE_LIMIT_RAD_PER_S, Math.min(ATTITUDE_RATE_LIMIT_RAD_PER_S, n))
  const roll = clampRate(-rollRad / ATTITUDE_SETTLE_SECONDS)
  const pitch = clampRate((targetPitch - pitchRad) / ATTITUDE_SETTLE_SECONDS)
  const taxiAuthority = Math.max(0, 1 - trackSpeed / w.takeoffSpeedMps)
  const taxiYaw = -Math.max(-1, Math.min(1, controls.yaw)) * w.taxiYawRateDegPerSec * DEG * taxiAuthority
  return v3(roll, airRates.y + taxiYaw, pitch)
}

