import { skyIrradiance, sunColorAt, type Rgb } from './atmosphere.js'

/**
 * The scene's light as a function of eye altitude and sun elevation, from the
 * physically based atmosphere (photoreal Task 9, spec §4.3). Replaces Plan
 * 16c's hand-tuned keys, which the spec retires. Pure apart from a boot-time
 * table of the expensive sky irradiance, built once (below).
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
 * `skyIrradiance` costs ~2 ms of CPU per call (Task 7), far too much per
 * frame, and a throttled re-evaluation (the first version: every 0.25 deg /
 * 100 m) both hitched the main thread several times a second in a steep dive
 * and popped the ambient by 10-20% per step at dusk (Task 9 review). So it
 * is evaluated ONCE, on a (sun elevation x eye altitude) grid, when the
 * first palette is asked for at boot, and interpolated per frame.
 *
 * The grid is dense where the light changes fastest -- around the horizon --
 * and the interpolation is bilinear in LOG space, because between -6 and 0
 * degrees the irradiance changes by two orders of magnitude and a linear
 * blend there would be a poor exponential. Accuracy against direct
 * evaluation is pinned by tests/render/palette.test.ts. Cost: 23 x 7 = 161
 * evaluations, measured in task-9-report.md.
 */
export const IRRADIANCE_ELEVATIONS_DEG: readonly number[] = [-8, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 6, 8, 10, 13, 17, 22, 30, 40, 55, 70, 90]
export const IRRADIANCE_ALTITUDES_M: readonly number[] = [0, 1000, 2000, 3500, 5500, 8000, 12000]
const LOG_FLOOR = 1e-12
type IrradianceTable = { readonly up: Float64Array; readonly down: Float64Array }
let table: IrradianceTable | null = null
let tableBuildMs: number | null = null
/**
 * Builds the table now if it is not built yet, and returns how long the
 * build took (ms; the same number on every later call). main.ts calls this
 * during boot's async load phase so the build never lands on a rendered
 * frame; `interpolatedIrradiance` still builds lazily if nobody warmed it.
 */
export function warmIrradianceTable(): number {
  irradianceTable()
  return tableBuildMs!
}
function irradianceTable(): IrradianceTable {
  if (table !== null) return table
  const started = performance.now()
  const ne = IRRADIANCE_ELEVATIONS_DEG.length, na = IRRADIANCE_ALTITUDES_M.length
  const up = new Float64Array(na * ne * 3), down = new Float64Array(na * ne * 3)
  for (let a = 0; a < na; a++) {
    for (let e = 0; e < ne; e++) {
      const irr = skyIrradiance(IRRADIANCE_ALTITUDES_M[a]!, IRRADIANCE_ELEVATIONS_DEG[e]!, SCENE_GROUND_ALBEDO)
      for (let c = 0; c < 3; c++) {
        up[(a * ne + e) * 3 + c] = Math.log(Math.max(LOG_FLOOR, irr.up[c]!))
        down[(a * ne + e) * 3 + c] = Math.log(Math.max(LOG_FLOOR, irr.down[c]!))
      }
    }
  }
  table = { up, down }
  tableBuildMs = performance.now() - started
  return table
}
/** Index of the cell containing x and the fraction across it, clamped to the grid. */
function bracket(grid: readonly number[], x: number): [number, number] {
  if (!(x > grid[0]!)) return [0, 0]
  const last = grid.length - 1
  if (x >= grid[last]!) return [last - 1, 1]
  let i = 0
  while (grid[i + 1]! < x) i++
  return [i, (x - grid[i]!) / (grid[i + 1]! - grid[i]!)]
}
/** `skyIrradiance(hM, elevationDeg, SCENE_GROUND_ALBEDO)` from the boot-time
 *  table: log-bilinear, clamped to the grid (below -8 deg the dusk floor has
 *  long since taken over; above 12 km is out of the flight envelope). */
export function interpolatedIrradiance(hM: number, elevationDeg: number): { up: Rgb; down: Rgb } {
  const t = irradianceTable()
  const ne = IRRADIANCE_ELEVATIONS_DEG.length
  const [a, fa] = bracket(IRRADIANCE_ALTITUDES_M, hM)
  const [e, fe] = bracket(IRRADIANCE_ELEVATIONS_DEG, elevationDeg)
  const at = (data: Float64Array, c: number): number => {
    const v = (ai: number, ei: number): number => data[(ai * ne + ei) * 3 + c]!
    const lo = v(a, e) * (1 - fe) + v(a, e + 1) * fe
    const hi = v(a + 1, e) * (1 - fe) + v(a + 1, e + 1) * fe
    return Math.exp(lo * (1 - fa) + hi * fa)
  }
  return { up: [at(t.up, 0), at(t.up, 1), at(t.up, 2)], down: [at(t.down, 0), at(t.down, 1), at(t.down, 2)] }
}

/** The palette for an eye altitude (m, the world's y) and sun elevation (deg),
 *  its sky irradiance from the boot-time table. */
export function atmospherePalette(eyeAltitudeM: number, elevationDeg: number): SkyPalette {
  const hM = Math.max(0, eyeAltitudeM)
  return paletteFrom(hM, elevationDeg, interpolatedIrradiance(hM, elevationDeg))
}

/** The same palette from ONE direct `skyIrradiance` evaluation (~2 ms), for a
 *  one-off -- lighting.ts's initial uniform values at module load, which must
 *  not trigger the table build before the page has even painted. */
export function directAtmospherePalette(eyeAltitudeM: number, elevationDeg: number): SkyPalette {
  const hM = Math.max(0, eyeAltitudeM)
  return paletteFrom(hM, elevationDeg, skyIrradiance(hM, elevationDeg, SCENE_GROUND_ALBEDO))
}

function paletteFrom(hM: number, elevationDeg: number, irr: { up: Rgb; down: Rgb }): SkyPalette {
  const sunColor = scaled(sunColorAt(hM, elevationDeg), SUN_ILLUMINANCE)
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
