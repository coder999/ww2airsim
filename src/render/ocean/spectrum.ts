// src/render/ocean/spectrum.ts
/**
 * The wave spectrum: how much energy the sea carries at each frequency, and
 * the relation between a wave's length and how fast it oscillates.
 *
 * Pierson-Moskowitz, which is JONSWAP with a peak-enhancement factor of 1.
 * Chosen over full JONSWAP because JONSWAP's extra parameter describes
 * fetch-limited seas and this world is one 200 km box with one wind setting:
 * the parameter would have no honest value to take. `spectrum.test.ts` records
 * where PM parts company with the WMO table and why that is expected rather
 * than a defect.
 */

/** Standard gravity, m/s^2. The same value the flight model uses. */
const G = 9.81

/** Phillips' equilibrium-range constant, dimensionless. */
const ALPHA = 0.0081

/** Peak frequency coefficient: omega_p = PEAK_COEFF * g / U10. */
// Stewart, Introduction to Physical Oceanography, §16.4, equations
// 16.30–16.32 (retrieved 2026-09-15): the 0.877 coefficient uses U19.5,
// and U19.5 ≈ 1.026 U10 under neutral atmospheric stability.
// https://www.whoi.edu/science/PO/people/jprice/class/miscart/Stewart2006.pdf
const PEAK_COEFF = 0.877 / 1.026

/**
 * The deep-water dispersion relation, `omega^2 = g k`.
 *
 * This is the offshore approximation. Near shore the material attenuates
 * amplitude using depth; it does not model finite-depth dispersion or wave
 * refraction. A spatially uniform dispersion relation permits one FFT per
 * patch (design §6).
 */
export function angularFrequency(waveNumberK: number): number {
  return Math.sqrt(G * Math.abs(waveNumberK))
}

/** The Pierson-Moskowitz energy density at one angular frequency, m^2 s. */
export function pmSpectrum(omega: number, windSpeedMps: number): number {
  if (omega <= 0 || windSpeedMps <= 0) return 0
  const omegaP = (PEAK_COEFF * G) / windSpeedMps
  return ((ALPHA * G * G) / omega ** 5) * Math.exp(-1.25 * (omegaP / omega) ** 4)
}

/**
 * The zeroth spectral moment -- the variance of the surface elevation --
 * integrated over the given frequency samples by the trapezium rule.
 *
 * `omegas` must be ascending. Passed in rather than chosen here so the test
 * can state the band it integrates over: `m0` is sensitive to truncating the
 * `omega^-5` tail, and a band chosen silently inside this function would make
 * a wrong answer look like a modelling choice.
 */
export function spectralMomentZero(windSpeedMps: number, omegas: readonly number[]): number {
  let m0 = 0
  for (let i = 1; i < omegas.length; i++) {
    const a = omegas[i - 1]!
    const b = omegas[i]!
    m0 += ((pmSpectrum(a, windSpeedMps) + pmSpectrum(b, windSpeedMps)) / 2) * (b - a)
  }
  return m0
}

/** Significant wave height from the variance: the standard `Hs = 4 sqrt(m0)`. */
export function significantWaveHeightM(m0: number): number {
  return 4 * Math.sqrt(m0)
}
