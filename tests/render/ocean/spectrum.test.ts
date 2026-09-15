// tests/render/ocean/spectrum.test.ts
import { describe, expect, it } from 'vitest'
import { windSpeedMps, wmoWaveHeightM } from '../../../src/render/ocean/beaufort.js'
import {
  angularFrequency,
  significantWaveHeightM,
  spectralMomentZero,
} from '../../../src/render/ocean/spectrum.js'

const G = 9.81

describe('the dispersion relation', () => {
  it('is the deep-water one, omega^2 = g k', () => {
    for (const k of [0.01, 0.1, 1, 10]) {
      expect(angularFrequency(k) ** 2).toBeCloseTo(G * k, 9)
    }
  })

  it('gives a 100 m swell a period of about 8 seconds', () => {
    // Textbook deep-water check: T = sqrt(2 pi L / g).
    const k = (2 * Math.PI) / 100
    const periodS = (2 * Math.PI) / angularFrequency(k)
    expect(periodS).toBeCloseTo(8.0, 1)
  })
})

describe('significant wave height from the discretised spectrum', () => {
  // THE assertion about the code. Hs = 4 sqrt(m0), and for Pierson-Moskowitz
  // m0 has a closed form: alpha g^2 / (5 omega_p^4). If the numerical
  // integration or the normalisation is wrong, these diverge. This is the
  // classic Tessendorf error and nothing else in the pipeline catches it --
  // a mis-normalised spectrum produces water that simply looks like water.
  const ALPHA = 0.0081
  const closedFormHs = (u: number): number => {
    const omegaP = (0.877 * G) / (1.026 * u)
    const m0 = (ALPHA * G * G) / (5 * omegaP ** 4)
    return 4 * Math.sqrt(m0)
  }

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])('matches the closed form at Beaufort %i', (b) => {
    const u = windSpeedMps(b)
    // A wide, finely-spaced band: the tail of omega^-5 carries little energy
    // but truncating it too early biases m0 low.
    const omegas = Array.from({ length: 40000 }, (_, i) => 0.05 + i * 0.005)
    const numeric = significantWaveHeightM(spectralMomentZero(u, omegas))
    // Relative tolerance 0.005% includes the truncated high-frequency tail
    // at force 1; unlike an absolute tolerance it also guards a calm sea.
    expect(numeric / closedFormHs(u)).toBeCloseTo(1, 4)
  })
})

describe('the parameterisation against the WMO table', () => {
  /**
   * A cross-check on the CHOICE of spectrum, not on its implementation, and
   * deliberately scoped to Beaufort 2-6.
   *
   * Pierson-Moskowitz describes a FULLY DEVELOPED sea -- unlimited fetch and
   * duration. The WMO column is "probable" height in the open sea. Computed
   * 2026-09-15, the ratio of the two runs 0.22 at force 1, 0.70-1.14 across
   * forces 2-6, and then climbs steadily to 1.85 at force 12. So agreement
   * outside 2-6 would be evidence of a coincidence, not of correctness, and
   * asserting it would be asserting something false.
   *
   * These comparisons are a scoped plausibility check, not calibration:
   * the wave-height table is never used to rescale the spectrum.
   */
  it.each([2, 3, 4, 5, 6])('Beaufort %i stays within the 30 percent WMO comparison band', (b) => {
    const u = windSpeedMps(b)
    const omegas = Array.from({ length: 4000 }, (_, i) => 0.05 + i * 0.005)
    const hs = significantWaveHeightM(spectralMomentZero(u, omegas))
    expect(hs / wmoWaveHeightM(b)).toBeGreaterThan(0.7)
    expect(hs / wmoWaveHeightM(b)).toBeLessThan(1.3)
  })

  it('diverges from the WMO figure at force 12, and that is expected', () => {
    // Asserted so the divergence is a recorded property rather than something
    // a future reader "fixes" by widening the tolerance above to cover it.
    const u = windSpeedMps(12)
    const omegas = Array.from({ length: 4000 }, (_, i) => 0.05 + i * 0.005)
    const hs = significantWaveHeightM(spectralMomentZero(u, omegas))
    expect(hs / wmoWaveHeightM(12)).toBeGreaterThan(1.5)
  })
})
