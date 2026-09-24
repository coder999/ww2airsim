import { createDepthField } from '../../../src/render/ocean/depth.js'
// tests/render/ocean/mesh.test.ts
import { describe, expect, it } from 'vitest'
import { OCEAN_EXTENT_M, horizonSinkM } from '../../../src/render/horizon.js'
import { DEEP_WATER_COLOUR, oceanRings, oceanGeometry, createOcean, recentreOcean, oceanCameraXZ, shoalingScale, meshFadeWeight, screenFadeWeight, landWeightFromTerrain, landWeightAt, gridSampleAt, textureSamples, pixelFootprintM } from '../../../src/render/ocean/mesh.js'
import { OUTSIDE_DEPTH_M } from '../../../src/render/ocean/depth.js'
import { finestFetchedLevelFor, INTERIM_ASSET_QUALITY_TIER } from '../../../src/render/content.js'
import { loadTerrainHeader, loadTerrainLevel } from '../../../tools/terrain/load.js'
import { ANGULAR_FADE_SAMPLES_PER_WAVELENGTH, FADE_FOOTPRINT_RATIO, angularFadeSpacingM } from '../../../src/render/ocean/bands.js'
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
describe('the two stage fades', () => {
  const ANGLE = ((60 * Math.PI) / 180) / 1080

  it('let the shading carry detail the mesh cannot displace', () => {
    // The ripples are 0.24 m; the mesh samples every 1.23 m at 100 m out, so
    // the vertex stage cannot displace them there and the normal map can still
    // shade them. Fusing these two was measured to cost 74% of the near-field
    // texture -- this asserts they stay separate.
    expect(meshFadeWeight(0.242, 60)).toBe(0)
    expect(screenFadeWeight(0.242, 60, 600, ANGLE)).toBeGreaterThan(0)
  })

  it('share one threshold pair, so the two edges stay together', () => {
    // Same wavelength, same fade shape, different measured quantity: at the
    // distance where each stage's own spacing hits the limit, both read zero.
    expect(meshFadeWeight(32, 1e6)).toBe(0)
    expect(screenFadeWeight(32, 1e6, 30, ANGLE)).toBe(0)
    expect(meshFadeWeight(32, 1)).toBe(1)
    expect(screenFadeWeight(32, 1, 600, ANGLE)).toBe(1)
  })

  it('never increase with distance, and stay in [0, 1]', () => {
    let pm = 1
    let ps = 1
    for (let d = 0; d <= 20000; d += 100) {
      const m = meshFadeWeight(32, d)
      const sc = screenFadeWeight(32, d, 300, ANGLE)
      expect(m).toBeLessThanOrEqual(pm + 1e-12)
      expect(sc).toBeLessThanOrEqual(ps + 1e-12)
      for (const v of [m, sc]) {
        expect(v).toBeGreaterThanOrEqual(0)
        expect(v).toBeLessThanOrEqual(1)
      }
      pm = m
      ps = sc
    }
  })

  it('stay in [0, 1] for degenerate inputs', () => {
    for (const L of [0, -1, NaN, Infinity]) {
      for (const d of [0, -1, 1e9, NaN, Infinity]) {
        for (const v of [meshFadeWeight(L, d), screenFadeWeight(L, d, 100, ANGLE)]) {
          expect(Number.isFinite(v), `L=${L} d=${d}`).toBe(true)
          expect(v).toBeGreaterThanOrEqual(0)
          expect(v).toBeLessThanOrEqual(1)
        }
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
describe('the ocean mesh and the fade agree', () => {
  it('reads its fade threshold from one place, so the two stages cannot drift', () => {
    // The fragment stage carried `wavelength / 4, wavelength / 2` as its own
    // literals until 2026-09-17, and the vertex stage was changed without it.
    // Both now call `angularFadeSpacingM`; this asserts the shape that makes
    // that possible rather than the call sites, which a test cannot see.
    const { fadeFromM, goneAtM } = angularFadeSpacingM(32)
    expect(goneAtM).toBe((2 * 32) / ANGULAR_FADE_SAMPLES_PER_WAVELENGTH)
    expect(fadeFromM).toBe(goneAtM / FADE_FOOTPRINT_RATIO)
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

/**
 * The fade has to complete over a wide enough span of DISTANCE to read as a
 * gradient rather than a line, and that is not the same as a wide span of
 * footprint: the footprint grows as the square of distance at a grazing angle,
 * so a given footprint ratio is only its square root in range.
 *
 * Measured on the reference GPU 2026-09-17, texture energy per image row at
 * 30 m over the shallow water off Tacloban -- the steepest 20-pixel step in
 * the profile, which is what reads as an edge:
 *
 * | footprint ratio | distance span | steepest step | peak texture |
 * | --- | --- | --- | --- |
 * | 2 (original) | 1.41x | +0.53 | 1.12 |
 * | **4** | **2.00x** | **+0.28** | **0.78** |
 * | 8 | 2.83x | +0.24 | 0.70 |
 *
 * Four takes almost all of eight's softening while keeping noticeably more of
 * the wave texture, which is why it is the shipped value.
 */
describe('the fade spans enough distance to be a gradient', () => {
  it('completes over at least a factor of two in range', () => {
    // sqrt of the footprint ratio, because footprint goes as distance squared.
    expect(Math.sqrt(FADE_FOOTPRINT_RATIO)).toBeGreaterThanOrEqual(2)
  })

  it('starts well inside the limit rather than at it', () => {
    // The original fade began at half the limit and finished at it, which is
    // the 1.41x span that read as a ring.
    const { fadeFromM, goneAtM } = angularFadeSpacingM(4)
    expect(fadeFromM).toBeLessThan(goneAtM / 2)
  })
})

describe('the land-weight grid sampler', () => {
  // A synthetic field that any grid resolution can reproduce exactly: height
  // is linear in x and z, so bilinear sampling of a 5-wide and a 17-wide grid
  // over the same box must agree everywhere, not just at shared nodes.
  const h = 1000
  const linear = (n: number): Float32Array => {
    const out = new Float32Array(n * n)
    for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
      const x = -h + (2 * h * ix) / (n - 1), z = -h + (2 * h * iz) / (n - 1)
      out[iz * n + ix] = 0.01 * x + 0.002 * z
    }
    return out
  }

  it('reads the same world point from grids of different resolution', () => {
    const coarse = linear(5), fine = linear(17)
    for (const [x, z] of [[0, 0], [123, -456], [-999, 999], [1000, -1000]] as const) {
      expect(gridSampleAt(fine, 17, h, x, z, true)).toBeCloseTo(gridSampleAt(coarse, 5, h, x, z, true), 6)
      expect(gridSampleAt(fine, 17, h, x, z, true)).toBeCloseTo(0.01 * x + 0.002 * z, 6)
    }
  })

  it('refuses a grid whose length does not match the sample count it is indexed by', () => {
    // The 2026-09-18 regression in one line: a 17x17 grid indexed as 5 wide.
    expect(() => gridSampleAt(linear(17), 5, h, 0, 0, true)).toThrow(/is not 5x5/)
    expect(() => textureSamples({ image: { width: 2049, height: 513, data: new Int16Array(0) } } as never)).toThrow(/square/)
  })

  it('is outside beyond the box and clamps to water unless asked for the sign', () => {
    expect(gridSampleAt(linear(5), 5, h, h + 1, 0)).toBe(OUTSIDE_DEPTH_M)
    expect(gridSampleAt(linear(5), 5, h, 500, 0)).toBe(0)
    expect(gridSampleAt(linear(5), 5, h, 500, 0, true)).toBeCloseTo(5, 6)
  })

  it('weights the real shipped terrain level: open gulf 1, Tacloban 0', () => {
    // The level the ocean is actually handed (main.ts's placeholder pending
    // Task 6, `content.ts`'s `INTERIM_ASSET_QUALITY_TIER` -- see its own
    // comment for why it is deliberately not the spec's eventual `'medium'`
    // default), read the way the texture would be built from it. This used
    // to be 2049 samples
    // (L2) indexed as 513 -- the bug that would have failed here on
    // 2026-09-18 had this test existed -- and is 4097 samples (L1) since
    // Task 2 (2026-09-24) shipped the finer levels and moved the finest
    // fetched level to 1.
    const header = loadTerrainHeader()
    const level = loadTerrainLevel(finestFetchedLevelFor(INTERIM_ASSET_QUALITY_TIER), header)
    const n = Math.sqrt(level.length)
    expect(n).toBe(4097)
    const texture = { image: { width: n, height: n, data: level } }
    expect(landWeightAt(texture, header.halfExtentM, 0, 0)).toBe(1)
    expect(landWeightAt(texture, header.halfExtentM, -29666, -47605)).toBe(0)
    // Indexed by the GEBCO field's 513, the same lookups read the wrong place.
    expect(() => gridSampleAt(level, 513, header.halfExtentM, 0, 0, true)).toThrow()
  })
})
