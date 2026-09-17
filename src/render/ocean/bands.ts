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
 * Samples the polar mesh needs across a wavelength before it will draw it.
 *
 * **Two, which is Nyquist.** It was effectively four until 2026-09-17, and
 * that cost Mark the entire sea surface: the fade thresholds were
 * `(L/4, L/2)` of the mesh's angular sample spacing, so a wavelength was
 * fully gone once the mesh had four samples across it -- twice as
 * conservative as the sampling theorem requires. From 600 m over open water
 * nobody noticed, because the water directly below the airplane is at zero
 * horizontal distance and every band was at full weight. From a runway at 2 m
 * of eye height every piece of visible water is far away, and the nearest sea
 * off Tacloban -- 900 m east, where the mesh samples every 11.0 m -- was being
 * faded to 0.68 for a 32 m swell it could represent perfectly well.
 *
 * Raising this is the knob for shimmer: if the swell aliases between 1.3 and
 * 2.6 km, this number is why, and it is a Tier 3 judgement rather than
 * something the headless suite can see.
 */
export const ANGULAR_FADE_SAMPLES_PER_WAVELENGTH = 2

/**
 * Angular sample spacings, in metres, between which a wavelength fades out.
 *
 * Below `fadeFromM` the mesh resolves the wave and it is drawn at full
 * amplitude; above `goneAtM` there is less than one sample per wavelength and
 * it is dropped entirely. One source of truth for both the CPU reference
 * (`angularFadeWeight`, mesh.ts) and the shader's own `smoothstep` -- the
 * thresholds are plain numbers there because the wavelength is known on the
 * CPU, so unlike `heightAt` there is no mirrored implementation to drift.
 */
export function angularFadeSpacingM(wavelengthM: number): { readonly fadeFromM: number; readonly goneAtM: number } {
  return {
    fadeFromM: wavelengthM / ANGULAR_FADE_SAMPLES_PER_WAVELENGTH,
    goneAtM: wavelengthM,
  }
}
