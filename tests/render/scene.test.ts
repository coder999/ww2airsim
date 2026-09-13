import { describe, it, expect } from 'vitest'
import {
  Box3,
  DirectionalLight,
  HemisphereLight,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
} from 'three'
import { createHellcat } from '../../src/render/scene/hellcat.js'
import { createMarkers, MARKER_SPACING_M } from '../../src/render/scene/markers.js'
import { createWater, recentreWater, WATER_EXTENT_M } from '../../src/render/scene/water.js'
import { createSky, domeColourFor, SKY_RADIUS_M } from '../../src/render/scene/sky.js'
import { CAMERA_VFOV_DEG } from '../../src/render/camera.js'
import { createLighting } from '../../src/render/scene/lighting.js'

/** 1440p, the resolution the legibility trade was made for. */
const PIXELS_TALL = 1440

describe('hellcat geometry', () => {
  it('is roughly F6F-sized: ~13 m span, ~10 m long', () => {
    // Not art direction -- scale is what makes altitude and speed readable
    // against the water. A model twice the right size reads as half the height.
    const { root } = createHellcat()
    const b = new Box3().setFromObject(root)
    const size = b.getSize(new Vector3())
    expect(size.z).toBeGreaterThan(11)
    expect(size.z).toBeLessThan(15)
    expect(size.x).toBeGreaterThan(8)
    expect(size.x).toBeLessThan(12)
  })

  it('is built around its origin, so it rotates about itself', () => {
    const { root } = createHellcat()
    const c = new Box3().setFromObject(root).getCenter(new Vector3())
    expect(Math.abs(c.x)).toBeLessThan(2)
    expect(Math.abs(c.y)).toBeLessThan(2)
    expect(Math.abs(c.z)).toBeLessThan(2)
  })

  it('exposes the prop separately so it can be spun', () => {
    const { root, prop } = createHellcat()
    expect(prop).toBeDefined()
    expect(root.getObjectById(prop.id)).toBeTruthy()
  })

  it('points +X forward, matching the sim body frame', () => {
    // sim/ body frame is +X forward, +Y up, +Z right. A model built down -X
    // flies backwards and every camera offset is wrong by 180 degrees.
    const { prop } = createHellcat()
    const p = new Vector3()
    prop.getWorldPosition(p)
    expect(p.x).toBeGreaterThan(2)
  })
})

describe('markers', () => {
  it('places markers at a known spacing so altitude is judgeable', () => {
    const m = createMarkers()
    expect(m.children.length).toBeGreaterThan(8)
    const xs = m.children.map((c) => c.position.x).sort((a, b) => a - b)
    const gaps = xs.slice(1).map((x, i) => x - xs[i]!).filter((g) => g > 1)
    for (const g of gaps) expect(g).toBeCloseTo(MARKER_SPACING_M, 0)
  })
})

describe('water', () => {
  it('is at least as wide as the sky dome, so the seam lands on the dome equator', () => {
    // Whole-branch review, I-1. The old test here asserted the plane was at
    // least WATER_EXTENT_M across, which is true by construction of a
    // PlaneGeometry(WATER_EXTENT_M, WATER_EXTENT_M) and therefore proved
    // nothing -- the same self-referential shape as C-1's horizon test.
    //
    // The property that matters is a RELATION between two independently
    // chosen constants: the plane's half-extent against the dome's radius.
    // A ray below eye level meets the y=0 plane at h/sin(theta) and the dome
    // at ~SKY_RADIUS_M, so if the half-extent is the smaller of the two the
    // water runs out BEFORE the dome and the boundary sits deep inside the
    // dome's lower hemisphere instead of on its equator.
    const w = createWater()
    const b = new Box3().setFromObject(w)
    const size = b.getSize(new Vector3())
    expect(size.x).toBeGreaterThanOrEqual(WATER_EXTENT_M)
    expect(size.z).toBeGreaterThanOrEqual(WATER_EXTENT_M)
    expect(WATER_EXTENT_M / 2).toBeGreaterThan(SKY_RADIUS_M)
  })

  it('filters its surface detail, which three does not do by default', () => {
    // three's DataTexture ships with NearestFilter on both filters and no
    // mipmaps. Tiled thousands of times and seen at the grazing angles that
    // fill most of the screen, that is one texel sampled out of thousands per
    // pixel: a moiré grid standing over the whole ocean that crawls as the
    // aeroplane moves. Seen on the 2026-09-13 Surface screenshots.
    //
    // The values are asserted, not the defaults, because the defect was
    // inherited by saying nothing rather than by setting anything.
    const w = createWater() as Mesh
    const map = (w.material as MeshStandardMaterial).normalMap!
    expect(map.generateMipmaps).toBe(true)
    expect(map.minFilter).toBe(LinearMipmapLinearFilter)
    expect(map.magFilter).toBe(LinearFilter)
    expect(map.anisotropy).toBeGreaterThan(1)
    // A mip chain needs power-of-two dimensions to be built at all.
    const { width, height } = map.image as { width: number; height: number }
    expect(Number.isInteger(Math.log2(width))).toBe(true)
    expect(Number.isInteger(Math.log2(height))).toBe(true)
  })

  it('re-centres under the eye, as the sky already does', () => {
    // I-1's unbounded half: the sky is re-centred every frame and the water
    // was not, so the plane stayed at the origin while the aeroplane flew
    // away from it. At the spawn's 120 m/s the old 20 km half-extent was
    // spent in under three minutes, after which the aeroplane is off the
    // water entirely.
    const w = createWater()
    recentreWater(w, 5000, -3000)
    expect(w.position.x).toBe(5000)
    expect(w.position.z).toBe(-3000)
    expect(w.position.y).toBe(0)
  })

  it('keeps its surface detail world-locked while re-centring, or there is no parallax', () => {
    // Re-centring a textured plane naively drags the texture along with it,
    // so the surface detail becomes perfectly stationary relative to the
    // aeroplane -- which destroys the only thing the detail exists for
    // (createWater's own doc: at 170 m/s over featureless water you cannot
    // perceive speed, altitude or sink rate).
    //
    // The texture coordinate a fixed WORLD point samples is computed here
    // from three's PlaneGeometry UV convention directly, NOT by calling any
    // helper the implementation also uses: u runs 0..1 along local +X and
    // v along local +Y, and the mesh is rotated -90 degrees about X, so
    // local +Y maps to world -Z.
    const w = createWater() as Mesh
    const map = (w.material as MeshStandardMaterial).normalMap!
    const sampleAt = (worldX: number, worldZ: number): [number, number] => {
      const u = (worldX - w.position.x) / WATER_EXTENT_M + 0.5
      const v = -(worldZ - w.position.z) / WATER_EXTENT_M + 0.5
      return [u * map.repeat.x + map.offset.x, v * map.repeat.y + map.offset.y]
    }
    // One fixed point on the sea, sampled from two different aircraft positions.
    recentreWater(w, 0, 0)
    const [u0, v0] = sampleAt(1234, -567)
    recentreWater(w, 8000, 2500)
    const [u1, v1] = sampleAt(1234, -567)
    expect(u1).toBeCloseTo(u0, 6)
    expect(v1).toBeCloseTo(v0, 6)
    // And a moving point pinned to the aeroplane must NOT sample the same
    // texel, or the plane is world-locked in name only.
    const [uMoved] = sampleAt(8000, 2500)
    expect(Math.abs(uMoved - u0)).toBeGreaterThan(1)
  })
})

describe('sky dome below the horizon', () => {
  it('is sea below the equator and sky above it, matching step(0, y) exactly', () => {
    // CORRECTED 2026-09-13. This asserted `domeColourFor(0) === SEA_COLOUR`,
    // which was the ONE input where the JavaScript and the shader disagreed:
    // `step(0, y)` returns 1 at y === 0 and therefore selects sky. The test
    // that existed to keep the mirror honest pinned the mismatch instead --
    // C-1's shape exactly.
    //
    // The function no longer mirrors the colour ramp at all. Three converts
    // colours into linear working space, so the shader interpolates there
    // while JavaScript on sRGB bytes interpolates in gamma space; they agreed
    // only at the endpoints and differed by up to 20 of 255 in between.
    expect(domeColourFor(-1)).toBe('sea')
    expect(domeColourFor(-0.001)).toBe('sea')
    expect(domeColourFor(0)).toBe('sky')
    expect(domeColourFor(0.0001)).toBe('sky')
    expect(domeColourFor(1)).toBe('sky')
  })
})

describe('sky', () => {
  it('keeps the equator polygon sub-pixel at the altitudes this plan flies', () => {
    // CORRECTED 2026-09-13. The first version of this test computed the
    // RADIAL sagitta, `radius * (1 - cos(pi/N))`, and then divided it by the
    // radius again -- so the radius cancelled algebraically and the assertion
    // was a function of the segment count alone, despite a comment promising
    // that "raising the radius without raising the segment count fails here".
    // It also measured the wrong thing: the equator ring lies in y = 0 at
    // every segment count, so its chords bow inward, not downward.
    //
    // What a pilot sees is the change in DEPRESSION ANGLE of the equator
    // between a vertex, at range R, and a chord midpoint, at range
    // R*cos(pi/N), from an eye at altitude h. That does depend on the radius,
    // and on the altitude, which is why both appear below.
    const sky = createSky() as Mesh
    const { widthSegments, radius } = (sky.geometry as SphereGeometry).parameters
    const scallopPx = (altitudeM: number, segments = widthSegments): number => {
      const atVertex = Math.atan(altitudeM / radius)
      const atMidpoint = Math.atan(altitudeM / (radius * Math.cos(Math.PI / segments)))
      return (((atMidpoint - atVertex) * 180) / Math.PI / CAMERA_VFOV_DEG) * PIXELS_TALL
    }
    // The altimeter's full scale is the highest this plan can go, and the
    // effect grows with altitude, so the top of the range is the check that
    // matters. Testing only the spawn was how the first version of this let a
    // 60-fold error through.
    const TOP_OF_SCALE_M = 10_000
    expect(scallopPx(600)).toBeLessThan(1)
    expect(scallopPx(TOP_OF_SCALE_M)).toBeLessThan(1)
    // Proven to bite, not merely to pass: a coarser dome crosses a pixel at
    // the top of the altimeter, which is exactly what 32 segments did.
    expect(scallopPx(TOP_OF_SCALE_M, 32)).toBeGreaterThan(1)
    expect(scallopPx(TOP_OF_SCALE_M, widthSegments / 2)).toBeGreaterThan(1)
  })

  it('splits its colour on a vertex ring, not through the middle of a triangle', () => {
    const sky = createSky() as Mesh
    expect((sky.geometry as SphereGeometry).parameters.heightSegments % 2).toBe(0)
  })

  it('uses a node material, the only kind WebGPURenderer draws as written', () => {
    // A GLSL ShaderMaterial is not in the WebGPU material library: the
    // renderer logs 'not compatible' and draws with a bare NodeMaterial, and
    // nothing headless would ever see it.
    const sky = createSky() as Mesh
    expect((sky.material as { isNodeMaterial?: boolean }).isNodeMaterial).toBe(true)
  })
})

describe('lighting', () => {
  it('parents the sun target with the sun, so camera-relative translation cannot bend it', () => {
    // A DirectionalLight points from its position to its target. The frame
    // loop translates the whole scene by -eye; a target left at the world
    // origin would then swing the sun around as the aeroplane moves.
    const l = createLighting()
    const sun = l.children.find((c): c is DirectionalLight => c instanceof DirectionalLight)
    expect(sun).toBeDefined()
    expect(l.children).toContain(sun!.target)
  })

  it('includes a hemisphere light as bounce fill', () => {
    // Every material in the scene (water.ts, markers.ts, hellcat.ts) is a lit
    // MeshStandardMaterial: with only the directional sun, the shadowed side
    // of the aeroplane renders flat black and nothing headless would ever
    // show that. Without this assertion, deleting the HemisphereLight left
    // every other test in this suite green (Task 12 review finding).
    const l = createLighting()
    const hemi = l.children.find((c) => c instanceof HemisphereLight)
    expect(hemi).toBeDefined()
  })
})
