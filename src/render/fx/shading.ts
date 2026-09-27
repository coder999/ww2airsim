import type { Vec3 } from '../../sim/math/vec3.js'

/** Spec §4.1: "sprites within about 2 m of the eye fade out". */
export const NEAR_FADE_START_M = 0.5
export const NEAR_FADE_END_M = 2.0
/** Soft-particle range: half the sprite, never under half a metre. */
export const SOFT_MIN_M = 0.5
export const SOFT_SIZE_FRACTION = 0.5
/** A fragment this opaque contributes to dense depth (Ruling R9). */
export const DENSE_FRAGMENT_ALPHA = 0.05
/** The clouds stop at fx only where accumulated alpha exceeds this (spec §4.2). */
export const DENSE_ACCUMULATED_ALPHA = 0.5
/** Closeness c = 1 / (1 + viewZ / this): half at 1 km, ~0.01 at 100 km. */
export const CLOSENESS_SCALE_M = 1000
/** Scene-linear radiance of fire at emission 1: ~5x diffuse white under the
 *  noon sun (SUN_ILLUMINANCE 3.6 / pi = 1.15). Estimate; E2 tunes. It is
 *  added outside coverage (`premultipliedOut`, Ruling R17), so faint fire
 *  still blooms. */
export const FIRE_RADIANCE = 6

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const smoothstep = (a: number, b: number, x: number): number => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }
export const nearFade = (viewZ: number): number => smoothstep(NEAR_FADE_START_M, NEAR_FADE_END_M, viewZ)
export const softFade = (sceneViewZ: number, particleViewZ: number, sizeM: number): number =>
  clamp01((sceneViewZ - particleViewZ) / Math.max(sizeM * SOFT_SIZE_FRACTION, SOFT_MIN_M))
export const encodeCloseness = (viewZM: number): number => 1 / (1 + viewZM / CLOSENESS_SCALE_M)
export const decodeCloseness = (c: number): number => (c <= 0 ? Infinity : CLOSENESS_SCALE_M * (1 / c - 1))
export type SixWayMaps = { readonly right: number; readonly left: number; readonly top: number; readonly bottom: number; readonly back: number; readonly front: number }
/** `l`: unit light direction in the particle frame (x right, y up, z toward the camera). */
export function sixWayLight(m: SixWayMaps, l: Vec3): number {
  const p = (x: number): number => (x > 0 ? x * x : 0)
  return p(l.x) * m.right + p(-l.x) * m.left + p(l.y) * m.top + p(-l.y) * m.bottom + p(l.z) * m.front + p(-l.z) * m.back
}
export const fireRamp = (e: number): [number, number, number] => [FIRE_RADIANCE * e, FIRE_RADIANCE * 0.6 * e * e, FIRE_RADIANCE * 0.3 * e ** 4]
/** The full-resolution pixel an fx texel stands for (Ruling R11). */
export const fxTexelPixel = (texel: number, span: number, fullSize: number): number => Math.min(Math.floor((texel + 0.5) * span), fullSize - 1)
type Rgb = readonly [number, number, number]
/** The particle's premultiplied output (Ruling R17): lit radiance and haze are
 *  premultiplied by coverage `a`; fire is added on top, hazed by `ap.a` and
 *  scaled by `fade` (life alpha x soft x near, without the sheet's alpha: the
 *  emission channel already shapes it). So fire keeps a large rgb at a small
 *  `a` and reads as additive under the one "over" blend. `ap` = (inscatter rgb,
 *  transmittance). */
export function premultipliedOut(lit: Rgb, fire: Rgb, ap: readonly [number, number, number, number], a: number, fade: number): [number, number, number, number] {
  const ch = (k: 0 | 1 | 2): number => (lit[k] * ap[3] + ap[k]) * a + fire[k] * ap[3] * fade
  return [ch(0), ch(1), ch(2), a]
}
