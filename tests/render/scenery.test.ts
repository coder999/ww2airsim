import { describe, it, expect } from 'vitest'
import { InstancedMesh, Mesh } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { AIRFIELD_HUTS, createAirfield, inAirfieldClearing } from '../../src/render/scene/airfield.js'
import { TREE_CELL_M, TREE_CELL_RADIUS, TREE_FADE_END_M, coverLookup, createVegetation, residentCellOffsets, treeSites } from '../../src/render/scene/vegetation.js'
import { createCoverNodes, createDetailTexture } from '../../src/render/terrain/surface.js'
import { createTerrainMesh } from '../../src/render/terrain/mesh.js'
import { COVER_HEADER } from '../../src/render/landcover/load.js'
import { coverByteLength, quantize } from '../../src/render/landcover/cover.js'
import { SCENERY_TIERS } from '../../src/render/scene/tiers.js'
import { createRunway } from '../../src/render/scene/runway.js'
import { RIVER_PATHS, nearRiver, riverMask } from '../../src/render/terrain/rivers.js'
import { createTerrainField, heightAt } from '../../src/sim/world/terrain.js'
import { FIRST_COMMITTED_LEVEL, loadTerrainHeader, loadTerrainLevel } from '../../tools/terrain/load.js'
import { loadAirfield } from '../../tools/content/load.js'

const header = loadTerrainHeader()
const field = createTerrainField(header, FIRST_COMMITTED_LEVEL, loadTerrainLevel(FIRST_COMMITTED_LEVEL, header))

/** The scenery is drawn from the airfield records now (Plan 12 Task 7), not
 *  from a `RUNWAY_CENTRE` constant this file used to import. Both bases are
 *  loaded because `inAirfieldClearing` takes the whole list: keeping trees
 *  off Dulag's strip is the behaviour the list exists for. */
const tacloban = loadAirfield('tacloban')
const dulag = loadAirfield('dulag')

describe('scenery placement on the real Leyte field', () => {
  it('keeps all building footprints on land and outside the runway', () => {
    // Plan 6b split the old 7-entry AIRFIELD_BUILDINGS table into content
    // `buildings` (hangars, tower) plus AIRFIELD_HUTS (decorative); this
    // checks the same footprints, read from the union.
    const footprints = [
      ...tacloban.buildings.map((b) => ({ x: b.x, z: b.z, width: b.widthM, length: b.lengthM })),
      ...AIRFIELD_HUTS.map((h) => ({ x: h.x, z: h.z, width: h.width, length: h.length })),
    ]
    for (const b of footprints) {
      expect(b.x + b.width / 2).toBeLessThan(-tacloban.runway.widthM / 2 - 10)
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = tacloban.runway.center.x + b.x + sx * b.width / 2
        const z = tacloban.runway.center.z + b.z + sz * b.length / 2
        expect(heightAt(field, x, z)).toBeGreaterThan(0)
        expect(inAirfieldClearing([tacloban], x, z)).toBe(true)
      }
    }
    const object = createAirfield(field, tacloban)
    expect(object.children.length).toBeLessThanOrEqual(10)
    for (const child of object.children) {
      expect(child).toBeInstanceOf(Mesh)
      const mesh = child as Mesh
      expect(Array.from(mesh.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true)
      mesh.geometry.dispose()
    }
  })

  it('the content clearing reproduces the pre-Plan-12 formula at Tacloban exactly', () => {
    // `inAirfieldClearing` used to be two hardcoded boxes around
    // `RUNWAY_CENTRE`; it is now the strip plus `airfield.clearing` read from
    // `content/bases/tacloban.json`. That record was written to reproduce the
    // old boxes, and this is the check that it does -- a forest that crept
    // onto the apron, or a clearing that cut a hole in the jungle where none
    // used to be, would otherwise be invisible until someone flew there.
    const c = tacloban.runway.center
    const old = (x: number, z: number): boolean => {
      const dx = x - c.x, dz = z - c.z
      return (Math.abs(dx) < 65 && Math.abs(dz) < 1500 / 2 + 220) || (dx > -270 && dx < -35 && dz > -330 && dz < 210)
    }
    // Sampled off the half-metre, so no sample lands exactly ON a boundary.
    // The two forms genuinely differ there and only there: the old boxes
    // compared strictly (`dx > -270`), `insideRect` compares inclusively
    // (`<= widthM / 2`). Measured 2026-09-18: an aligned 5 m grid disagrees at
    // exactly 191 points, which is exactly the count of grid points lying ON
    // those lines (109 down the dx = -270 edge, plus 41 on each of the
    // dz = -330 and dz = 210 edges outside the strip's own box) -- and at no
    // other point, which is what this offset grid asserts. The brief's
    // `< 40` was an estimate of that boundary count, not a tolerance; zero
    // off-boundary disagreements is the stronger claim and the true one.
    let disagreements = 0
    for (let dx = -400.5; dx <= 400; dx += 5) for (let dz = -1100.5; dz <= 1100; dz += 5) {
      if (old(c.x + dx, c.z + dz) !== inAirfieldClearing([tacloban], c.x + dx, c.z + dz)) disagreements++
    }
    expect(disagreements).toBe(0)
  })

  it('draws its own buildings and huts, but not Tacloban\'s taxiways, stores or windsock', () => {
    // Before Plan 6b, `createAirfield` gated its ENTIRE Tacloban-only block
    // (taxiways, buildings, stores, windsock) behind `airfield.id ===
    // 'tacloban'`, so Dulag drew an empty group. Plan 6b narrows that gate:
    // every base's content `buildings` (Dulag's is a placeholder reusing
    // Tacloban's table, per its `reference.source`) and the decorative
    // `AIRFIELD_HUTS` now draw regardless of id, but the taxiways, apron
    // clutter and windsock below stay Tacloban-only until 13d gives Dulag its
    // own set -- so Dulag's group is non-empty but strictly smaller than
    // Tacloban's own.
    const object = createAirfield(field, dulag)
    expect(object.children.length).toBeGreaterThan(0)
    expect(object.name).toContain('Dulag')
    const taclobanObject = createAirfield(field, tacloban)
    expect(object.children.length).toBeLessThan(taclobanObject.children.length)
    for (const child of taclobanObject.children) (child as Mesh).geometry.dispose()
    for (const child of object.children) {
      expect(child).toBeInstanceOf(Mesh)
      const mesh = child as Mesh
      expect(Array.from(mesh.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true)
      mesh.geometry.dispose()
    }
    // The strip itself is still drawn, and on real ground: Dulag is inland of
    // the coast, so every vertex should be above sea level.
    const strip = createRunway(field, dulag) as Mesh
    const p = strip.geometry.getAttribute('position')
    expect(p.count).toBeGreaterThan(8)
    for (let i = 0; i < p.count; i++) expect(p.getY(i)).toBeGreaterThan(0)
  })

  it('keeps trees off the Dulag strip too', () => {
    // The whole point of `inAirfieldClearing` taking a list: Dulag is a strip
    // in `world.airfields` with no apron and no buildings, and before Plan 12
    // the jungle grew straight down the middle of it.
    const d = dulag.runway.center
    expect(inAirfieldClearing([tacloban, dulag], d.x, d.z)).toBe(true)
    expect(inAirfieldClearing([tacloban], d.x, d.z)).toBe(false)
  })

  it('has stable trees while leaving shore, runway, service apron and river banks clear', () => {
    const sites = []
    for (let x = -78; x <= -73; x++) for (let z = -121; z <= -118; z++) {
      sites.push(...treeSites(field, x, z, [tacloban]))
    }
    expect(sites.length).toBeGreaterThan(100)
    for (const t of sites) {
      expect(t.y).toBeGreaterThanOrEqual(3)
      expect(inAirfieldClearing([tacloban], t.x, t.z)).toBe(false)
      expect(nearRiver(t.x, t.z)).toBe(false)
    }
    expect(treeSites(field, -78, -119, [tacloban])).toEqual(treeSites(field, -78, -119, [tacloban]))
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
    const vegetation = createVegetation(field, [tacloban])
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
    const vegetation = createVegetation(field, [tacloban])
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
    const vegetation = createVegetation(field, [tacloban])
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
    const vegetation = createVegetation(field, [tacloban])
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
    expect(nearRiver(tacloban.runway.center.x, tacloban.runway.center.z)).toBe(false)
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

  it('carries a node-centred UV mapping, not a cell-centred one (whole-branch review, 2026-09-18)', () => {
    // The shader's `uv = xz.add(half).div(step).add(0.5).div(samples)`
    // (surface.ts's `terrainSurfaceNode`) is a UV expression -- there is no
    // headless TSL/GPU evaluator in this repo to run it, so this cannot pin
    // the rendered texel. What it CAN pin is the arithmetic relationship the
    // formula depends on: a node-centred grid where sample 0 sits exactly on
    // the west/north edge and (samples - 1) cells span the full width. If a
    // future edit reverts `step` to `2*half/samples` (a cell-centred step,
    // which is what produced the half-texel bug in the first place), this
    // fails even though nothing here touches the GPU.
    const nodes = createCoverNodes(COVER_HEADER)
    expect(nodes.samples).toBe(COVER_HEADER.samples)
    // Exact, not `toBeCloseTo`: `step` is a simple division with no
    // accumulated rounding, and the two known-wrong forms (dividing by
    // `samples` instead of `samples - 1`, or by `2 * halfExtentM` with no
    // division at all) are each off by a measurable amount at these real
    // dimensions, so an exact check catches both.
    const nodeCentredStep = (2 * nodes.halfExtentM) / (nodes.samples - 1)
    const cellCentredStep = (2 * nodes.halfExtentM) / nodes.samples // the wrong, pre-fix shape
    expect(nodes.step).toBe(nodeCentredStep)
    expect(nodes.step).not.toBe(cellCentredStep)
    // The relationship the node-centred convention promises: (samples - 1)
    // steps span the full box exactly, so sample 0 and sample (samples - 1)
    // land exactly on the west/north and east/south edges.
    expect(nodes.step * (nodes.samples - 1)).toBe(2 * nodes.halfExtentM)
  })

  it('plants by the tree fraction: dense jungle, bare paddies, mangroves at the waterline', () => {
    const bytes = coverByteLength(COVER_HEADER)
    const uniformCover = (tree: number, crop: number, mangrove: number, open: number) => {
      const data = new Uint8Array(bytes)
      for (let i = 0; i < bytes; i += 4) { data[i] = quantize(tree); data[i + 1] = quantize(crop); data[i + 2] = quantize(mangrove); data[i + 3] = quantize(open) }
      return coverLookup(data)
    }
    // An inland cell with real relief (the same cell the crossing test uses).
    const jungle = treeSites(field, -103, -77, [tacloban], uniformCover(1, 0, 0, 0)).length
    const paddy = treeSites(field, -103, -77, [tacloban], uniformCover(0, 1, 0, 0)).length
    const half = treeSites(field, -103, -77, [tacloban], uniformCover(0.5, 0.5, 0, 0)).length
    const procedural = treeSites(field, -103, -77, [tacloban]).length
    expect(paddy).toBe(0)
    expect(jungle).toBe(procedural)            // full tree cover keeps every site the old rule kept
    expect(half).toBeGreaterThan(jungle * 0.3)
    expect(half).toBeLessThan(jungle * 0.7)
    // Determinism survives the raster: the same cell, the same forest.
    expect(treeSites(field, -103, -77, [tacloban], uniformCover(0.5, 0.5, 0, 0))).toEqual(treeSites(field, -103, -77, [tacloban], uniformCover(0.5, 0.5, 0, 0)))
    // Mangroves grow below the 3 m shore exclusion that keeps jungle off the beach.
    const shoreCell = { x: Math.floor(-30000 / TREE_CELL_M), z: Math.floor(-46000 / TREE_CELL_M) }
    const lowSites = (sites: ReturnType<typeof treeSites>) => sites.filter(t => t.y < 3).length
    expect(lowSites(treeSites(field, shoreCell.x, shoreCell.z, [tacloban], uniformCover(1, 0, 0, 0)))).toBe(0)
    expect(lowSites(treeSites(field, shoreCell.x, shoreCell.z, [tacloban], uniformCover(0, 0, 1, 0)))).toBeGreaterThan(0)
  })

  it('rebuilds the forest when the raster arrives', () => {
    const vegetation = createVegetation(field, [tacloban])
    vegetation.update(-40900, -30666)
    const crowns = vegetation.object.children[0] as InstancedMesh
    const before = crowns.count
    const data = new Uint8Array(coverByteLength(COVER_HEADER))   // all zero: no tree cover anywhere
    vegetation.setCover(coverLookup(data))
    expect(crowns.count).toBe(0)
    expect(before).toBeGreaterThan(0)
  })
})
