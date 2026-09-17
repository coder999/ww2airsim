import { createDepthField } from '../../../src/render/ocean/depth.js'
// tests/render/ocean/mesh.test.ts
import { describe, expect, it } from 'vitest'
import { OCEAN_EXTENT_M, horizonSinkM } from '../../../src/render/horizon.js'
import { DEEP_WATER_COLOUR, oceanRings, oceanGeometry, createOcean, recentreOcean, oceanCameraXZ, shoalingScale, angularFadeWeight, angularSampleSpacingM, landWeightFromTerrain, pixelFootprintM, OCEAN_SECTORS } from '../../../src/render/ocean/mesh.js'
import { ANGULAR_FADE_SAMPLES_PER_WAVELENGTH, angularFadeSpacingM, cascadeOptions, shortestWavelengthM } from '../../../src/render/ocean/bands.js'
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

  it('still carries most of the swell over the water Tacloban looks at', () => {
    // 900 m east of the runway, where the mesh samples every 11.05 m against a
    // fade that starts at 8 m and ends at 16 m. Deliberately NOT 1.0: this was
    // briefly widened to Nyquist so it would be, and that opened a 2.2 km band
    // where the geometry displaced and the shading did not -- see
    // ANGULAR_FADE_SAMPLES_PER_WAVELENGTH. What actually restored these waves
    // was the `landWeightFromTerrain` fix below, not this.
    expect(angularFadeWeight(32, 900)).toBeCloseTo(0.676, 3)
  })

  it('holds full weight until the spacing reaches the shared threshold, then reaches zero at it', () => {
    const L = 32
    const { fadeFromM, goneAtM } = angularFadeSpacingM(L)
    const distanceAt = (spacingM: number) => (spacingM * OCEAN_SECTORS) / (2 * Math.PI)
    expect(angularFadeWeight(L, distanceAt(fadeFromM) * 0.99)).toBe(1)
    expect(angularFadeWeight(L, distanceAt(fadeFromM) * 1.01)).toBeLessThan(1)
    expect(angularFadeWeight(L, distanceAt(goneAtM))).toBe(0)
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

/**
 * The invariant that the 391 m seam violated, and the one worth keeping.
 *
 * **The mesh must be able to resolve any wavelength the fade still draws.** If
 * the fade says a cascade contributes at some distance but the mesh cannot
 * sample it there, the wave is not smoothly attenuated -- it is aliased or
 * simply absent, and the boundary where that begins is a hard circle centred
 * on the camera. Mark outlined exactly that on 2026-09-17.
 *
 * The cause was `radialSteps`' flat floor of 64 rows per ring against rings
 * that grow 4x: radial spacing jumped 4.58 m -> 18.31 m at 391 m while the
 * angular spacing ran continuously through it, and 18.31 m cannot carry a
 * 32 m wave.
 */
describe('the ocean mesh resolves every wave it is asked to draw', () => {
  it('has radial spacing fine enough wherever a cascade still contributes', () => {
    const rings = oceanRings(OCEAN_EXTENT_M, 8)
    // The coarsest cascade is the one that reaches furthest out, so it sets
    // how far the mesh has to stay fine.
    const cascades = cascadeOptions(4, 256, 3)
    const longest = Math.max(...cascades.map((c) => shortestWavelengthM(c)))
    const { goneAtM } = angularFadeSpacingM(longest)
    const drawnToM = (goneAtM * OCEAN_SECTORS) / (2 * Math.PI)

    for (const r of rings) {
      // Only rings the fade still draws this wavelength in.
      if (r.innerM >= drawnToM) continue
      expect(
        r.radialM,
        `ring ${r.innerM.toFixed(0)}-${r.outerM.toFixed(0)} m draws a ${longest} m wave at ` +
          `${r.radialM.toFixed(2)} m radial spacing, which cannot represent it`,
      ).toBeLessThanOrEqual(goneAtM)
    }
  })

  it('reads its fade threshold from one place, so the two stages cannot drift', () => {
    // The fragment stage carried `wavelength / 4, wavelength / 2` as its own
    // literals until 2026-09-17, and the vertex stage was changed without it.
    // Both now call `angularFadeSpacingM`; this asserts the shape that makes
    // that possible rather than the call sites, which a test cannot see.
    const { fadeFromM, goneAtM } = angularFadeSpacingM(32)
    expect(fadeFromM).toBe(32 / ANGULAR_FADE_SAMPLES_PER_WAVELENGTH)
    expect(goneAtM).toBe(2 * fadeFromM)
  })
})

/**
 * Written AFTER the implementation, unlike everything else here -- recorded
 * because the repo's TDD rule is not decorative and the exception should be
 * visible rather than silent.
 *
 * This is the one criterion both shader stages now fade on. Before 2026-09-17
 * the vertex stage used the mesh's angular spacing and the fragment stage used
 * `dFdx`/`dFdy`, so every cascade had two transitions at different distances.
 */
describe('pixelFootprintM', () => {
  it('is dominated by the grazing term at any distance worth caring about', () => {
    // Across the view a pixel covers d*angle; along it, d^2/h*angle. The
    // second overtakes the first as soon as d > h, which is almost always.
    const angle = ((60 * Math.PI) / 180) / 1080
    expect(pixelFootprintM(900, 2, angle)).toBeCloseTo((900 * 900 / 2) * angle, 6)
    // Very close in and high up, the across-view term is the larger one.
    expect(pixelFootprintM(5, 500, angle)).toBeCloseTo(5 * angle, 9)
  })

  it('explains why a low eye loses wave detail so much closer in', () => {
    const angle = ((60 * Math.PI) / 180) / 1080
    // From the runway at 2 m, one pixel covers hundreds of metres of sea at
    // the 900 m coastline -- no 32 m swell is resolvable there at all.
    expect(pixelFootprintM(900, 2, angle)).toBeGreaterThan(300)
    // From 600 m up, the same water is far better resolved.
    expect(pixelFootprintM(900, 600, angle)).toBeLessThan(2)
  })

  it('grows as the square of distance and inversely with eye height', () => {
    const angle = 1e-3
    expect(pixelFootprintM(200, 10, angle) / pixelFootprintM(100, 10, angle)).toBeCloseTo(4, 6)
    expect(pixelFootprintM(100, 40, angle) / pixelFootprintM(100, 10, angle)).toBeCloseTo(0.25, 6)
  })

  it('returns a finite zero rather than a NaN for degenerate input', () => {
    // Runs per-vertex and per-fragment; a NaN here reaches a vertex position,
    // which is master spec section 9's named hazard.
    for (const args of [[0, 10, 1e-3], [-5, 10, 1e-3], [100, 0, 0], [NaN, 10, 1e-3], [100, NaN, 1e-3], [Infinity, 10, 1e-3]]) {
      const v = pixelFootprintM(args[0]!, args[1]!, args[2]!)
      expect(Number.isFinite(v), `args=${JSON.stringify(args)}`).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
    }
  })

  it('never divides by zero when the eye sits on the surface', () => {
    expect(Number.isFinite(pixelFootprintM(100, 0, 1e-3))).toBe(true)
    expect(pixelFootprintM(100, 0, 1e-3)).toBeGreaterThan(0)
  })
})
