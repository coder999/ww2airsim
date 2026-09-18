import { describe, it, expect } from 'vitest'
import { InstancedMesh, Mesh } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { AIRFIELD_BUILDINGS, createAirfield, inAirfieldClearing } from '../../src/render/scene/airfield.js'
import { TREE_CELL_M, TREE_CELL_RADIUS, TREE_FADE_END_M, createVegetation, residentCellOffsets, treeSites } from '../../src/render/scene/vegetation.js'
import { createDetailTexture } from '../../src/render/terrain/surface.js'
import { createTerrainMesh } from '../../src/render/terrain/mesh.js'
import { COVER_HEADER } from '../../src/render/landcover/load.js'
import { coverByteLength } from '../../src/render/landcover/cover.js'
import { SCENERY_TIERS } from '../../src/render/scene/tiers.js'
import { RUNWAY_CENTRE, RUNWAY_WIDTH_M } from '../../src/render/scene/runway.js'
import { RIVER_PATHS, nearRiver, riverMask } from '../../src/render/terrain/rivers.js'
import { createTerrainField, heightAt } from '../../src/sim/world/terrain.js'
import { FIRST_COMMITTED_LEVEL, loadTerrainHeader, loadTerrainLevel } from '../../tools/terrain/load.js'

const header = loadTerrainHeader()
const field = createTerrainField(header, FIRST_COMMITTED_LEVEL, loadTerrainLevel(FIRST_COMMITTED_LEVEL, header))

describe('scenery placement on the real Leyte field', () => {
  it('keeps all building footprints on land and outside the runway', () => {
    for (const b of AIRFIELD_BUILDINGS) {
      expect(b.x + b.width / 2).toBeLessThan(-RUNWAY_WIDTH_M / 2 - 10)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = RUNWAY_CENTRE.x + b.x + sx * b.width / 2
        const z = RUNWAY_CENTRE.z + b.z + sz * b.length / 2
        expect(heightAt(field, x, z)).toBeGreaterThan(0)
        expect(inAirfieldClearing(x, z)).toBe(true)
      }
    }
    const object = createAirfield(field)
    expect(object.children.length).toBeLessThanOrEqual(10)
    for (const child of object.children) {
      expect(child).toBeInstanceOf(Mesh)
      const mesh = child as Mesh
      expect(Array.from(mesh.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true)
      mesh.geometry.dispose()
    }
  })

  it('has stable trees while leaving shore, runway, service apron and river banks clear', () => {
    const sites = []
    for (let x = -78; x <= -73; x++) for (let z = -121; z <= -118; z++) {
      sites.push(...treeSites(field, x, z))
    }
    expect(sites.length).toBeGreaterThan(100)
    for (const t of sites) {
      expect(t.y).toBeGreaterThanOrEqual(3)
      expect(inAirfieldClearing(t.x, t.z)).toBe(false)
      expect(nearRiver(t.x, t.z)).toBe(false)
    }
    expect(treeSites(field, -78, -119)).toEqual(treeSites(field, -78, -119))
  })

  it('fades trees without alphaHash, which this Chromium cannot compile', () => {
    // 2026-09-17, Tier 2 on daa1b39: both tree materials failed pipeline
    // creation with "An error occurred while generating Tint IR", which
    // three surfaces only on the console -- the app draws every frame
    // minus the trees, and its own error list shows just the downstream
    // "invalid due to a previous error" entries. Confirmed with a single-
    // variable probe: removing `alphaHash: true` alone took the sweep from
    // 8 validation errors to 0 on the reference desktop (Playwright 1.63
    // Chromium, RX 6700 XT). three r186's hash takes dFdx/dFdy of the
    // position and then discards; the terrain's own Discard, which takes no
    // derivatives, compiles fine. The fade is therefore a per-instance alpha
    // test on `hash(instanceIndex)` against the distance fade: no
    // derivatives, no blending, one opaque pipeline.
    const vegetation = createVegetation(field)
    for (const mesh of vegetation.object.children as InstancedMesh[]) {
      const material = mesh.material as MeshStandardNodeMaterial
      expect(material.alphaHash, `${mesh.name || 'tree mesh'} still sets alphaHash`).toBe(false)
      expect(material.transparent, 'the fade must not need a blended pipeline').toBe(false)
      expect(material.alphaTestNode, 'per-instance dissolve threshold missing').not.toBeNull()
      expect(material.opacityNode, 'distance fade missing').not.toBeNull()
    }
  })

  it('samples the ground detail texture without anisotropic filtering', () => {
    // Measured 2026-09-17 on the reference desktop (RX 6700 XT, 2560x1440,
    // 3,000 m over Leyte, trees off, GPU timestamps with rendering
    // serialized on the resolve so every sample is one whole frame):
    //   anisotropy 8   8.98 ms p50   (as Codex shipped it in daa1b39)
    //   anisotropy 4   7.21
    //   anisotropy 2   4.72
    //   anisotropy 1   3.80
    //   no detail texture at all   3.34;  pre-scenery main 801775f   3.15
    // Nine detail lookups per fragment at 8x anisotropy were two thirds of
    // the whole frame and over the 8.33 ms a 120 Hz frame allows, and two
    // screenshots down the Tacloban strip at 8 and at 1 are indistinguishable
    // (the noise is 8- to 64-cell value noise on a 256-texel tile; there is
    // no fine structure for anisotropy to preserve). Keep it at 1.
    expect(createDetailTexture().anisotropy).toBe(1)
  })

  it('keeps only the cells that can still show a tree, a disc not a square', () => {
    // The dissolve ends at TREE_FADE_END_M from the eye (vegetation.ts). A
    // cell whose NEAREST point is beyond that draws nothing but discarded
    // fragments, and as Codex shipped it the 11x11 square window carried
    // 121 cells of which the corners lie 1.8-2.3 km out. Measured
    // 2026-09-17: the square's 26,620-instance rewrite on every 400 m cell
    // crossing cost 4.7-7.2 ms of main-thread time in node, about one
    // 120 Hz frame each time.
    const offsets = residentCellOffsets()
    expect(offsets.length).toBeLessThan((TREE_CELL_RADIUS * 2 + 1) ** 2)
    expect(offsets.length).toBeGreaterThan(60)
    for (const [dx, dz] of offsets) {
      // Nearest point of the offset cell to the eye's own cell, in cells.
      const nearest = Math.hypot(Math.max(0, Math.abs(dx) - 1), Math.max(0, Math.abs(dz) - 1)) * TREE_CELL_M
      expect(nearest).toBeLessThanOrEqual(TREE_FADE_END_M)
    }
    // And nothing inside the disc is missing: every cell within the fade is resident.
    for (let dz = -TREE_CELL_RADIUS; dz <= TREE_CELL_RADIUS; dz++) for (let dx = -TREE_CELL_RADIUS; dx <= TREE_CELL_RADIUS; dx++) {
      const nearest = Math.hypot(Math.max(0, Math.abs(dx) - 1), Math.max(0, Math.abs(dz) - 1)) * TREE_CELL_M
      if (nearest <= TREE_FADE_END_M) expect(offsets.some(([x, z]) => x === dx && z === dz), `cell ${dx},${dz} missing`).toBe(true)
    }
  })

  it('generates only the cells that entered on a crossing, and copies the rest', () => {
    const vegetation = createVegetation(field)
    vegetation.update(-40900, -30666)
    const before = vegetation.stats()
    vegetation.update(-40900 + TREE_CELL_M, -30666)
    const after = vegetation.stats()
    // One cell-column of the disc entered; the rest came from the cache.
    expect(after.generated - before.generated).toBeLessThanOrEqual(2 * TREE_CELL_RADIUS + 1)
    expect(after.generated - before.generated).toBeGreaterThan(0)
    // Same eye, same forest: a crossing and its return are byte-identical.
    const crowns = vegetation.object.children[0] as InstancedMesh
    const moved = crowns.instanceMatrix.array.slice(0, crowns.count * 16)
    vegetation.update(-40900, -30666)
    vegetation.update(-40900 + TREE_CELL_M, -30666)
    expect(crowns.instanceMatrix.array.slice(0, crowns.count * 16)).toEqual(moved)
  })

  it('follows the quality tier: a shorter forest on medium, none on low, and back', () => {
    // The ocean's one-time downgrade (main.ts adaptOceanQuality) is the only
    // quality signal the app has, and the trees are the scenery's one
    // GPU-scalable cost: 1.1 ms of a 4.9 ms frame at 1440p on the reference
    // desktop (2026-09-17). Tiers cut the dissolve distance, and with it the
    // disc of resident cells, rather than thinning cells: a forest that ends
    // sooner reads as haze; a forest with gaps reads as a bug.
    expect(SCENERY_TIERS.high.treeFadeEndM).toBe(TREE_FADE_END_M)
    expect(SCENERY_TIERS.medium.treeFadeEndM).toBeLessThan(SCENERY_TIERS.high.treeFadeEndM)
    expect(SCENERY_TIERS.low.treeFadeEndM).toBe(0)
    const vegetation = createVegetation(field)
    vegetation.update(-40900, -30666)
    const crowns = vegetation.object.children[0] as InstancedMesh
    const high = crowns.count
    expect(high).toBeGreaterThan(1000)
    vegetation.setTier('medium')
    const medium = crowns.count
    expect(medium).toBeGreaterThan(0)
    expect(medium).toBeLessThan(high)
    vegetation.setTier('low')
    expect(crowns.count).toBe(0)
    vegetation.update(-40900 + TREE_CELL_M, -30666)
    expect(crowns.count).toBe(0)
    vegetation.setTier('high')
    vegetation.update(-40900, -30666)
    expect(crowns.count).toBe(high)
    expect(residentCellOffsets(SCENERY_TIERS.medium.treeFadeEndM).length).toBeLessThan(residentCellOffsets().length)
  })

  it('removes stale tree instances when flying over open ocean and restores the same forest', () => {
    const vegetation = createVegetation(field)
    const crowns = vegetation.object.children[0] as InstancedMesh
    vegetation.update(-31000, -47000)
    const count = crowns.count
    const matrices = crowns.instanceMatrix.array.slice(0, count * 16)
    expect(count).toBeGreaterThan(100)
    vegetation.update(80000, 80000)
    expect(crowns.count).toBe(0)
    vegetation.update(-31000, -47000)
    expect(crowns.count).toBe(count)
    expect(crowns.instanceMatrix.array.slice(0, count * 16)).toEqual(matrices)
  })

  it('places rivers north and west of the gulf origin without transposing the texture axes', () => {
    const m = riverMask()
    for (const river of RIVER_PATHS) for (const p of river.points) {
      expect(p.x).toBeLessThan(0)
      expect(p.z).toBeLessThan(0)
      const col = Math.floor((p.x - m.minX) / m.stepX)
      const row = Math.floor((p.z - m.minZ) / m.stepZ)
      expect(m.data[row * m.size + col]).toBeGreaterThan(200)
      expect(nearRiver(p.x, p.z)).toBe(true)
      expect(nearRiver(p.x, -p.z)).toBe(false)
    }
    expect(nearRiver(RUNWAY_CENTRE.x, RUNWAY_CENTRE.z)).toBe(false)
  })

  it('takes the land-cover raster once it arrives, and paints procedurally until then', () => {
    const mesh = createTerrainMesh(header)
    // Before the raster: the shader's `ready` uniform is 0, so the class
    // weights come from Codex's noise-and-height rule -- the mangrove/crop
    // terms multiply by `ready` and the forest term's `mix` selects the
    // procedural branch at `ready = 0`, so the graph reduces to daa1b39's
    // rule (surface.ts's `terrainSurfaceNode` comment has the full algebraic
    // argument, checked 2026-09-18 after a review found and fixed a real
    // drift here). This is also the fallback if the fetch fails: an island,
    // not a brown one. Nothing below exercises the shader itself -- there is
    // no headless TSL/GPU evaluator in this repo, so this test can only pin
    // the mesh-side mechanics (`ready`, the texture, `setCover`), not the
    // rendered pixels; a future edit to `terrainSurfaceNode` that reintroduces
    // this class of bug would not fail anything here.
    expect(mesh.cover.ready.value).toBe(0)
    expect(mesh.cover.texture.image.width).toBe(COVER_HEADER.samples)
    const versionBefore = mesh.cover.texture.version
    const data = new Uint8Array(coverByteLength(COVER_HEADER))
    data[0] = 255
    mesh.setCover(data)
    expect(mesh.cover.ready.value).toBe(1)
    expect((mesh.cover.texture.image.data as Uint8Array)[0]).toBe(255)
    // `needsUpdate` is write-only in three (it bumps `version`), same as
    // terrainLoad.test.ts's level-texture check -- so the re-upload is
    // checked by the thing it actually does, not by reading the setter back.
    expect(mesh.cover.texture.version).toBeGreaterThan(versionBefore)
    expect(() => mesh.setCover(new Uint8Array(16))).toThrow(/16 bytes/)
  })
})
