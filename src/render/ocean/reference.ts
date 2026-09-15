/** CPU displacement oracle for GPU readback. No browser or GPU state. */
import { createRng } from '../../sim/rng.js'
import { windSpeedMps } from './beaufort.js'
import { inverseFft2d } from './fft.js'
import { angularFrequency, pmSpectrum } from './spectrum.js'

/** Arbitrary reproducible seed (ASCII "OCEA"), not a physical parameter. */
export const OCEAN_PHASE_SEED = 0x4f434541

export type ReferenceOptions = {
  beaufort: number
  timeS: number
  cascade: number
  n: number
  patchM: number
  kMin?: number
  kMax?: number
  windDirectionRad?: number
}

/**
 * Unshifted row-major spectrum: x varies fastest, z is the row. Positive
 * frequencies precede negative ones; DC and Nyquist lines are zero. Nyquist
 * lines are omitted to avoid an ambiguous signed direction at the cutoff.
 *
 * Random contract: mulberry32(seed XOR cascade); two draws per cell including
 * zero cells; Box–Muller with 1-u for its logarithm. The GPU path must use
 * these same stationary coefficients (or reproduce this draw order).
 *
 * Isotropic spreading integrates to one over 2π. Changing variables gives
 * P(kx,kz) = S(ω) (dω/dk) / (2π k), where dω/dk = g/(2ω).
 * Two independent h0 terms evolve into a Hermitian spectrum, so each h0
 * complex component has variance P Δk² / 4. The unscaled inverse transform
 * then sums Fourier amplitudes in metres, independent of N.
 * Optional k bands partition cascade energy. With windDirectionRad absent
 * this is isotropic; otherwise it uses normalized downwind cosine-squared
 * spreading. Both paths retain the same draw order and normalization.
 */
export function stationarySpectrum(opts: ReferenceOptions): { re: Float64Array; im: Float64Array; frequencies: Float64Array; kx: Float64Array; kz: Float64Array } {
  const { n, patchM, timeS, cascade } = opts
  if (!Number.isInteger(n) || n < 2 || !Number.isInteger(Math.log2(n))) {
    throw new Error('ocean: n must be a power of two >= 2')
  }
  if (!Number.isFinite(patchM) || patchM <= 0 || !Number.isFinite(timeS)) {
    throw new Error('ocean: patch must be positive and patch/time must be finite')
  }
  if (!Number.isInteger(cascade) || cascade < 0 || cascade > 0xffff_ffff) {
    throw new Error('ocean: cascade must be an unsigned 32-bit integer')
  }
  const u = windSpeedMps(opts.beaufort)
  const next = createRng(OCEAN_PHASE_SEED ^ cascade)
  const dk = 2 * Math.PI / patchM
  const h0Re = new Float64Array(n * n)
  const h0Im = new Float64Array(n * n)
  const frequencies = new Float64Array(n * n)
  const waveX = new Float64Array(n * n)
  const waveZ = new Float64Array(n * n)
  const kMin = opts.kMin ?? 0
  const kMax = opts.kMax ?? Infinity
  if (!Number.isFinite(kMin) || kMin < 0 || !(kMax > kMin) ||
      (opts.windDirectionRad !== undefined && !Number.isFinite(opts.windDirectionRad))) {
    throw new Error('ocean: invalid spectral band or wind direction')
  }
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const radius = Math.sqrt(-2 * Math.log(1 - next()))
    const phase = 2 * Math.PI * next()
    if ((x === 0 && z === 0) || x === n / 2 || z === n / 2) continue
    const kx = (x < n / 2 ? x : x - n) * dk
    const kz = (z < n / 2 ? z : z - n) * dk
    const k = Math.hypot(kx, kz)
    const omega = angularFrequency(k)
    const band = k >= kMin && k < kMax ? 1 : 0
    const alignment = opts.windDirectionRad === undefined ? 1 :
      (kx * Math.cos(opts.windDirectionRad) + kz * Math.sin(opts.windDirectionRad)) / k
    // 2/pi cos² over the downwind half-plane integrates to one; relative
    // to the isotropic 1/(2pi) density this is 4 cos² (and zero upwind).
    const spread = opts.windDirectionRad === undefined ? 1 : 4 * Math.max(0, alignment) ** 2
    const density = band * spread * pmSpectrum(omega, u) * (9.81 / (2 * omega)) / (2 * Math.PI * k)
    const amplitude = Math.sqrt(density * dk * dk / 4) * radius
    const i = z * n + x
    h0Re[i] = amplitude * Math.cos(phase)
    h0Im[i] = amplitude * Math.sin(phase)
    frequencies[i] = omega
    waveX[i] = kx
    waveZ[i] = kz
  }
  return { re: h0Re, im: h0Im, frequencies, kx: waveX, kz: waveZ }
}

/** Unscaled CPU inverse transform of the same spectrum used by the GPU. */
export function referenceDisplacement(opts: ReferenceOptions, component: 'height' | 'x' | 'z' = 'height'): Float64Array {
  const { n, timeS } = opts
  const { re: h0Re, im: h0Im, frequencies, kx, kz } = stationarySpectrum(opts)
  const re = new Float64Array(n * n)
  const im = new Float64Array(n * n)
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const i = z * n + x
    const opposite = ((n - z) % n) * n + (n - x) % n
    const phase = frequencies[i]! * timeS
    const c = Math.cos(phase)
    const s = Math.sin(phase)
    re[i] = (h0Re[i]! + h0Re[opposite]!) * c - (h0Im[i]! + h0Im[opposite]!) * s
    im[i] = (h0Re[i]! - h0Re[opposite]!) * s + (h0Im[i]! - h0Im[opposite]!) * c
  }
  if (component !== 'height') for (let i = 0; i < re.length; i++) {
    const k = Math.hypot(kx[i]!, kz[i]!)
    const direction = k === 0 ? 0 : (component === 'x' ? kx[i]! : kz[i]!) / k
    const r = re[i]!
    re[i] = im[i]! * direction
    im[i] = -r * direction
  }
  inverseFft2d(re, im, n)
  // Assert Hermitian symmetry's observable consequence instead of silently
  // discarding a complex-valued field that still looks like plausible water.
  const scale = re.reduce((largest, value) => Math.max(largest, Math.abs(value)), 1)
  for (const value of im) if (Math.abs(value) > 1e-10 * scale) {
    throw new Error('ocean: inverse spectrum has a non-real displacement')
  }
  return re
}
