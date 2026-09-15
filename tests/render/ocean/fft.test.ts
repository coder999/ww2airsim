// tests/render/ocean/fft.test.ts
import { describe, expect, it } from 'vitest'
import { butterflyStages, inverseFft2d, naiveInverseDft } from '../../../src/render/ocean/fft.js'

const rng = (seed: number) => {
  let s = seed >>> 0
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 0x1_0000_0000) * 2 - 1
}

describe('the reference FFT against a naive inverse DFT', () => {
  // Two independent implementations of ONE transform. The naive version is
  // O(n^2) and obviously correct by inspection; the FFT is fast and not.
  // This is the only test in the plan that establishes the transform itself,
  // and Tier 2 compares the GPU against the same code.
  //
  // Both sides are the INVERSE transform in the same convention: positive
  // exponent, no 1/N scaling. Comparing an inverse against a forward DFT
  // would fail for a perfectly correct FFT and send the reader hunting a bug
  // in working code, so the convention is stated once, here, and both
  // implementations are written to it.
  it.each([4, 8, 16, 64])('agrees with the naive inverse DFT on random data, n = %i', (n) => {
    const next = rng(n * 7919)
    const re = Float64Array.from({ length: n }, next)
    const im = Float64Array.from({ length: n }, next)
    const expected = naiveInverseDft(re, im)

    const gotRe = Float64Array.from(re)
    const gotIm = Float64Array.from(im)
    inverseFft2d(gotRe, gotIm, n) // 1-D path for n x 1; see module doc

    for (let i = 0; i < n; i++) {
      expect(gotRe[i]!).toBeCloseTo(expected.re[i]!, 9)
      expect(gotIm[i]!).toBeCloseTo(expected.im[i]!, 9)
    }
  })

  it('round-trips a 2-D field back to itself', () => {
    const n = 32
    const next = rng(4242)
    const re = Float64Array.from({ length: n * n }, next)
    const im = new Float64Array(n * n)
    const originalRe = Float64Array.from(re)

    inverseFft2d(re, im, n)
    // Forward is the inverse with conjugated input and output, scaled.
    forwardOf(re, im, n)

    for (let i = 0; i < n * n; i++) {
      expect(re[i]!).toBeCloseTo(originalRe[i]!, 8)
    }
  })

  it('turns a unit DC spike into a unit constant field', () => {
    // A cheap orientation check: if rows and columns are transposed, this
    // still passes, which is why the DFT comparison above is the real guard.
    const n = 16
    const re = new Float64Array(n * n)
    const im = new Float64Array(n * n)
    re[0] = 1 // a single spectral spike at DC
    inverseFft2d(re, im, n)
    for (let i = 0; i < n * n; i++) expect(re[i]!).toBeCloseTo(1, 9)
  })
})

describe('butterflyStages', () => {
  it('has log2(n) stages and n/2 pairs in each', () => {
    const stages = butterflyStages(64)
    expect(stages).toHaveLength(6)
    for (const s of stages) expect(s.pairs).toHaveLength(32)
  })

  it('touches every index exactly once per stage', () => {
    // A stage that reads one index twice and another never is the classic
    // Stockham indexing bug, and it produces a field that still looks like
    // waves. Task 8's WGSL is generated from these same tables.
    for (const s of butterflyStages(32)) {
      const seen = s.pairs.flatMap((p) => [p.a, p.b]).sort((x, y) => x - y)
      expect(seen).toEqual(Array.from({ length: 32 }, (_, i) => i))
    }
  })

  it('rejects a size that is not a power of two', () => {
    expect(() => butterflyStages(48)).toThrow(/power of two/)
  })
})

function forwardOf(re: Float64Array, im: Float64Array, n: number): void {
  for (let i = 0; i < im.length; i++) im[i] = -im[i]!
  inverseFft2d(re, im, n)
  for (let i = 0; i < re.length; i++) {
    re[i] = re[i]! / (n * n)
    im[i] = -im[i]! / (n * n)
  }
}

it('preserves x/z orientation against a direct two-dimensional DFT', () => {
  const n = 4
  const re = Float64Array.from({ length: n * n }, (_, i) => Math.sin(i * 1.7))
  const im = Float64Array.from({ length: n * n }, (_, i) => Math.cos(i * 0.3))
  const expectedRe = new Float64Array(n * n)
  const expectedIm = new Float64Array(n * n)
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    for (let kz = 0; kz < n; kz++) for (let kx = 0; kx < n; kx++) {
      const phase = 2 * Math.PI * (x * kx + z * kz) / n
      const j = kz * n + kx
      expectedRe[z * n + x] = expectedRe[z * n + x]! + re[j]! * Math.cos(phase) - im[j]! * Math.sin(phase)
      expectedIm[z * n + x] = expectedIm[z * n + x]! + re[j]! * Math.sin(phase) + im[j]! * Math.cos(phase)
    }
  }
  inverseFft2d(re, im, n)
  for (let i = 0; i < re.length; i++) {
    expect(re[i]).toBeCloseTo(expectedRe[i]!, 10)
    expect(im[i]).toBeCloseTo(expectedIm[i]!, 10)
  }
})

it('rejects mismatched or incorrectly sized transform buffers', () => {
  expect(() => inverseFft2d(new Float64Array(4), new Float64Array(3), 4)).toThrow(/matching/)
  expect(() => inverseFft2d(new Float64Array(5), new Float64Array(5), 4)).toThrow(/matching/)
})
