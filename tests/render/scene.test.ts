import { DEEP_WATER_COLOUR } from '../../src/render/ocean/mesh.js'
import { SEA_COLOUR } from '../../src/render/scene/water.js'
import { describe, it, expect } from 'vitest'
import { float } from 'three/tsl'
import {
  Box3,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  SphereGeometry,
  Vector3,
} from 'three'
import { createHellcat } from '../../src/render/scene/hellcat.js'
import { createMarkers, recentreMarkers, MARKER_SPACING_M } from '../../src/render/scene/markers.js'
import { createSky, domeColourFor } from '../../src/render/scene/sky.js'
import { CAMERA_VFOV_DEG } from '../../src/render/camera.js'
import {
  ambientScaleNode,
  applySun,
  createLighting,
  skyHorizonNode,
  skyZenithNode,
  sunDirectionNode,
  sunElevationNode,
  SUN_DIRECTION,
  sunTintNode,
} from '../../src/render/scene/lighting.js'
import { paletteFor } from '../../src/render/sky/palette.js'
import { v3 } from '../../src/sim/math/vec3.js'

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

  it('spinProp rotates one mesh inside root', () => {
    const { root, spinProp } = createHellcat()
    const before = new Map<number, number>()
    root.traverse((o) => before.set(o.id, o.rotation.x))
    spinProp(Math.PI / 4)
    let changed = 0
    root.traverse((o) => {
      if (Math.abs(o.rotation.x - (before.get(o.id) ?? 0)) > 1e-9) changed++
    })
    expect(changed).toBe(1)
  })

  it('points +X forward, matching the sim body frame', () => {
    // sim/ body frame is +X forward, +Y up, +Z right. A model built down -X
    // flies backwards and every camera offset is wrong by 180 degrees.
    const { root } = createHellcat()
    let maxX = -Infinity
    const p = new Vector3()
    root.traverse((o) => {
      o.getWorldPosition(p)
      if (p.x > maxX) maxX = p.x
    })
    expect(maxX).toBeGreaterThan(2)
  })
})

describe('markers', () => {
  it('places markers at a known spacing so altitude is judgeable', () => {
    // The previous version filtered gaps with `.filter(g => g > 1)`, which
    // discards ZERO gaps -- so stacking all 105 markers at x = 0 produced an
    // empty array and a vacuous loop, under a test named for the very
    // property that would have destroyed. Found by mutation 2026-09-13.
    const m = createMarkers()
    const xs = [...new Set(m.children.map((c) => c.position.x))].sort((a, b) => a - b)
    const zs = [...new Set(m.children.map((c) => c.position.z))].sort((a, b) => a - b)
    expect(xs.length).toBeGreaterThan(8)
    expect(zs.length).toBeGreaterThan(8)
    expect(m.children.length).toBe(xs.length * zs.length)
    for (const axis of [xs, zs]) {
      for (let i = 1; i < axis.length; i++) {
        expect(axis[i]! - axis[i - 1]!).toBeCloseTo(MARKER_SPACING_M, 6)
      }
    }
  })

  it('follows the eye, snapped to its own spacing so the pattern stays world-locked', () => {
    // The sky was re-centred from Task 12 and the water from I-1; the markers
    // are the third member of that family and were missed both times. At the
    // spawn's 120 m/s the airplane left the old fixed patch sideways in 17
    // seconds, after which there was no scale reference at all -- invisible
    // over featureless water, which is why flying it did not catch this.
    const m = createMarkers()
    recentreMarkers(m, 4400, -1600)
    // Snapped, not tracked: an unsnapped translation would drag every marker
    // along with the airplane and remove the parallax they exist to give.
    expect(m.position.x).toBe(4000)
    expect(m.position.z).toBe(-2000)
    expect(m.position.y).toBe(0)
    // Every marker still lands on a world grid point, from any eye position.
    for (const eye of [[0, 0], [4400, -1600], [-98_765, 33_333]] as const) {
      recentreMarkers(m, eye[0], eye[1])
      for (const child of m.children.slice(0, 5)) {
        const worldX = m.position.x + child.position.x
        expect(Math.abs(worldX / MARKER_SPACING_M - Math.round(worldX / MARKER_SPACING_M))).toBeLessThan(1e-9)
      }
    }
    // And it actually keeps up: never more than half a spacing from the eye.
    recentreMarkers(m, 123_456, -654_321)
    expect(Math.abs(m.position.x - 123_456)).toBeLessThanOrEqual(MARKER_SPACING_M / 2)
    expect(Math.abs(m.position.z - -654_321)).toBeLessThanOrEqual(MARKER_SPACING_M / 2)
  })
})

describe('the ocean backdrop', () => {
  it('shares its deep-water colour with the lower sky', () => {
    expect(DEEP_WATER_COLOUR).toBe(SEA_COLOUR)
  })

  it('draws the sky behind distant ocean and terrain regardless of depth', () => {
    const sky = createSky() as Mesh
    expect(sky.renderOrder).toBeLessThan(0)
    const material = sky.material as { depthTest: boolean; depthWrite: boolean }
    expect(material.depthTest).toBe(false)
    expect(material.depthWrite).toBe(false)
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
    // origin would then swing the sun around as the airplane moves.
    const l = createLighting()
    const sun = l.children.find((c): c is DirectionalLight => c instanceof DirectionalLight)
    expect(sun).toBeDefined()
    expect(l.children).toContain(sun!.target)
  })

  it('includes a hemisphere light as bounce fill', () => {
    // Every material in the scene (water.ts, markers.ts, hellcat.ts) is a lit
    // MeshStandardMaterial: with only the directional sun, the shadowed side
    // of the airplane renders flat black and nothing headless would ever
    // show that. Without this assertion, deleting the HemisphereLight left
    // every other test in this suite green (Task 12 review finding).
    const l = createLighting()
    const hemi = l.children.find((c) => c instanceof HemisphereLight)
    expect(hemi).toBeDefined()
  })
  it('points the sun from above, and gives the fill real intensity', () => {
    // Both of these were `toBeDefined()`. Setting the hemisphere intensity to
    // zero is behaviourally identical to the deletion the test's own comment
    // says it exists to catch, and it passed; so did moving the sun below the
    // sea, which lights the whole scene from underneath.
    const lights = createLighting()
    const sun = lights.children.find((c): c is DirectionalLight => c instanceof DirectionalLight)
    const fill = lights.children.find((c): c is HemisphereLight => c instanceof HemisphereLight)
    expect(sun).toBeDefined()
    expect(fill).toBeDefined()
    expect(sun!.position.y).toBeGreaterThan(0)
    expect(sun!.intensity).toBeGreaterThan(0)
    expect(fill!.intensity).toBeGreaterThan(0)
  })

  it('lights from the one sun uniform, so 16c can move it and nothing can be lit from a second direction', () => {
    // lighting.ts warned since Plan 5 that "two literals for one sun" would let
    // the terrain be lit from a different direction than the airplane parked
    // on it. Plan 16b made the direction a uniform; this pins the light to it.
    const lights = createLighting()
    const sun = lights.children.find((c): c is DirectionalLight => c instanceof DirectionalLight)!
    expect(sun.position.toArray()).toEqual(sunDirectionNode.value.toArray())
    expect(sunDirectionNode.value.toArray()).toEqual([SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z])
  })

  it('applySun drives both lights and the shared uniforms from the palette (Plan 16c)', () => {
    const lights = createLighting()
    const sun = lights.children.find((c): c is DirectionalLight => c instanceof DirectionalLight)!
    const fill = lights.children.find((c): c is HemisphereLight => c instanceof HemisphereLight)!
    const palette = paletteFor(0)
    applySun(lights, palette, v3(-0.9, 0.05, 0.2), 0)
    expect(sun.position.toArray()).toEqual([-0.9, 0.05, 0.2])
    expect(sunDirectionNode.value.toArray()).toEqual([-0.9, 0.05, 0.2])
    expect(sun.intensity).toBe(palette.sunIntensity)
    expect(sun.color.r).toBeCloseTo(palette.sunColor[0], 6)
    expect(fill.color.g).toBeCloseTo(palette.fillSky[1], 6)
    expect(fill.groundColor.b).toBeCloseTo(palette.fillGround[2], 6)
    expect(sunTintNode.value.r).toBeCloseTo(palette.sunTint[0], 6)
    expect(skyHorizonNode.value.r).toBeCloseTo(palette.horizon[0], 6)
    expect(skyZenithNode.value.b).toBeCloseTo(palette.zenith[2], 6)
    expect(sunElevationNode.value).toBe(0)
    expect(ambientScaleNode.value).toBe(palette.ambientScale)
    // Back to the high key: the uniforms read exactly today's constants again.
    applySun(lights, paletteFor(70), v3(SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z), 70)
    expect(sunTintNode.value.toArray()).toEqual([1, 1, 1])
    expect(sun.position.toArray()).toEqual([SUN_DIRECTION.x, SUN_DIRECTION.y, SUN_DIRECTION.z])
  })

  it('casts only when given a cloud-shadow node, which it hands to the sun (Plan 16b)', () => {
    const plain = createLighting().children.find((c): c is DirectionalLight => c instanceof DirectionalLight)!
    expect(plain.castShadow).toBe(false)
    const node = float(0.5)
    const shadowed = createLighting(node).children.find((c): c is DirectionalLight => c instanceof DirectionalLight)!
    expect(shadowed.castShadow).toBe(true)
    expect((shadowed.shadow as unknown as { shadowNode: unknown }).shadowNode).toBe(node)
  })
})
