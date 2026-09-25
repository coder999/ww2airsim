import { skyIrradiance, sunColorAt, type Rgb } from './atmosphere.js'

/**
 * The scene's light as a function of eye altitude and sun elevation, from the
 * physically based atmosphere (photoreal Task 9, spec §4.3). Replaces Plan
 * 16c's hand-tuned keys, which the spec retires. Pure apart from a one-entry
 * cache of the expensive sky irradiance (below).
 *
 * Units: scene-linear, the space three's lights and every shader uniform
 * receive. The CPU model (`atmosphere.ts`) and the GPU LUTs
 * (`atmosphereLuts.ts`) are relative to a top-of-atmosphere sun of 1; the
 * scene multiplies both by ONE constant, `SUN_ILLUMINANCE`, so the sun, the
 * sky dome, the sky fill and the aerial perspective can never drift apart.
 * Surfaces are Lambertian in these units: outgoing radiance = albedo/π × E,
 * which is three's own `BRDF_Lambert` for the lit materials and what the
 * terrain and ocean shaders compute by hand.
 */

export type { Rgb }

/**
 * Top-of-atmosphere sun illuminance in scene units. Chosen once, 2026-09-25
 * (photoreal Task 9), so the noon `runway` view's mean luminance stays within
 * ±15% of Phase A's (`shots/a-fix1/`); the measurement is in task-9-report.md.
 */
export const SUN_ILLUMINANCE = 3.6

/**
 * The ground albedo the sky irradiance's DOWN term (the light reflected up
 * from below) is computed with. The theater is mostly sea (open ocean ≈ 0.06)
 * with forested land (≈ 0.12–0.15); 0.1 splits them. Task 7 exposed the
 * argument because the model's default 0.3 makes the ground bounce brighter
 * than the sky fill, which over the Leyte Gulf is wrong.
 */
export const SCENE_GROUND_ALBEDO = 0.1

/**
 * The dusk floor (spec §4.3: "below the horizon the existing dusk floor
 * behavior is preserved; night lighting is out of scope"). The physical model
 * falls to ~1e-4 of noon by -6 deg; the game keeps a dim blue sky instead.
 * These are the retired palette's -6 deg dome colors (0x0d1b33 zenith,
 * 0x3a3a5a horizon) times one scale, in the same scene units as the model.
 * They are ADDED, weighted by `twilight` (below), which is ~0 in daylight.
 */
const TWILIGHT_SCALE = 0.15
const TWILIGHT_ZENITH = scaled(srgbHexToLinear(0x0d1b33), TWILIGHT_SCALE)
const TWILIGHT_HORIZON = scaled(srgbHexToLinear(0x3a3a5a), TWILIGHT_SCALE)
/** The irradiance a dome of the floor's radiance gives an up-facing surface
 *  (π × its mean radiance, weighted toward the horizon band). */
const TWILIGHT_UP: Rgb = scaled(mixRgb(TWILIGHT_ZENITH, TWILIGHT_HORIZON, 0.6), Math.PI)

export type SkyPalette = {
  /** The DirectionalLight's color: transmitted sun × SUN_ILLUMINANCE. */
  readonly sunColor: Rgb
  /** Always 1: the intensity is folded into `sunColor`. */
  readonly sunIntensity: number
  /** The dusk floor's dome colors as currently weighted (0 in daylight).
   *  The dome and the aerial perspective ADD these to the model. */
  readonly zenith: Rgb
  readonly horizon: Rgb
  /** Sky irradiance on an up-facing surface, dusk floor included. */
  readonly fillSky: Rgb
  /** Irradiance on a down-facing surface (ground bounce), floor included. */
  readonly fillGround: Rgb
  /** Weight of the dusk floor, 0 (daylight) to 1 (the sun well below). */
  readonly twilight: number
}

/** three's `SRGBToLinear`, exactly. */
function srgbToLinear(c: number): number {
  return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4)
}
export function srgbHexToLinear(hex: number): Rgb {
  return [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)]
}
function scaled(c: Rgb, k: number): Rgb { return [c[0] * k, c[1] * k, c[2] * k] }
function added(a: Rgb, b: Rgb): Rgb { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]] }
function mixRgb(a: Rgb, b: Rgb, t: number): Rgb { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] }
function luminance(c: Rgb): number { return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] }

/**
 * `skyIrradiance` costs 2–4 ms of CPU (Task 7), far too much per frame. The
 * light it describes changes slowly, so it is re-evaluated only when the sun
 * has moved more than 0.25 deg or the eye more than 100 m vertically since
 * the cached value; otherwise the cache is returned. The sim clock moves the
 * sun 0.25 deg in one minute, so this is a few-ms hitch per minute of flight
 * (or per 100 m of climb), not per frame.
 */
export const IRRADIANCE_REFRESH_DEG = 0.25
export const IRRADIANCE_REFRESH_M = 100
let cache: { hM: number; elevationDeg: number; up: Rgb; down: Rgb } | null = null
function cachedIrradiance(hM: number, elevationDeg: number): { up: Rgb; down: Rgb } {
  if (cache === null || Math.abs(cache.elevationDeg - elevationDeg) > IRRADIANCE_REFRESH_DEG || Math.abs(cache.hM - hM) > IRRADIANCE_REFRESH_M) {
    const { up, down } = skyIrradiance(hM, elevationDeg, SCENE_GROUND_ALBEDO)
    cache = { hM, elevationDeg, up, down }
  }
  return cache
}

/** The palette for an eye altitude (m, the world's y) and sun elevation (deg). */
export function atmospherePalette(eyeAltitudeM: number, elevationDeg: number): SkyPalette {
  const hM = Math.max(0, eyeAltitudeM)
  const sunColor = scaled(sunColorAt(hM, elevationDeg), SUN_ILLUMINANCE)
  const irr = cachedIrradiance(hM, elevationDeg)
  const up = scaled(irr.up, SUN_ILLUMINANCE)
  const down = scaled(irr.down, SUN_ILLUMINANCE)
  // The floor's weight: F²/(L² + F²) on the luminances of the model's sky fill
  // and the floor's, so it is ~0.5% at noon, ~0.3 at sunset and ~1 once
  // the model has gone dark. Continuous in elevation, never NaN (F > 0).
  const f = luminance(TWILIGHT_UP), l = luminance(up)
  const twilight = (f * f) / (l * l + f * f)
  return {
    sunColor,
    sunIntensity: 1,
    zenith: scaled(TWILIGHT_ZENITH, twilight),
    horizon: scaled(TWILIGHT_HORIZON, twilight),
    fillSky: added(up, scaled(TWILIGHT_UP, twilight)),
    fillGround: added(down, scaled(TWILIGHT_UP, twilight * SCENE_GROUND_ALBEDO)),
    twilight,
  }
}
