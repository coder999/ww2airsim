/**
 * The sky's look as a function of sun elevation (Plan 16c, design §4).
 * Pure: keyframes in sRGB hex, interpolated in LINEAR RGB, which is the
 * space three's ColorManagement works in and the space every `uniform(new
 * Color(...))` receives. The HIGH key is exactly the constants the scene
 * shipped with through 16b, so a sun above 30 degrees looks as it did.
 * Everything below it is a starting look that Mark tunes by eye.
 */
export const SKY_HAZE = 0x9eb8cc
export const SKY_ZENITH = 0x29619f

export type Rgb = readonly [number, number, number]
export type SkyPalette = {
  readonly sunColor: Rgb
  readonly sunIntensity: number
  readonly sunTint: Rgb
  readonly zenith: Rgb
  readonly horizon: Rgb
  readonly fillSky: Rgb
  readonly fillGround: Rgb
  readonly ambientScale: number
}

/** three's `SRGBToLinear`, exactly. */
function srgbToLinear(c: number): number {
  return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4)
}
export function srgbHexToLinear(hex: number): Rgb {
  return [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)]
}

type Key = { elevationDeg: number; sun: number; intensity: number; zenith: number; horizon: number; fillSky: number; fillGround: number; ambient: number }
/** Design §4's table. Sorted by elevation, descending. */
const KEYS: readonly Key[] = [
  { elevationDeg: 30, sun: 0xfff2e0, intensity: 2.5, zenith: SKY_ZENITH, horizon: SKY_HAZE, fillSky: 0x9eb8cc, fillGround: 0x18384f, ambient: 1 },
  { elevationDeg: 10, sun: 0xffdcae, intensity: 2.1, zenith: 0x2a5a94, horizon: 0xc9bfa8, fillSky: 0xb7b0a0, fillGround: 0x18384f, ambient: 0.9 },
  { elevationDeg: 0, sun: 0xff8c4a, intensity: 1.2, zenith: 0x1f3e6e, horizon: 0xf0a060, fillSky: 0x8f7f78, fillGround: 0x142a3c, ambient: 0.6 },
  { elevationDeg: -6, sun: 0x000000, intensity: 0, zenith: 0x0d1b33, horizon: 0x3a3a5a, fillSky: 0x2c3550, fillGround: 0x0b1520, ambient: 0.25 },
]
const HIGH_SUN = srgbHexToLinear(KEYS[0]!.sun)

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t }
function lerpRgb(a: Rgb, b: Rgb, t: number): Rgb { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)] }
function resolve(k: Key): Omit<SkyPalette, 'sunTint'> {
  return {
    sunColor: srgbHexToLinear(k.sun), sunIntensity: k.intensity, zenith: srgbHexToLinear(k.zenith), horizon: srgbHexToLinear(k.horizon),
    fillSky: srgbHexToLinear(k.fillSky), fillGround: srgbHexToLinear(k.fillGround), ambientScale: k.ambient,
  }
}
function withTint(p: Omit<SkyPalette, 'sunTint'>): SkyPalette {
  return { ...p, sunTint: [p.sunColor[0] / HIGH_SUN[0], p.sunColor[1] / HIGH_SUN[1], p.sunColor[2] / HIGH_SUN[2]] }
}

export function paletteFor(elevationDeg: number): SkyPalette {
  if (elevationDeg >= KEYS[0]!.elevationDeg) return withTint(resolve(KEYS[0]!))
  const last = KEYS[KEYS.length - 1]!
  if (elevationDeg <= last.elevationDeg) return withTint(resolve(last))
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i]!, b = KEYS[i + 1]!
    if (elevationDeg <= a.elevationDeg && elevationDeg > b.elevationDeg) {
      const t = (a.elevationDeg - elevationDeg) / (a.elevationDeg - b.elevationDeg)
      const A = resolve(a), B = resolve(b)
      return withTint({
        sunColor: lerpRgb(A.sunColor, B.sunColor, t), sunIntensity: lerp(A.sunIntensity, B.sunIntensity, t),
        zenith: lerpRgb(A.zenith, B.zenith, t), horizon: lerpRgb(A.horizon, B.horizon, t),
        fillSky: lerpRgb(A.fillSky, B.fillSky, t), fillGround: lerpRgb(A.fillGround, B.fillGround, t),
        ambientScale: lerp(A.ambientScale, B.ambientScale, t),
      })
    }
  }
  throw new Error(`paletteFor: no key brackets ${elevationDeg}`)
}
