import { describe, it, expect, vi } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import {
  InstancedBufferGeometry,
  Mesh,
  Vector3,
  type BufferGeometry,
  type InstancedBufferAttribute,
} from 'three'
import {
  applyTerrainLevel,
  decodeLevel,
  loadTerrainProgressively,
  physicsFieldFor,
  TERRAIN_HEADER,
} from '../../src/render/terrain/load.js'
import { createTerrainMesh, sampleLevelsForRing } from '../../src/render/terrain/mesh.js'
import { finestFetchedLevelFor, INTERIM_ASSET_QUALITY_TIER, terrainLevelUrl } from '../../src/render/content.js'
import { LOD, selectNodes } from '../../src/render/terrain/lod.js'
import { initialFrameState, withTerrain } from '../../src/render/frame.js'
import { samplesAtLevel } from '../../src/sim/world/schema.js'
import { createState } from '../../src/sim/flight/state.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { createTerrainField, heightAt } from '../../src/sim/world/terrain.js'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { loadTerrainLevel, TERRAIN_DIR } from '../../tools/terrain/load.js'

/**
 * The level these tests exercise as "the" finest fetched level -- mirrors
 * `main.ts`'s own placeholder, `content.ts`'s `INTERIM_ASSET_QUALITY_TIER`
 * (see its own comment for what it is and why), rather than hardcoding a
 * number, so this file measures the same level the app actually asks for
 * today. Before Task 2 (2026-09-24) `FINEST_FETCHED_LEVEL` was a fixed
 * constant this file imported directly; it is now a function of the Asset
 * Quality tier, tested in its own right below
 * (`describe('finestFetchedLevelFor', ...)`).
 */
const FINEST_FETCHED_LEVEL = finestFetchedLevelFor(INTERIM_ASSET_QUALITY_TIER)

/**
 * Sample edge of one pyramid level, computed from the exponent rather than
 * from `samplesAtLevel` so these tests check the loader against the content
 * independently instead of against the same function the loader calls.
 *
 * DEVIATION FROM THE TASK BRIEF, stated rather than quietly applied: the
 * brief's own version of the third test below printed `2 ** (12 - level) + 1`.
 * That is one level too small for every level. `content/terrain/header.json`
 * has `finestSamples: 8193 = 2^13 + 1` and `levels: 13`, so level `l` is
 * `2^(13-l) + 1` samples on a side -- L12 is 3x3 (18 bytes on disk), not 2x2.
 * With 12, every mocked response is the wrong length and `decodeLevel`'s
 * length guard -- the very thing the test above it exists to prove works --
 * rejects all of them, so the brief's test could not pass against a correct
 * loader.
 */
function edgeSamples(level: number): number {
  return 2 ** (13 - level) + 1
}

/** A `fetch` that answers any `L<n>.bin` with a correctly-sized buffer of
 *  zeros, recording the URLs it was asked for. */
function mockLevelFetch(): { fetchImpl: typeof fetch; urls: string[] } {
  const urls: string[] = []
  const fetchImpl = vi.fn(async (url: string) => {
    urls.push(String(url))
    const level = Number(/L(\d+)\.bin/.exec(String(url))![1])
    const n = edgeSamples(level)
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(n * n * 2) } as Response
  })
  return { fetchImpl: fetchImpl as unknown as typeof fetch, urls }
}

describe('terrain decoding', () => {
  it('reads little-endian int16 regardless of the host', () => {
    // `expectedSamples` is the grid EDGE, so 2 means a 2x2 grid: four values,
    // eight bytes.
    const buf = new Uint8Array([0x10, 0x27, 0xf0, 0xd8, 0x00, 0x00, 0x01, 0x00]).buffer
    expect(Array.from(decodeLevel(buf, 2))).toEqual([10000, -10000, 0, 1])
  })

  it('refuses a level whose length disagrees with the header', () => {
    // A short file decodes happily into a smaller grid and renders as terrain
    // with a torn edge, which reads as a shader bug.
    expect(() => decodeLevel(new ArrayBuffer(6), 2)).toThrow(/length/i)
  })

  it('delivers levels coarsest-first, so something is on screen early', async () => {
    const seen: number[] = []
    const { fetchImpl } = mockLevelFetch()
    await loadTerrainProgressively((level) => seen.push(level), FINEST_FETCHED_LEVEL, fetchImpl)
    expect(seen).toEqual([...seen].sort((a, b) => b - a))
    expect(seen[0]).toBeGreaterThan(seen[seen.length - 1]!)
  })

  it('fetches exactly the levels a fresh clone has, by the URL content.ts publishes', async () => {
    // The browser can fetch the WHOLE pyramid now: Task 2 (2026-09-24)
    // committed L0 and L1 (L0 via Git LFS, over GitHub's 100 MB per-file
    // limit) alongside L2-L12, so nothing here 404s in a fresh clone no
    // matter which Asset Quality tier chose the finest level. Checking the
    // committed directory on disk rather than restating
    // `FIRST_COMMITTED_LEVEL` keeps this true if the split ever moves again.
    const seen: number[] = []
    const { fetchImpl, urls } = mockLevelFetch()
    await loadTerrainProgressively((level) => seen.push(level), FINEST_FETCHED_LEVEL, fetchImpl)

    expect(urls).toEqual(seen.map(terrainLevelUrl))
    for (const level of seen) {
      expect(existsSync(`${TERRAIN_DIR}L${level}.bin`)).toBe(true)
    }
    // The assumption this test used to check has flipped (2026-09-24):
    // previously L2 was committed and L1 was not, so "one level finer than
    // what was fetched" was reliably absent. Now L0 and L1 are BOTH
    // committed and nothing finer than L0 exists in the pyramid at all, so
    // there is no absent neighbour to check for any tier -- this asserts the
    // real boundary instead: L0.bin exists, and there is no L-1 to fetch.
    expect(existsSync(`${TERRAIN_DIR}L0.bin`)).toBe(true)
    expect(existsSync(`${TERRAIN_DIR}L-1.bin`)).toBe(false)

    // ...and exactly the levels something draws: every level some ring
    // samples, and no level no ring can reach. Until 2026-09-14 the loop ran
    // to the top of the pyramid and spent four serial round-trips on L9-L12,
    // which no ring can sample (review, M5). Derived from
    // `sampleLevelsForRing` rather than restated, so raising `LOD.rings`
    // cannot leave a ring reading a level nobody fetched.
    const sampled = new Set<number>()
    for (let ring = 0; ring < LOD.rings; ring++) {
      const { fine, coarse } = sampleLevelsForRing(ring, FINEST_FETCHED_LEVEL, TERRAIN_HEADER.levels - 1)
      sampled.add(fine)
      sampled.add(coarse)
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([...sampled].sort((a, b) => a - b))
  })

  it('treats a level that will not load as a failure, not as flat ground', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found' }) as Response)
    // Silently carrying on leaves the airplane over an empty sea that looks
    // exactly like the game working -- spec §9's "fail loudly" case.
    await expect(
      loadTerrainProgressively(() => {}, FINEST_FETCHED_LEVEL, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/404/)
  })
})

describe('finestFetchedLevelFor', () => {
  it('maps each Asset Quality tier to the level design spec addendum §10 names', () => {
    // low's budget ceiling is 50MB and L1 alone (33.6 MB) already spends
    // nearly all of it; medium/high/ultra all reach full 24 m resolution
    // (L0) -- they differ only in how much real texture/asset headroom a
    // later spec adds on top, which does not exist yet.
    //
    // The literal `'low'`, not `INTERIM_ASSET_QUALITY_TIER`, is deliberate
    // here: this test is pinning the TIER-TO-LEVEL MAPPING's contract (`low`
    // means 1, full stop), which must hold regardless of which tier
    // `main.ts` currently uses as its placeholder -- unlike the
    // `GROUND_TRUTH_LEVEL`-style constants elsewhere in this file and
    // others, which deliberately DO track `INTERIM_ASSET_QUALITY_TIER` so
    // they keep measuring whatever the app actually flies over.
    expect(finestFetchedLevelFor('low')).toBe(1)
    expect(finestFetchedLevelFor('medium')).toBe(0)
    expect(finestFetchedLevelFor('high')).toBe(0)
    expect(finestFetchedLevelFor('ultra')).toBe(0)
  })

  it('every level it can return is actually committed on disk', () => {
    // The one thing this function could get wrong without a browser: naming
    // a level that a fresh clone does not actually have, which would 404 at
    // runtime and look exactly like the game working (spec §9).
    for (const tier of ['low', 'medium', 'high', 'ultra'] as const) {
      const level = finestFetchedLevelFor(tier)
      expect(existsSync(`${TERRAIN_DIR}L${level}.bin`), `L${level}.bin for tier '${tier}'`).toBe(true)
    }
  })
})

describe('terrain mesh', () => {
  /** The coarsest level any ring samples, and so the coarsest the mesh keeps
   *  a texture for -- four short of the top of the pyramid (mesh.ts). */
  const COARSEST_DRAWN_LEVEL = sampleLevelsForRing(
    LOD.rings - 1,
    FINEST_FETCHED_LEVEL,
    TERRAIN_HEADER.levels - 1,
  ).coarse

  /** Every instance the mesh would draw, flattened out of its per-ring
   *  groups, in the same shape `selectNodes` returns. */
  function drawnNodes(mesh: ReturnType<typeof createTerrainMesh>): string[] {
    const keys: string[] = []
    mesh.object.children.forEach((child, ring) => {
      const geometry = (child as Mesh).geometry as InstancedBufferGeometry
      const spec = geometry.getAttribute('nodeSpec')
      for (let i = 0; i < geometry.instanceCount; i++) {
        keys.push(`${spec.getX(i)},${spec.getY(i)},${spec.getZ(i)},${ring},${spec.getW(i)}`)
      }
    })
    return keys.sort()
  }

  it('draws each selected node once, at its own centre, size, ring and morph', () => {
    // Deliberately off the x = z diagonal. At (3000, 3000) the selected set is
    // symmetric about that diagonal, so swapping centreX and centreZ maps it
    // onto itself and this test passes with the coordinates transposed --
    // confirmed by mutation, 2026-09-14, which is how this line got written.
    const mesh = createTerrainMesh(TERRAIN_HEADER, FINEST_FETCHED_LEVEL)
    mesh.update(3e3, -47e3)

    // float32 on the way to the GPU, so the expectation is rounded the same
    // way rather than compared with a tolerance -- an exact check that still
    // fails on a swapped x/z or a dropped morph.
    const expected = selectNodes(3e3, -47e3)
      .map((n) =>
        [n.centreX, n.centreZ, n.sizeM, n.ring, n.morph].map((v, i) => (i === 3 ? v : Math.fround(v))).join(','),
      )
      .sort()
    expect(drawnNodes(mesh)).toEqual(expected)
    expect(expected.length).toBeGreaterThan(100)
  })

  it('re-packs from scratch each frame, and flags the result for re-upload', () => {
    const mesh = createTerrainMesh(TERRAIN_HEADER, FINEST_FETCHED_LEVEL)
    mesh.update(3e3, 3e3)
    mesh.update(-40e3, 61e3)
    const expected = selectNodes(-40e3, 61e3).length
    let drawn = 0
    for (const child of mesh.object.children) {
      const geometry = (child as Mesh).geometry as InstancedBufferGeometry
      drawn += geometry.instanceCount
      // A fresh InstancedBufferAttribute is version 0 and three only re-reads
      // it when the version moves. Packed but never flagged, the terrain
      // would draw the first frame's patch layout forever while `update`
      // faithfully rewrote an array nobody uploads -- found by mutation
      // 2026-09-14, when removing the flag left every other test green.
      if (geometry.instanceCount > 0) {
        expect((geometry.getAttribute('nodeSpec') as InstancedBufferAttribute).version).toBeGreaterThan(0)
      }
    }
    expect(drawn).toBe(expected)
  })

  it('never lets three cull it: its bounds are in the shader, not the geometry', () => {
    // Every node's real position comes from an instance attribute the vertex
    // node applies, so the geometry's own bounding sphere is a half-metre
    // cube at the scene origin -- i.e. at -eye once the camera-relative
    // translation is applied. Left culled, the entire terrain disappears
    // whenever the world origin is out of frame, which is almost always.
    const mesh = createTerrainMesh(TERRAIN_HEADER, FINEST_FETCHED_LEVEL)
    for (const child of mesh.object.children) {
      expect(child.frustumCulled).toBe(false)
    }
  })

  it('winds its triangles to face up, so the ground is not inside out', () => {
    // Backface culling is on (FrontSide is three's default), and a grid wound
    // the other way renders nothing at all from an airplane. Nothing else in
    // this task can see that headless.
    const mesh = createTerrainMesh(TERRAIN_HEADER, FINEST_FETCHED_LEVEL)
    const geometry = (mesh.object.children[0] as Mesh).geometry as BufferGeometry
    const position = geometry.getAttribute('position')
    const index = geometry.getIndex()!
    expect(index.count % 3).toBe(0)
    const a = new Vector3()
    const b = new Vector3()
    const c = new Vector3()
    for (let t = 0; t < index.count; t += 3) {
      a.fromBufferAttribute(position, index.getX(t))
      b.fromBufferAttribute(position, index.getX(t + 1))
      c.fromBufferAttribute(position, index.getX(t + 2))
      const normalY = b.sub(a).cross(c.sub(a)).y
      expect(normalY).toBeGreaterThan(0)
    }
  })

  it('stores a level as metres, in the texture whose size the header dictates', () => {
    const mesh = createTerrainMesh(TERRAIN_HEADER, FINEST_FETCHED_LEVEL)
    const level = COARSEST_DRAWN_LEVEL
    const n = samplesAtLevel(TERRAIN_HEADER, level)
    const versionBefore = mesh.levelTexture(level).version
    const data = new Int16Array(n * n)
    data[0] = 12366 // decimetres: the highest sample in the real L4 grid, 1236.6 m
    mesh.setLevel(level, data)

    const tex = mesh.levelTexture(level)
    expect(tex.image.width).toBe(n)
    expect(tex.image.height).toBe(n)
    expect((tex.image.data as Float32Array)[0]).toBeCloseTo(1236.6, 4)
    // `needsUpdate` is write-only in three (it bumps `version`), so the
    // re-upload is checked by the thing it actually does: without it the
    // decoded level sits in CPU memory and the GPU keeps the zeros.
    expect(tex.version).toBeGreaterThan(versionBefore)
  })

  it('refuses a level whose sample count disagrees with the header', () => {
    const mesh = createTerrainMesh(TERRAIN_HEADER, FINEST_FETCHED_LEVEL)
    expect(() => mesh.setLevel(COARSEST_DRAWN_LEVEL, new Int16Array(4))).toThrow(/samples/i)
  })

  it('gives every ring exactly one quad per texel of its own mip', () => {
    // The identity the whole design rests on and that nothing guarded until
    // this test (review 2026-09-14, I2): a ring-k patch tessellated into
    // `quadsPerNode` quads has vertices EXACTLY on mip k's samples. It is why
    // `sampleLevelsForRing` can equate ring index with pyramid level with no
    // lookup table, and why morphing only the height -- never the vertex's
    // horizontal position, as textbook CDLOD does -- still closes the seam
    // between two rings. Change `quadsPerNode` or `rings` and every argument
    // in those comments quietly stops holding while the terrain still draws.
    const worldM = 2 * TERRAIN_HEADER.halfExtentM
    const nodeSizeAtRing = (ring: number): number => (worldM / 2 ** (LOD.rings - 1)) * 2 ** ring

    // The formula is what `selectNodes` actually returns, not a parallel
    // invention: checked against every patch of a real selection first.
    for (const node of selectNodes(3e3, -47e3)) {
      expect(node.sizeM).toBe(nodeSizeAtRing(node.ring))
    }

    for (let ring = 0; ring < LOD.rings; ring++) {
      const vertexSpacingM = nodeSizeAtRing(ring) / LOD.quadsPerNode
      const mipSpacingM = worldM / (samplesAtLevel(TERRAIN_HEADER, ring) - 1)
      expect(vertexSpacingM).toBe(mipSpacingM)
    }
  })

  it('tells the shader where the camera is', () => {
    // The sink and the fog are both distances FROM THE CAMERA, so a uniform
    // left unwritten bowls and hazes the world around (0, 0) forever no
    // matter where the airplane goes -- and every other test here stays
    // green (review 2026-09-14, I3). `shaderCameraXZ` returns the uniform's
    // own value object, so this cannot pass against a mesh that updates a
    // copy.
    const mesh = createTerrainMesh(TERRAIN_HEADER, FINEST_FETCHED_LEVEL)
    expect(mesh.shaderCameraXZ().toArray()).toEqual([0, 0])
    mesh.update(3e3, -47e3)
    expect(mesh.shaderCameraXZ().toArray()).toEqual([3e3, -47e3])
  })

  it('reads the finest level it has for any ring finer than that level', () => {
    // A synthetic `finest`, not `FINEST_FETCHED_LEVEL`: this tests the
    // general clamping rule `sampleLevelsForRing` implements, which has to
    // hold for WHATEVER level a tier stops fetching at, not only for the one
    // this repo's placeholder happens to resolve to today
    // (`finestFetchedLevelFor('medium')` === 0, under which ring 0 is no
    // longer "finer than what's fetched" and this case would be vacuous --
    // Task 2, 2026-09-24, shipped L0/L1 as committed content). `low`'s level
    // (1) would also exercise real clamping at ring 0; 3 is chosen instead so
    // this case does not silently start passing vacuously again if a future
    // tier's level moves to 1.
    const finest = 3
    const coarsest = TERRAIN_HEADER.levels - 1
    // Clamping BOTH taps to the finest level held makes the morph blend a
    // no-op there rather than blending the ground under the airplane toward
    // a coarser level than the one it could have had.
    expect(sampleLevelsForRing(0, finest, coarsest)).toEqual({ fine: finest, coarse: finest })
    expect(sampleLevelsForRing(5, finest, coarsest)).toEqual({ fine: 5, coarse: 6 })
    // The coarsest ring has no coarser level to morph toward.
    expect(sampleLevelsForRing(coarsest, finest, coarsest)).toEqual({
      fine: coarsest,
      coarse: coarsest,
    })
  })
})

describe('load/mesh coupling', () => {
  it('the loader and the mesh agree on the coarsest level a ring can reach', async () => {
    // Until review round 2, `load.ts` and `mesh.ts` each wrote their own copy
    // of `Math.min(LOD.rings, header.levels - 1)` -- the coarsest level any
    // ring can sample -- with nothing tying the two together. Both now call
    // one function, `coarsestFetchedLevel` in `lod.ts`, but this test does
    // NOT call it: it observes each side's actual behaviour (the highest
    // level the loader asks the network for, and the highest level the mesh
    // holds a texture for) and checks they still agree. Calling the shared
    // function from both sides of the assertion would make this pass no
    // matter what the function returned; observing the two independently is
    // what lets a future edit that reverts one call site to a hand-rolled,
    // drifted copy of the rule fail here.
    const { fetchImpl } = mockLevelFetch()
    const seen: number[] = []
    await loadTerrainProgressively((level) => seen.push(level), FINEST_FETCHED_LEVEL, fetchImpl)
    const maxFetched = Math.max(...seen)

    const mesh = createTerrainMesh(TERRAIN_HEADER, FINEST_FETCHED_LEVEL)
    let maxMeshLevel = -1
    for (let level = 0; level < TERRAIN_HEADER.levels; level++) {
      try {
        mesh.levelTexture(level)
        maxMeshLevel = level
      } catch {
        // no texture reserved at this level
      }
    }
    expect(maxMeshLevel).toBe(maxFetched)
  })

  it('refuses a header whose world is a different size from the LOD\'s', () => {
    // `createTerrainMesh` sizes its textures and its world->grid mapping from
    // the header it is HANDED, but `update` selects nodes with the default
    // `LOD`, whose half-extent comes from the committed header.json. Disagree,
    // and patch footprints are laid out over one world while the shader reads
    // a texture built for another: terrain that is wrong everywhere and
    // plausible everywhere. Every real caller passes TERRAIN_HEADER, so this
    // is the only thing standing between "not reachable" and "not reachable
    // in silence" (review 2026-09-14, finding I2).
    expect(() => createTerrainMesh({ ...TERRAIN_HEADER, halfExtentM: TERRAIN_HEADER.halfExtentM / 2 }, FINEST_FETCHED_LEVEL)).toThrow(
      /half-extent/,
    )
    // ...and the level count is still free to differ, which is what
    // `coarsestFetchedLevel` takes a level count rather than a header for.
    expect(() => createTerrainMesh({ ...TERRAIN_HEADER, levels: LOD.rings + 1 }, FINEST_FETCHED_LEVEL)).not.toThrow()
  })
})

describe('terrain under the airplane', () => {
  const f6f = loadAircraftSpec('f6f-hellcat')
  const frameAt = (x: number, z: number) =>
    initialFrameState(f6f, createState({ position: v3(x, 3000, z), velocity: v3(120, 0, 0) }))

  it('hands the physics the finest level, and only that one', () => {
    // Levels land coarsest-first and a coarse level is not merely blurry:
    // `mips.ts` averages peaks DOWN and valleys UP, so it can put ground
    // above an airplane that is genuinely in clear air -- and `advance`
    // never overwrites the first impact it records. The mesh can afford a
    // wrong-but-improving surface; the physics cannot.
    const coarse = samplesAtLevel(TERRAIN_HEADER, FINEST_FETCHED_LEVEL + 1)
    expect(physicsFieldFor(FINEST_FETCHED_LEVEL + 1, new Int16Array(coarse * coarse), FINEST_FETCHED_LEVEL)).toBeNull()

    const n = samplesAtLevel(TERRAIN_HEADER, FINEST_FETCHED_LEVEL)
    const field = physicsFieldFor(FINEST_FETCHED_LEVEL, new Int16Array(n * n), FINEST_FETCHED_LEVEL)
    expect(field?.level).toBe(FINEST_FETCHED_LEVEL)
    expect(field?.samples).toBe(n)
  })

  it('puts the ground the browser decoded under the airplane, at the height Node reads', () => {
    // End to end over the REAL committed bytes: fetch-and-decode (the browser
    // path) must produce the same ground as `tools/terrain/load.ts` (the path
    // every sim test measures against). A wrong level, a byte-order slip or a
    // transposed grid all show up here as a different height.
    //
    // Until 2026-09-14 `World.terrain` was null for the life of the app: the
    // decoded levels went to the mesh and nowhere else, so master spec §11's
    // impact invariant was vacuous in the thing that ships and the airplane
    // flew through the mountains it could see (review, promoted to I4).
    const level = FINEST_FETCHED_LEVEL
    const n = samplesAtLevel(TERRAIN_HEADER, level)
    const bytes = readFileSync(`${TERRAIN_DIR}L${level}.bin`)
    const decoded = decodeLevel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), n)

    const field = physicsFieldFor(level, decoded, FINEST_FETCHED_LEVEL)
    expect(field).not.toBeNull()

    // A point that is genuinely on land: the nearest land sample to the world
    // origin, 23.1 km to the south-west. Re-derived 2026-09-18 by the same
    // rule when FIRST_COMMITTED_LEVEL moved 4 -> 2 -- the old pair was an
    // exact L4 sample position (-19921.875 = -51 * 390.625 m) and is sea on
    // the finer grid. This sample is 0.1 m, which is the quantized-coastal-
    // land case the shore work is about, so it clears `> 0` by one decimetre.
    const x = -20_019.53125
    const z = 11_621.09375
    const framed = withTerrain(frameAt(x, z), field)
    expect(framed.world.terrain).not.toBeNull()

    // `level`, not `FIRST_COMMITTED_LEVEL`: the two used to be numerically
    // interchangeable (both 2) but no longer are since Task 2 (2026-09-24)
    // decoupled "what's committed on disk" (now 0, everything) from "what
    // this page load's tier fetches" (`FINEST_FETCHED_LEVEL` above, 1 for
    // the `'low'` placeholder) -- passing the wrong one here reads a
    // DIFFERENT pyramid level than the one just decoded and throws on the
    // sample-count mismatch rather than comparing anything.
    const viaNode = createTerrainField(TERRAIN_HEADER, level, loadTerrainLevel(level))
    expect(heightAt(framed.world.terrain!, x, z)).toBe(heightAt(viaNode, x, z))
    expect(heightAt(framed.world.terrain!, x, z)).toBeGreaterThan(0)
  })

  it('hands each arrived level to the mesh, and the finest one to the physics too', () => {
    // `main.ts`'s terrain callback, with the renderer taken out of it. The
    // body used to live inline inside `boot()`, where nothing headless could
    // reach it: deleting the physics half left all 536 tests green and the
    // airplane flying through the mountains it could see, and only
    // `groundHeightM()` on a real GPU noticed. This is that call site, as a
    // function, asserted.
    const seen: Array<{ level: number; data: Int16Array }> = []
    const mesh = { setLevel: (level: number, data: Int16Array) => seen.push({ level, data }) }

    const coarseLevel = FINEST_FETCHED_LEVEL + 1
    const coarseN = samplesAtLevel(TERRAIN_HEADER, coarseLevel)
    const coarseData = new Int16Array(coarseN * coarseN)
    const before = frameAt(0, 0)
    const afterCoarse = applyTerrainLevel(mesh, before, coarseLevel, coarseData, FINEST_FETCHED_LEVEL)
    // Drawn, but NOT given to the physics: a coarse mip averages peaks down
    // and valleys up, and `advance` never overwrites the first impact it
    // records (load.ts's `physicsFieldFor`).
    expect(seen).toEqual([{ level: coarseLevel, data: coarseData }])
    expect(afterCoarse.world.terrain).toBeNull()

    const n = samplesAtLevel(TERRAIN_HEADER, FINEST_FETCHED_LEVEL)
    const fine = loadTerrainLevel(FINEST_FETCHED_LEVEL)
    const afterFine = applyTerrainLevel(mesh, afterCoarse, FINEST_FETCHED_LEVEL, fine, FINEST_FETCHED_LEVEL)
    expect(seen.length).toBe(2)
    expect(seen[1]!.level).toBe(FINEST_FETCHED_LEVEL)
    // The SAME array object, not a copy: the mesh's float texture and the
    // physics' int16 view are then provably of the same samples.
    expect(seen[1]!.data).toBe(fine)
    expect(afterFine.world.terrain?.samples).toBe(n)
    // Real ground, at the same land point the end-to-end test above uses --
    // a field that was wired up but built from the wrong level would still
    // be non-null here.
    expect(heightAt(afterFine.world.terrain!, -19_921.875, -11_718.75)).toBe(
      heightAt(createTerrainField(TERRAIN_HEADER, FINEST_FETCHED_LEVEL, fine), -19_921.875, -11_718.75),
    )
  })

  it('changes nothing else about the frame it is given', () => {
    // `withTerrain` runs once, mid-flight, on a frame the loop is already
    // advancing -- dropping the pilot's controls or the camera mode on the
    // way through would be a live bug at an unpredictable moment.
    const before = frameAt(0, 0)
    // Sized from the header rather than restated: a literal 513 here was an
    // L4 edge and broke the moment FINEST_FETCHED_LEVEL moved (2026-09-18).
    const edge = samplesAtLevel(TERRAIN_HEADER, FINEST_FETCHED_LEVEL)
    const after = withTerrain(before, physicsFieldFor(FINEST_FETCHED_LEVEL, new Int16Array(edge * edge), FINEST_FETCHED_LEVEL))
    expect(after.world.terrain).not.toBeNull()
    expect({ ...after, world: { ...after.world, terrain: null } }).toEqual(before)
  })
})
