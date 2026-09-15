// tests/render/ocean/reference.test.ts
import { describe, expect, it } from 'vitest'
import { OCEAN_PHASE_SEED, referenceDisplacement } from '../../../src/render/ocean/reference.js'

const opts = { beaufort: 4, timeS: 0, cascade: 0, n: 64, patchM: 512 }

describe('referenceDisplacement', () => {
  it('is deterministic: the same options give bit-identical output', () => {
    // The whole point. If this is not stable, Task 11 cannot compare anything.
    expect(Array.from(referenceDisplacement(opts))).toEqual(Array.from(referenceDisplacement(opts)))
  })

  it('is real-valued and finite everywhere', () => {
    for (const v of referenceDisplacement(opts)) expect(Number.isFinite(v)).toBe(true)
  })

  it('has near-zero mean: a sea surface oscillates about its own level', () => {
    const d = referenceDisplacement(opts)
    const mean = d.reduce((a, b) => a + b, 0) / d.length
    expect(Math.abs(mean)).toBeLessThan(1e-6)
  })

  it('is rougher at force 6 than at force 2', () => {
    const rms = (d: Float64Array) => Math.sqrt(d.reduce((a, b) => a + b * b, 0) / d.length)
    expect(rms(referenceDisplacement({ ...opts, beaufort: 6 })))
      .toBeGreaterThan(rms(referenceDisplacement({ ...opts, beaufort: 2 })))
  })

  it('evolves with time rather than standing still', () => {
    expect(Array.from(referenceDisplacement({ ...opts, timeS: 10 })))
      .not.toEqual(Array.from(referenceDisplacement(opts)))
  })

  it('exports the seed as a named constant', () => {
    // Task 8's GPU path must use this exact value. An inline literal on
    // either side is how the two silently diverge.
    expect(typeof OCEAN_PHASE_SEED).toBe('number')
    expect(Number.isInteger(OCEAN_PHASE_SEED)).toBe(true)
  })
})

it('returns exact calm and uses a distinct phase field for each cascade', () => {
  expect(referenceDisplacement({ ...opts, beaufort: 0 }).every((v) => v === 0)).toBe(true)
  expect(referenceDisplacement({ ...opts, cascade: 1 })).not.toEqual(referenceDisplacement(opts))
})

it('rejects invalid patch, time, grid, and cascade inputs', () => {
  for (const override of [{ n: 3 }, { patchM: 0 }, { timeS: NaN }, { cascade: -1 }]) {
    expect(() => referenceDisplacement({ ...opts, ...override })).toThrow()
  }
})

it('preserves physical wave energy across an ensemble of independent patches', () => {
  // Force 4's spectral peak lies well inside this grid's frequency band.
  // Average 32 phase realizations so this checks normalization, not whether
  // one seed happens to produce a large crest. The 10% height band allows
  // finite-grid truncation and sampling variation but rejects sqrt(2) errors.
  const n = 64
  let variance = 0
  for (let cascade = 0; cascade < 32; cascade++) {
    const field = referenceDisplacement({ ...opts, n, patchM: 128, cascade })
    variance += field.reduce((sum, v) => sum + v * v, 0) / field.length / 32
  }
  // Independent closed-form PM integral, not the sampled k-space conversion.
  const omegaP = 0.877 * 9.81 / (1.026 * 6.7)
  const expectedHeight = 4 * Math.sqrt(0.0081 * 9.81 ** 2 / (5 * omegaP ** 4))
  const ratio = 4 * Math.sqrt(variance) / expectedHeight
  expect(ratio).toBeGreaterThan(0.9)
  expect(ratio).toBeLessThan(1.1)
})
