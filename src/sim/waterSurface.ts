import { ZERO, type Vec3 } from './math/vec3.js'

/**
 * The simulation's inexpensive support sea.
 *
 * The rendered ocean is a many-frequency GPU FFT and cannot be read back at
 * every aircraft/ship contact point.  This four-component deep-water model is
 * therefore the shared deterministic contact oracle for every seaworthy
 * craft.  It follows the same Beaufort height table and simulation clock as
 * the rendered sea, but is intentionally not crest-for-crest identical.
 */
export type WaterSurfaceContext = {
  readonly timeS: number
  /** Air velocity in world axes. `null` means the project's default force-4 sea. */
  readonly wind: Vec3 | null
}

export type WaterSurfaceSample = {
  readonly heightM: number
  readonly verticalSpeedMps: number
  /** dh/dx and dh/dz, dimensionless. */
  readonly slopeX: number
  readonly slopeZ: number
}

export type WatercraftPose = {
  readonly heightM: number
  readonly verticalSpeedMps: number
  readonly pitchRad: number
  readonly rollRad: number
}

const G = 9.80665
const DEFAULT_FORCE = 4
const WAVE_HEIGHT_M = [0, 0.1, 0.2, 0.6, 1, 2, 3, 4, 5.5, 7, 9, 11.5, 14] as const
const REPRESENTATIVE_WIND_MPS = [0, 1, 2.5, 4.4, 6.7, 9.4, 12.3, 15.5, 19, 22.6, 26.5, 30.6, 34] as const
// The contact sea keeps only hull-scale and longer energy. Capillary/short
// wind waves belong to the renderer and local spray; making a 20 m flying
// boat follow them point-for-point produces impossible vertical velocities.
const BASE_WAVELENGTH_M = [35, 70, 140, 280] as const
const AMPLITUDE_WEIGHTS = [0.265, 0.188, 0.121, 0.066] as const
const DIRECTION_OFFSETS_RAD = [-0.32, 0, 0.21, 0.55] as const
const PHASES_RAD = [0.7, 2.3, 4.9, 5.8] as const

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n))

/** Nearest representative Beaufort force; calm scenarios retain the project's force-4 sea. */
export function waterForceForWind(wind: Vec3 | null): number {
  if (wind === null) return DEFAULT_FORCE
  const speed = Math.hypot(wind.x, wind.z)
  if (!Number.isFinite(speed)) return DEFAULT_FORCE
  let best = 0
  for (let force = 1; force < REPRESENTATIVE_WIND_MPS.length; force++) {
    if (Math.abs(REPRESENTATIVE_WIND_MPS[force]! - speed) < Math.abs(REPRESENTATIVE_WIND_MPS[best]! - speed)) best = force
  }
  return best
}

export const waterSurfaceContext = (timeS: number, wind: Vec3 | null): WaterSurfaceContext => ({
  timeS: Number.isFinite(timeS) && timeS >= 0 ? timeS : 0,
  wind,
})

/** Sample absolute sea-surface height, fixed-point vertical velocity and slopes. */
export function waterSurfaceAt(ctx: WaterSurfaceContext | undefined, x: number, z: number): WaterSurfaceSample {
  if (ctx === undefined) return { heightM: 0, verticalSpeedMps: 0, slopeX: 0, slopeZ: 0 }
  const force = waterForceForWind(ctx.wind)
  const significantHeightM = WAVE_HEIGHT_M[force]!
  if (significantHeightM === 0) return { heightM: 0, verticalSpeedMps: 0, slopeX: 0, slopeZ: 0 }

  const windSpeed = REPRESENTATIVE_WIND_MPS[force]!
  const lengthScale = clamp((windSpeed / REPRESENTATIVE_WIND_MPS[DEFAULT_FORCE]!) ** 2, 0.45, 5)
  // Wind is the direction the air travels toward. With no authored wind the
  // support sea follows the renderer's +x default.
  const direction = ctx.wind === null || Math.hypot(ctx.wind.x, ctx.wind.z) < 1e-9
    ? 0
    : Math.atan2(ctx.wind.z, ctx.wind.x)
  let heightM = 0, verticalSpeedMps = 0, slopeX = 0, slopeZ = 0
  for (let i = 0; i < BASE_WAVELENGTH_M.length; i++) {
    const wavelengthM = BASE_WAVELENGTH_M[i]! * lengthScale
    const k = 2 * Math.PI / wavelengthM
    const omega = Math.sqrt(G * k)
    const angle = direction + DIRECTION_OFFSETS_RAD[i]!
    const dx = Math.cos(angle), dz = Math.sin(angle)
    const amplitudeM = significantHeightM * AMPLITUDE_WEIGHTS[i]!
    const phase = k * (x * dx + z * dz) - omega * ctx.timeS + PHASES_RAD[i]!
    const s = Math.sin(phase), c = Math.cos(phase)
    heightM += amplitudeM * s
    verticalSpeedMps -= amplitudeM * omega * c
    slopeX += amplitudeM * k * dx * c
    slopeZ += amplitudeM * k * dz * c
  }
  return { heightM, verticalSpeedMps, slopeX, slopeZ }
}

/**
 * A rigid craft supported at bow/stern and port/starboard. Long/wide hulls
 * naturally average over more water and therefore heave/rotate less than a
 * flying boat; the extra length response represents their greater inertia.
 */
export function watercraftPoseAt(
  ctx: WaterSurfaceContext | undefined,
  x: number,
  z: number,
  headingRad: number,
  lengthM: number,
  beamM: number,
): WatercraftPose {
  if (ctx === undefined) return { heightM: 0, verticalSpeedMps: 0, pitchRad: 0, rollRad: 0 }
  const bow = { x: Math.sin(headingRad), z: -Math.cos(headingRad) }
  const starboard = { x: Math.cos(headingRad), z: Math.sin(headingRad) }
  const halfLength = Math.max(1, lengthM * 0.38)
  const halfBeam = Math.max(1, beamM * 0.42)
  const sample = (along: number, across: number) => waterSurfaceAt(
    ctx,
    x + bow.x * along + starboard.x * across,
    z + bow.z * along + starboard.z * across,
  )
  const center = sample(0, 0)
  const fore = sample(halfLength, 0), aft = sample(-halfLength, 0)
  const stbd = sample(0, halfBeam), port = sample(0, -halfBeam)
  const inertiaResponse = clamp(75 / Math.max(15, lengthM), 0.22, 1)
  const maxPitch = (2.5 * Math.PI / 180) * inertiaResponse
  const maxRoll = (4 * Math.PI / 180) * inertiaResponse
  return {
    heightM: (2 * center.heightM + fore.heightM + aft.heightM + stbd.heightM + port.heightM) / 6,
    verticalSpeedMps: (2 * center.verticalSpeedMps + fore.verticalSpeedMps + aft.verticalSpeedMps + stbd.verticalSpeedMps + port.verticalSpeedMps) / 6,
    pitchRad: clamp(Math.atan2(fore.heightM - aft.heightM, 2 * halfLength) * inertiaResponse, -maxPitch, maxPitch),
    // Positive body roll lowers starboard in the project's x-forward/y-up/z-starboard frame.
    rollRad: clamp(Math.atan2(port.heightM - stbd.heightM, 2 * halfBeam) * inertiaResponse, -maxRoll, maxRoll),
  }
}

export const FLAT_WATER_VELOCITY = ZERO
