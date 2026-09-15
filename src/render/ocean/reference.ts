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
 * Directional spreading and cascade band partitioning remain GPU integration
 * work; this oracle represents one complete isotropic patch.
 */
export function referenceDisplacement(opts: ReferenceOptions): Float64Array {
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
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const radius = Math.sqrt(-2 * Math.log(1 - next()))
    const phase = 2 * Math.PI * next()
    if ((x === 0 && z === 0) || x === n / 2 || z === n / 2) continue
    const kx = (x < n / 2 ? x : x - n) * dk
    const kz = (z < n / 2 ? z : z - n) * dk
    const k = Math.hypot(kx, kz)
    const omega = angularFrequency(k)
    const density = pmSpectrum(omega, u) * (9.81 / (2 * omega)) / (2 * Math.PI * k)
    const amplitude = Math.sqrt(density * dk * dk / 4) * radius
    const i = z * n + x
    h0Re[i] = amplitude * Math.cos(phase)
    h0Im[i] = amplitude * Math.sin(phase)
    frequencies[i] = omega
  }
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
  inverseFft2d(re, im, n)
  // Assert Hermitian symmetry's observable consequence instead of silently
  // discarding a complex-valued field that still looks like plausible water.
  const scale = re.reduce((largest, value) => Math.max(largest, Math.abs(value)), 1)
  for (const value of im) if (Math.abs(value) > 1e-10 * scale) {
    throw new Error('ocean: inverse spectrum has a non-real displacement')
  }
  return re
}
