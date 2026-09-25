import type { Node } from 'three/webgpu'
import { exp, float, mix, pow } from 'three/tsl'

/**
 * Cloud lighting terms (photoreal Task 11, spec §4.4), each as a pure JS
 * function and a TSL node twin with the same arithmetic line for line, so
 * `tests/render/cloudLighting.test.ts` pins what the march in `clouds.ts`
 * computes.
 *
 * - Dual-lobe Henyey-Greenstein phase: a strong forward lobe (the silver
 *   lining with the sun behind a cloud) and a weak back lobe.
 * - Multiple scattering as octaves (Wrenninge 2013, used by Hillaire 2016):
 *   octave n scatters b^n as much light, sees a^n of the extinction toward
 *   the sun, and has its phase eccentricity scaled by c^n. Octave 0 is plain
 *   single scattering; the higher orders are what light a cloud's interior
 *   and lower half without the old `LIGHT_EXTINCTION_SCALE` fudge.
 * - Beer-powder (Schneider 2015): in-scattered light is thin where the cloud
 *   is thin, which darkens wispy edges.
 */

export const DUAL_LOBE_FORWARD_G = 0.8
export const DUAL_LOBE_BACK_G = -0.3
export const DUAL_LOBE_BLEND = 0.5
export const MS_OCTAVES = 3
export const MS_A = 0.5
export const MS_B = 0.5
export const MS_C = 0.5
/**
 * The one tuned scale on the sun term. Three octaves of an energy-losing
 * approximation return far less light than the tens of scattering orders
 * that make a real cumulus top about as bright as snow, so the sum is scaled
 * until a sunlit, optically deep top matches a Lambertian surface of albedo
 * 0.8 under the same sun (noon default, 68 deg; viewed from above at 30 deg,
 * averaged over three azimuths). The test that pins it re-runs that march on
 * the CPU; it measured 1.00 of the Lambertian at this value (2026-09-25).
 */
export const MS_SCALE = 3

const FOUR_PI = 4 * Math.PI

/** Henyey-Greenstein phase, normalized over the sphere (1/sr). */
export function henyeyGreenstein(cosTheta: number, g: number): number {
  const g2 = g * g
  return (1 - g2) / (FOUR_PI * Math.pow(1 + g2 - 2 * g * cosTheta, 1.5))
}

/** mix(HG(0.8 k), HG(-0.3 k), 0.5); `k` scales both eccentricities (the
 *  octaves flatten the phase with each order), 1 for the plain phase. */
export function dualLobePhase(cosTheta: number, k = 1): number {
  const forward = henyeyGreenstein(cosTheta, DUAL_LOBE_FORWARD_G * k)
  const back = henyeyGreenstein(cosTheta, DUAL_LOBE_BACK_G * k)
  return forward + (back - forward) * DUAL_LOBE_BLEND
}

/** Sum over octaves n of b^n * dualLobePhase(cosTheta, c^n) * exp(-a^n * tau),
 *  with `shadowOpticalDepth` = tau, the optical depth toward the sun. */
export function multiScatter(cosTheta: number, shadowOpticalDepth: number): number {
  let sum = 0
  for (let n = 0; n < MS_OCTAVES; n++) {
    sum += MS_B ** n * dualLobePhase(cosTheta, MS_C ** n) * Math.exp(-(MS_A ** n) * shadowOpticalDepth)
  }
  return sum
}

/** The powder half of Beer-powder: 1 - exp(-2 d). */
export function powder(opticalDepth: number): number {
  return 1 - Math.exp(-2 * opticalDepth)
}

/** Schneider's Beer-powder, exp(-d) * (1 - exp(-2 d)) * 2. */
export function beerPowder(opticalDepth: number): number {
  return Math.exp(-opticalDepth) * powder(opticalDepth) * 2
}

// ---- TSL twins -------------------------------------------------------------

function henyeyGreensteinNode(cosTheta: Node<'float'>, g: number): Node<'float'> {
  const g2 = g * g
  return float(1 - g2).div(pow(float(1 + g2).sub(cosTheta.mul(2 * g)), 1.5).mul(FOUR_PI))
}

export function dualLobePhaseNode(cosTheta: Node<'float'>, k = 1): Node<'float'> {
  const forward = henyeyGreensteinNode(cosTheta, DUAL_LOBE_FORWARD_G * k)
  const back = henyeyGreensteinNode(cosTheta, DUAL_LOBE_BACK_G * k)
  return mix(forward, back, DUAL_LOBE_BLEND)
}

/** The phase terms of the octaves depend only on the view-sun angle, which is
 *  constant along a view ray: `phases` are `dualLobePhaseNode(cos, c^n)` for
 *  n = 0..MS_OCTAVES-1, built once per ray by `octavePhasesNode`. */
export function octavePhasesNode(cosTheta: Node<'float'>): Node<'float'>[] {
  return Array.from({ length: MS_OCTAVES }, (_, n) => dualLobePhaseNode(cosTheta, MS_C ** n))
}

/** Takes the per-ray phases hoisted by `octavePhasesNode` (not cos theta),
 *  so the march pays for them once per ray, not once per step. */
export function multiScatterNode(phases: readonly Node<'float'>[], shadowOpticalDepth: Node<'float'>): Node<'float'> {
  let sum: Node<'float'> = float(0)
  for (let n = 0; n < MS_OCTAVES; n++) {
    sum = sum.add(phases[n]!.mul(MS_B ** n).mul(exp(shadowOpticalDepth.mul(-(MS_A ** n)))))
  }
  return sum
}

export function powderNode(opticalDepth: Node<'float'>): Node<'float'> {
  return float(1).sub(exp(opticalDepth.mul(-2)))
}

export function beerPowderNode(opticalDepth: Node<'float'>): Node<'float'> {
  return exp(opticalDepth.negate()).mul(powderNode(opticalDepth)).mul(2)
}
