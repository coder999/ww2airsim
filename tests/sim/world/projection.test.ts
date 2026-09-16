import { describe, it, expect } from 'vitest'
import { toLocal, toGeodetic, WORLD_CENTRE, EARTH_RADIUS_M } from '../../../src/sim/world/projection.js'

/** Great-circle distance, as an INDEPENDENT check -- deliberately the haversine
 *  form rather than anything projection.ts uses, so a shared error cannot make
 *  both agree. */
const haversineM = (aLat: number, aLon: number, bLat: number, bLon: number): number => {
  const r = Math.PI / 180
  const dLat = (bLat - aLat) * r
  const dLon = (bLon - aLon) * r
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

describe('the local tangent plane', () => {
  it('puts the world centre at the origin', () => {
    expect(toLocal(WORLD_CENTRE.latDeg, WORLD_CENTRE.lonDeg)).toEqual({ x: 0, z: 0 })
  })

  it('round-trips every corner and edge of the world to within a millimetre', () => {
    for (const x of [-100e3, -50e3, 0, 50e3, 100e3]) {
      for (const z of [-100e3, -50e3, 0, 50e3, 100e3]) {
        const g = toGeodetic(x, z)
        const back = toLocal(g.latDeg, g.lonDeg)
        expect(back.x).toBeCloseTo(x, 3)
        expect(back.z).toBeCloseTo(z, 3)
      }
    }
  })

  it('keeps distance from the centre exact, which is what azimuthal equidistant buys', () => {
    // Checked against haversine, computed independently above.
    for (const [dLat, dLon] of [[0.9, 0], [0, 0.9], [-0.6, 0.7], [0.5, -0.8]] as const) {
      const lat = WORLD_CENTRE.latDeg + dLat
      const lon = WORLD_CENTRE.lonDeg + dLon
      const { x, z } = toLocal(lat, lon)
      const planar = Math.hypot(x, z)
      const truth = haversineM(WORLD_CENTRE.latDeg, WORLD_CENTRE.lonDeg, lat, lon)
      expect(Math.abs(planar - truth)).toBeLessThan(0.01) // centimetres over ~100 km
    }
  })

  it('beats the naive cos(lat0) mapping by the margin the design claims', () => {
    // The design says the naive form stretches 312 m over 100 km and this one
    // is within a couple of metres. Pinning BOTH numbers is what makes the
    // choice evidence rather than preference -- and this test fails if someone
    // quietly swaps in the cheap mapping.
    const r = Math.PI / 180
    const lat = WORLD_CENTRE.latDeg + 0.9
    const lon = WORLD_CENTRE.lonDeg + 0.9
    const naiveX = EARTH_RADIUS_M * (lon - WORLD_CENTRE.lonDeg) * r * Math.cos(WORLD_CENTRE.latDeg * r)
    const naiveZ = EARTH_RADIUS_M * (lat - WORLD_CENTRE.latDeg) * r
    const truth = haversineM(WORLD_CENTRE.latDeg, WORLD_CENTRE.lonDeg, lat, lon)

    expect(Math.abs(Math.hypot(naiveX, naiveZ) - truth)).toBeGreaterThan(100)
    const ours = toLocal(lat, lon)
    expect(Math.abs(Math.hypot(ours.x, ours.z) - truth)).toBeLessThan(0.01)
  })

  it('never returns NaN, including at the antipode and for junk input', () => {
    // A NaN here becomes a NaN height, which master spec S9 says silently
    // teleports the airplane out of the world.
    for (const [lat, lon] of [[-WORLD_CENTRE.latDeg, WORLD_CENTRE.lonDeg + 180], [90, 0], [-90, 0]] as const) {
      const p = toLocal(lat, lon)
      expect(Number.isFinite(p.x) && Number.isFinite(p.z)).toBe(true)
    }
    expect(Number.isFinite(toGeodetic(0, 0).latDeg)).toBe(true)
  })
})
