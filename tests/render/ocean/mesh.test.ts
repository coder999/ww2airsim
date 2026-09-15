import { createDepthField } from '../../../src/render/ocean/depth.js'
// tests/render/ocean/mesh.test.ts
import { describe, expect, it } from 'vitest'
import { OCEAN_EXTENT_M, horizonSinkM } from '../../../src/render/horizon.js'
import { DEEP_WATER_COLOUR, oceanRings, oceanGeometry, createOcean, recentreOcean, oceanCameraXZ, attenuationFromDepth } from '../../../src/render/ocean/mesh.js'
import { SEA_COLOUR } from '../../../src/render/scene/water.js'

describe('oceanRings', () => {
  const rings = oceanRings(OCEAN_EXTENT_M, 8)

  it('reaches the full extent', () => {
    expect(rings.at(-1)!.outerM).toBeCloseTo(OCEAN_EXTENT_M, 0)
  })

  it('leaves no gap between rings', () => {
    for (let i = 1; i < rings.length; i++) {
      expect(rings[i]!.innerM).toBeCloseTo(rings[i - 1]!.outerM, 6)
    }
  })

  it('starts at the camera', () => {
    expect(rings[0]!.innerM).toBe(0)
  })

  it('gives the near rings the fine quads', () => {
    for (let i = 1; i < rings.length; i++) {
      expect(rings[i]!.quadM).toBeGreaterThan(rings[i - 1]!.quadM)
    }
  })

  it('keeps every quad small enough that the sink is smooth across it', () => {
    // A quad so long that the curvature sink changes materially across it
    // renders the horizon as a visible polygon edge. The check is on the
    // SECOND difference of the sink, which is what a flat quad fails to
    // represent.
    for (const r of rings) {
      const bend = horizonSinkM(r.outerM) - 2 * horizonSinkM(r.outerM - r.quadM) + horizonSinkM(r.outerM - 2 * r.quadM)
      expect(Math.abs(bend)).toBeLessThan(5)
    }
  })
})

describe('the horizon seam', () => {
  it('keeps the dome literal as the ramp deep end', () => {
    // sky.ts paints below its equator with this exact value. With a ramp the
    // sea is no longer one colour, so the invariant narrows from "the sea
    // colour" to "the deep end of the ramp" -- but it must not be deleted:
    // the seam is invisible only because the two are one value.
    expect(DEEP_WATER_COLOUR).toBe(SEA_COLOUR)
  })
})

it('tessellates the entire disc with positive-Y triangles and no doubled area', () => {
  const geometry = oceanGeometry(oceanRings(OCEAN_EXTENT_M, 8))
  const p = geometry.getAttribute('position')
  const indices = geometry.getIndex()!
  let area = 0
  let smallest = Infinity
  for (let i = 0; i < indices.count; i += 3) {
    const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2)
    const signedArea = ((p.getZ(b) - p.getZ(a)) * (p.getX(c) - p.getX(a)) -
      (p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a))) / 2
    area += signedArea
    smallest = Math.min(smallest, signedArea)
  }
  expect(smallest).toBeGreaterThan(0)
  expect(area / (Math.PI * OCEAN_EXTENT_M ** 2)).toBeCloseTo(1, 4)
  geometry.dispose()
})

it('moves both geometry and the shader sampling origin when the camera moves', () => {
  const field = createDepthField({ centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000,
    samples: 3, encoding: 'int16-metres' }, new Int16Array(9).fill(-125))
  const ocean = createOcean(field, 4)
  for (const [x, z] of [[0, 0], [5000, -3000], [-80000, 42000]] as const) {
    recentreOcean(ocean, x, z)
    expect(ocean.position.x).toBe(x)
    expect(ocean.position.y).toBe(0)
    expect(ocean.position.z).toBe(z)
    const sampleOrigin = oceanCameraXZ(ocean)
    // A fixed world point retains its sampling position after recentering.
    expect(1234 - ocean.position.x + sampleOrigin.x).toBe(1234)
    expect(-567 - ocean.position.z + sampleOrigin.y).toBe(-567)
  }
  ocean.userData.disposeOcean()
})

it('attenuates waves smoothly to zero on shore and stays bounded', () => {
  expect(attenuationFromDepth(0)).toBe(0)
  expect(attenuationFromDepth(-200)).toBeCloseTo(1,2)
  let previous=0
  for (let depth=0;depth>=-300;depth-=5) {
    const amplitude=attenuationFromDepth(depth)
    expect(amplitude).toBeGreaterThanOrEqual(previous)
    previous=amplitude
  }
  for (const depth of [5,0,-1,-1e9,NaN,-Infinity]) {
    expect(attenuationFromDepth(depth)).toBeGreaterThanOrEqual(0)
    expect(attenuationFromDepth(depth)).toBeLessThanOrEqual(1)
  }
})
