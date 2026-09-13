import { describe, it, expect } from 'vitest'
import { Box3, DirectionalLight, Mesh, Vector3 } from 'three'
import { createHellcat } from '../../src/render/scene/hellcat.js'
import { createMarkers, MARKER_SPACING_M } from '../../src/render/scene/markers.js'
import { createWater, WATER_EXTENT_M } from '../../src/render/scene/water.js'
import { createSky } from '../../src/render/scene/sky.js'
import { createLighting } from '../../src/render/scene/lighting.js'

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
  it('extends past the draw distance so no edge is visible', () => {
    const w = createWater()
    const b = new Box3().setFromObject(w)
    const size = b.getSize(new Vector3())
    expect(size.x).toBeGreaterThanOrEqual(WATER_EXTENT_M)
    expect(size.z).toBeGreaterThanOrEqual(WATER_EXTENT_M)
  })
})

describe('sky', () => {
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
})
