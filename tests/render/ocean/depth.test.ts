// tests/render/ocean/depth.test.ts
import { describe, expect, it } from 'vitest'
import { createDepthField, decodeDepth, depthAt, loadDepth, OCEAN_HEADER } from '../../../src/render/ocean/depth.js'

const HEADER = {
  centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100_000,
  samples: 5, encoding: 'int16-metres',
} as const

/** A 5x5 field, metres: -100 (=-100 m) everywhere, 0 in the middle. */
const flat = () => {
  const s = new Int16Array(25).fill(-100)
  s[12] = 0
  return createDepthField(HEADER, s)
}

describe('depthAt', () => {
  it('reads metre elevations as depths', () => {
    expect(depthAt(flat(), -100_000, 100_000)).toBeCloseTo(-100, 6)
  })

  it('is zero at the land sample', () => {
    expect(depthAt(flat(), 0, 0)).toBeCloseTo(0, 6)
  })

  it('interpolates between samples rather than stepping', () => {
    const f = flat()
    const a = depthAt(f, -25_000, 0)
    expect(a).toBeGreaterThan(-100)
    expect(a).toBeLessThan(0)
  })

  it('returns deep water outside the world rather than throwing or NaN', () => {
    // Beyond the box the surface still has to be drawn -- OCEAN_EXTENT_M is
    // 400 km against a 200 km data box, so MOST of the visible sea is outside
    // it. Deep water is the honest answer there and an attenuation of 1.
    const f = flat()
    expect(depthAt(f, 300_000, 0)).toBeLessThan(-100)
    expect(Number.isFinite(depthAt(f, 300_000, 0))).toBe(true)
    expect(Number.isFinite(depthAt(f, Number.NaN, 0))).toBe(true)
  })

  it('never returns a positive number', () => {
    // Depth, not elevation. Land is 0 here; the terrain field owns heights.
    // A positive value would push the water surface above the beach.
    const s = new Int16Array(25).fill(50) // +50 m, i.e. land, in the source
    expect(depthAt(createDepthField(HEADER, s), 0, 0)).toBeLessThanOrEqual(0)
  })
})

describe('decodeDepth', () => {
  it('reads little-endian regardless of host byte order', () => {
    const bytes = new ArrayBuffer(8)
    new DataView(bytes).setInt16(0, -1234, true)
    expect(decodeDepth(bytes, 2)[0]).toBe(-1234)
  })

  it('rejects a buffer that is the wrong length', () => {
    expect(() => decodeDepth(new ArrayBuffer(6), 2)).toThrow(/bytes/)
  })
})

it('preserves north/south orientation and interpolates both axes exactly', () => {
  const values = new Int16Array(25)
  for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++) values[row * 5 + col] = -10 - row * 20 - col * 2
  const field = createDepthField(HEADER, values)
  expect(depthAt(field, -100000, -100000)).toBe(-10)
  expect(depthAt(field, 100000, 100000)).toBe(-98)
  expect(depthAt(field, -75000, -75000)).toBe(-21)
  expect(() => createDepthField(HEADER, new Int16Array(24))).toThrow(/count/)
})

it('loads the exact binary and rejects HTTP errors or truncated content', async () => {
  const bytes = new ArrayBuffer(OCEAN_HEADER.samples ** 2 * 2)
  new DataView(bytes).setInt16(0, -125, true)
  const field = await loadDepth(async () => new Response(bytes))
  expect(field.samples[0]).toBe(-125)
  await expect(loadDepth(async () => new Response('', { status: 404 }))).rejects.toThrow(/404/)
  await expect(loadDepth(async () => new Response(new ArrayBuffer(2)))).rejects.toThrow(/bytes/)
})
