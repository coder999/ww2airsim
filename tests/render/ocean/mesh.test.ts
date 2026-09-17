import { createDepthField } from '../../../src/render/ocean/depth.js'
// tests/render/ocean/mesh.test.ts
import { describe, expect, it } from 'vitest'
import { OCEAN_EXTENT_M, horizonSinkM } from '../../../src/render/horizon.js'
import { DEEP_WATER_COLOUR, oceanRings, oceanGeometry, createOcean, recentreOcean, oceanCameraXZ, shoalingScale, angularFadeWeight, angularSampleSpacingM, landWeightFromTerrain, OCEAN_SECTORS } from '../../../src/render/ocean/mesh.js'
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

/**
 * Replaced `attenuationFromDepth` on 2026-09-17. That function ramped wave
 * amplitude linearly-ish over the first 100 m of depth, which meant **full
 * waves required 100 m of water** -- and Leyte Gulf is 2 to 6 m deep for tens
 * of kilometres off Tacloban. When Plan 11a moved the default spawn from 600 m
 * above 125 m of open water to a runway beside a 2 m bay, every wave Mark could
 * see was being multiplied by about 0.001 and the sea read as flat colour.
 *
 * The replacement caps wave HEIGHT at a fraction of the local depth -- the
 * breaking limit -- rather than scaling it toward zero. The difference that
 * matters: a cap does nothing to a wave that already fits.
 */
describe('shoalingScale', () => {
  it('leaves deep-water waves completely alone', () => {
    // 1.5 m of swell in 125 m of water is nowhere near breaking, so the cap
    // must not touch it. The old ramp returned ~1.0 here too; this is the case
    // both agree on.
    expect(shoalingScale(1.5, -125)).toBe(1)
  })

  it('caps a wave that will not fit in the water it is in', () => {
    // 1.5 m of swell in 2 m of water: the breaking limit is 0.4 * 2 = 0.8 m,
    // so the wave is scaled to 0.8/1.5 of its height. Visible chop, which is
    // what a shallow bay actually looks like -- against the old ramp's 0.001.
    expect(shoalingScale(1.5, -2)).toBeCloseTo(0.8 / 1.5, 9)
  })

  it('does NOT touch a small wave just because the water is shallow', () => {
    // The whole point of a cap over a ramp. A 10 cm ripple fits inside 2 m of
    // water with room to spare, so it passes through untouched -- where the
    // old ramp cut it to 0.001 for no reason but the depth.
    expect(shoalingScale(0.1, -2)).toBe(1)
  })

  it('still puts no waves on land or at the waterline', () => {
    expect(shoalingScale(1.5, 0)).toBe(0)
    expect(shoalingScale(1.5, 5)).toBe(0)
  })

  it('never decreases as the water gets deeper', () => {
    let previous = 0
    for (let depth = 0; depth >= -300; depth -= 5) {
      const scale = shoalingScale(1.5, depth)
      expect(scale).toBeGreaterThanOrEqual(previous)
      previous = scale
    }
  })

  it('stays in [0, 1] for every degenerate input', () => {
    // A NaN or Infinity reaching a vertex position is master spec section 9's
    // named hazard, and this runs per-vertex per-frame.
    for (const depth of [5, 0, -1, -1e9, NaN, -Infinity, Infinity]) {
      for (const elevation of [0, 1e-12, 1.5, 1e9, NaN, Infinity, -Infinity]) {
        const scale = shoalingScale(elevation, depth)
        expect(Number.isFinite(scale), `elevation=${elevation} depth=${depth}`).toBe(true)
        expect(scale).toBeGreaterThanOrEqual(0)
        expect(scale).toBeLessThanOrEqual(1)
      }
    }
  })
})

/**
 * The second half of the same regression, and much the smaller half. The fade
 * exists to stop the polar mesh drawing wavelengths it cannot sample, but it
 * was set at FOUR samples per wavelength where Nyquist needs two, so it threw
 * away waves that were still resolvable -- and from a 2 m eye height every
 * piece of visible water is far away.
 */
describe('angularFadeWeight', () => {
  it('samples the mesh at the spacing the sector count implies', () => {
    expect(angularSampleSpacingM(900)).toBeCloseTo((900 * 2 * Math.PI) / OCEAN_SECTORS, 9)
    expect(angularSampleSpacingM(0)).toBe(0)
  })

  it('keeps the 32 m swell at full weight over the water Tacloban looks at', () => {
    // The nearest sea from the runway is 900 m east, where the mesh samples
    // every 11.0 m -- comfortably inside Nyquist for a 32 m wave. Under the
    // old 4-samples-per-wavelength thresholds this returned 0.68.
    expect(angularFadeWeight(32, 900)).toBe(1)
  })

  it('does not begin fading until the mesh has fewer than two samples per wavelength', () => {
    const L = 32
    // Nyquist: exactly two samples across the wavelength.
    const nyquistDistanceM = ((L / 2) * OCEAN_SECTORS) / (2 * Math.PI)
    expect(angularFadeWeight(L, nyquistDistanceM * 0.99)).toBe(1)
    expect(angularFadeWeight(L, nyquistDistanceM * 1.01)).toBeLessThan(1)
    // Gone once there is less than one sample per wavelength.
    expect(angularFadeWeight(L, (L * OCEAN_SECTORS) / (2 * Math.PI))).toBe(0)
  })

  it('never increases with distance, and stays in [0, 1]', () => {
    let previous = 1
    for (let d = 0; d <= 5000; d += 25) {
      const w = angularFadeWeight(32, d)
      expect(w).toBeLessThanOrEqual(previous + 1e-12)
      expect(w).toBeGreaterThanOrEqual(0)
      expect(w).toBeLessThanOrEqual(1)
      previous = w
    }
  })

  it('stays in [0, 1] for degenerate inputs', () => {
    for (const L of [0, -1, NaN, Infinity]) {
      for (const d of [0, -1, 1e9, NaN, Infinity]) {
        const w = angularFadeWeight(L, d)
        expect(Number.isFinite(w), `L=${L} d=${d}`).toBe(true)
        expect(w).toBeGreaterThanOrEqual(0)
        expect(w).toBeLessThanOrEqual(1)
      }
    }
  })
})

/**
 * The bug that actually made the sea flat, found 2026-09-17 after Mark
 * reported no waves on a dev build that already carried the shoaling fix.
 *
 * `landWeight` multiplies the whole wave displacement, and it was
 * `smoothstep(0, 2, -terrainHeightM)` -- i.e. it demanded the TERRAIN grid
 * read 2 m BELOW sea level before allowing waves. That assumed the terrain
 * pyramid carries bathymetry. **It does not**: the terrain pipeline stores land
 * heights with the sea at zero, and the bathymetry lives in the separate GEBCO
 * depth field. Measured over the whole 200 km box on the committed L4 field,
 * 40,000 samples: **not one is below -2 m**, and 63.6% read exactly 0.
 *
 * So the term was a hard zero over every square metre of water in the world,
 * from `b6a3929` -- Plan 5's last ocean commit, the one that started passing
 * the terrain texture -- onward. The GPU tests never caught it because they
 * assert the FFT compute output, not the rendered displacement.
 *
 * The predicate it wanted is "is the rendered terrain above sea level here",
 * which is this function.
 */
describe('landWeightFromTerrain', () => {
  it('allows full waves where the terrain grid reads sea level', () => {
    // 63.6% of the box, and every point of open water in it. The old
    // expression returned 0 here, which is the whole bug.
    expect(landWeightFromTerrain(0)).toBe(1)
  })

  it('allows full waves outside the terrain grid', () => {
    // `depthNode` returns OUTSIDE_DEPTH_M (-8000) beyond the 200 km box, and
    // the ocean mesh reaches 400 km. Open sea past the DEM must have waves.
    expect(landWeightFromTerrain(-8000)).toBe(1)
  })

  it('suppresses waves entirely on land', () => {
    // 2.479 m, measured 16 km east of the Tacloban spawn -- the far shore.
    expect(landWeightFromTerrain(2.479)).toBe(0)
    expect(landWeightFromTerrain(74.459)).toBe(0)
  })

  it('fades across the rendered shoreline rather than stepping', () => {
    // Tacloban's own runway reads 1.673 m: mostly suppressed, not fully.
    // A step here would draw a hard line of waves across the beach where the
    // GEBCO shoreline and the DEM shoreline disagree, which is the whole
    // reason this term exists.
    const atRunway = landWeightFromTerrain(1.673)
    expect(atRunway).toBeGreaterThan(0)
    expect(atRunway).toBeLessThan(0.2)
  })

  it('never increases as the land rises, and stays in [0, 1]', () => {
    let previous = 1
    for (let h = -20; h <= 20; h += 0.25) {
      const w = landWeightFromTerrain(h)
      expect(w).toBeLessThanOrEqual(previous + 1e-12)
      expect(w).toBeGreaterThanOrEqual(0)
      expect(w).toBeLessThanOrEqual(1)
      previous = w
    }
  })

  it('stays in [0, 1] for degenerate inputs', () => {
    for (const h of [NaN, Infinity, -Infinity, 1e9, -1e9]) {
      const w = landWeightFromTerrain(h)
      expect(Number.isFinite(w), `h=${h}`).toBe(true)
      expect(w).toBeGreaterThanOrEqual(0)
      expect(w).toBeLessThanOrEqual(1)
    }
  })
})
