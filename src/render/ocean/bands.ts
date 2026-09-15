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
