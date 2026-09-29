// tests/tools/models/skin/scans.test.ts
import { describe, expect, it } from 'vitest'
import { SCANS, sampleScan, scanFromChannels, scansCached, loadScan } from '../../../../tools/models/skin/scans.js'

/** A 64 px scan of vertical stripes 2 px wide (period 4 px), lum 0 and 1; flat normals; rough = x / 63. */
function stripes(): ReturnType<typeof scanFromChannels> {
  const n = 64
  const lum = new Float32Array(n * n), rough = new Float32Array(n * n), nrm = new Float32Array(3 * n * n)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x
    lum[i] = (x >> 1) & 1
    rough[i] = x / 63
    nrm[3 * i] = ((x >> 1) & 1) ? 0.6 : -0.6; nrm[3 * i + 1] = 0; nrm[3 * i + 2] = 0.8
  }
  return scanFromChannels(n, 1.0, lum, rough, nrm)
}

describe('scan sampling (DP0, Review Focus 3)', () => {
  const scan = stripes()
  it('builds a mip chain down to 1 px, each level the 2x2 box average of the one above', () => {
    expect(scan.levels.map((l) => l.size)).toEqual([64, 32, 16, 8, 4, 2, 1])
    expect(scan.levels[6]!.lum[0]).toBeCloseTo(0.5, 6)
    expect(scan.meanLum).toBeCloseTo(0.5, 6)
  })
  it('at its native footprint it resolves the stripes', () => {
    const texel = 1 / 64
    const a = sampleScan(scan, 0.5 * texel, 0.5 * texel, texel).lum
    const b = sampleScan(scan, 2.5 * texel, 0.5 * texel, texel).lum
    expect(Math.abs(a - b)).toBeGreaterThan(0.9)
  })
  it('at a footprint wider than the period it returns the mean, within 2%, with no moire', () => {
    for (let i = 0; i < 50; i++) {
      const s = sampleScan(scan, i * 0.0137, i * 0.0291, 8 / 64)
      expect(Math.abs(s.lum - 0.5), `sample ${i}`).toBeLessThanOrEqual(0.01)
      expect(Math.abs(s.n[0]), 'normals average flat').toBeLessThanOrEqual(0.02)
    }
  })
  it('wraps: u and u + tile sample the same texel, negative coordinates included', () => {
    const a = sampleScan(scan, 0.3, 0.7, 1 / 64), b = sampleScan(scan, 1.3, -0.3, 1 / 64)
    // Controller ruling: 0.3*64 and 1.3*64 round differently in the last float bits.
    // What this checks is wrap, not bit identity, so compare components with toBeCloseTo.
    expect(b.lum).toBeCloseTo(a.lum, 9)
    expect(b.rough).toBeCloseTo(a.rough, 9)
    expect(b.n[0]).toBeCloseTo(a.n[0], 9)
    expect(b.n[1]).toBeCloseTo(a.n[1], 9)
    expect(b.n[2]).toBeCloseTo(a.n[2], 9)
  })
  it('the dark-quantile threshold is monotone and inside [0, 1]', () => {
    expect(scan.lumAtQuantile(0.1)).toBeLessThanOrEqual(scan.lumAtQuantile(0.9))
    expect(scan.lumAtQuantile(0)).toBeGreaterThanOrEqual(0)
    expect(scan.lumAtQuantile(1)).toBeLessThanOrEqual(1)
  })
})

describe('the pinned scans', () => {
  it('are four CC0 Poly Haven sets, each with a positive tile size and three MD5-pinned files', () => {
    expect(Object.keys(SCANS).sort()).toEqual(['concrete', 'corrugated-iron', 'deck-planks', 'painted-metal'])
    for (const s of Object.values(SCANS)) {
      expect(s.license).toBe('CC0-1.0')
      expect(s.tileM).toBeGreaterThan(0)
      for (const f of [s.diffuse, s.normal, s.rough]) { expect(f.url).toMatch(/^https:\/\/dl\.polyhaven\.org\//); expect(f.md5).toMatch(/^[0-9a-f]{32}$/) }
    }
  })
})

describe.skipIf(!scansCached())('the pinned scans load (needs tools/textures/cache: run `npm run models:build -- hangar` once)', () => {
  it.each(['painted-metal', 'corrugated-iron', 'concrete', 'deck-planks'] as const)('%s decodes to a 1024 px scan with unit-ish normals', async (id) => {
    const s = await loadScan(id)
    expect(s.size).toBe(1024)
    const l0 = s.levels[0]!
    const len = Math.hypot(l0.nrm[0]!, l0.nrm[1]!, l0.nrm[2]!)
    expect(len).toBeGreaterThan(0.9); expect(len).toBeLessThan(1.1)
    expect(s.meanLum).toBeGreaterThan(0); expect(s.meanLum).toBeLessThan(1)
  }, 60_000)
})
