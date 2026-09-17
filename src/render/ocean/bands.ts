import type { OceanComputeOptions } from './compute.js'

/** Pairwise-coprime metre periods delay the composite's repeat. Energy is
 * partitioned by wave number, not tripled by summing three complete spectra.
 * Boundaries correspond to 32 m and 4 m wavelengths, separating swell, chop
 * and ripples. Fewer cascades give the final retained patch the remaining band. */
export const OCEAN_PATCHES_M = [509, 127, 31] as const
export function cascadeOptions(beaufort: number, n: number, count: number): OceanComputeOptions[] {
  if (!Number.isInteger(count) || count < 1 || count > 3) throw new Error('ocean: one to three cascades required')
  const edges = [0, 2 * Math.PI / 32, 2 * Math.PI / 4]
  return OCEAN_PATCHES_M.slice(0, count).map((patchM, cascade) => ({
    beaufort, n, patchM, cascade, kMin: edges[cascade]!,
    ...(cascade + 1 < count ? { kMax: edges[cascade + 1]! } : {}),
    // Wind direction is a development default (towards -X under the positive
    // phase convention), until scenarios provide a direction.
    windDirectionRad: 0,
  }))
}

/** Shortest represented axial wavelength, for geometry/pixel filtering. */
export function shortestWavelengthM(options: OceanComputeOptions): number {
  return Math.max(2 * options.patchM / options.n, options.kMax ? 2 * Math.PI / options.kMax : 0)
}

/**
 * Samples needed across a wavelength before a cascade is drawn at all.
 *
 * **Four, and the reason is not the sampling theorem.** Two would be Nyquist,
 * and on 2026-09-17 this was briefly set to two on exactly that argument. That
 * change was correct about the geometry in isolation and wrong about the
 * surface, because the wave field is drawn by TWO stages with different
 * information:
 *
 * - the **vertex** stage displaces, and can only measure the mesh's own
 *   angular sample spacing (`angularSampleSpacingM`, mesh.ts);
 * - the **fragment** stage shades, and measures the screen-space footprint per
 *   pixel (`dFdx`/`dFdy` of world position), which at a grazing angle grows as
 *   d^2/eye-height and therefore runs out far sooner.
 *
 * Widening only the vertex stage left the swell displacing to 2,608 m while
 * its shading gave up at 406 m from a chase camera — about 2.2 km of rolling
 * geometry with flat paint on it, which Mark saw as a band. Measured
 * 2026-09-17 at 60 deg vfov and 1080 px.
 *
 * So this number is not "how finely must a wave be sampled to exist"; it is
 * **the coarsest limit either stage can follow, and both stages must read it
 * from here.** `createOcean` uses `angularFadeSpacingM` for the vertex fade
 * and again for the fragment fade; before 2026-09-17 the fragment stage
 * carried `wavelength / 4, wavelength / 2` as its own literals, and two copies
 * of one threshold is what let them drift apart in the first place.
 */
export const ANGULAR_FADE_SAMPLES_PER_WAVELENGTH = 4

/**
 * Sample spacings, in metres, between which a wavelength fades out.
 *
 * Below `fadeFromM` the wave is drawn at full amplitude; above `goneAtM` it is
 * dropped. Applied by the vertex stage to the mesh's angular spacing and by
 * the fragment stage to the pixel footprint — the same pair of numbers for
 * both, which is the point. See `ANGULAR_FADE_SAMPLES_PER_WAVELENGTH`.
 */
export function angularFadeSpacingM(wavelengthM: number): { readonly fadeFromM: number; readonly goneAtM: number } {
  return {
    fadeFromM: wavelengthM / ANGULAR_FADE_SAMPLES_PER_WAVELENGTH,
    goneAtM: (2 * wavelengthM) / ANGULAR_FADE_SAMPLES_PER_WAVELENGTH,
  }
}
