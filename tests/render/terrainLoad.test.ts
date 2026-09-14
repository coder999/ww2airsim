import { describe, it, expect, vi } from 'vitest'
import { existsSync } from 'node:fs'
import {
  InstancedBufferGeometry,
  Mesh,
  Vector3,
  type BufferGeometry,
  type InstancedBufferAttribute,
} from 'three'
import {
  decodeLevel,
  loadTerrainProgressively,
  TERRAIN_HEADER,
} from '../../src/render/terrain/load.js'
import { createTerrainMesh, sampleLevelsForRing } from '../../src/render/terrain/mesh.js'
import { FINEST_FETCHED_LEVEL, terrainLevelUrl } from '../../src/render/content.js'
import { LOD, selectNodes } from '../../src/render/terrain/lod.js'
import { samplesAtLevel } from '../../src/sim/world/schema.js'
import { TERRAIN_DIR } from '../../tools/terrain/load.js'

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
    await loadTerrainProgressively((level) => seen.push(level), fetchImpl)
    expect(seen).toEqual([...seen].sort((a, b) => b - a))
    expect(seen[0]).toBeGreaterThan(seen[seen.length - 1]!)
  })

  it('fetches exactly the levels a fresh clone has, by the URL content.ts publishes', async () => {
    // The browser can only fetch what is committed: L0-L3 are ~178 MB and
    // live in the gitignored `content/terrain/tiles/`, so asking for them
    // 404s for everyone but the machine that ran `npm run terrain:build`.
    // Checking the committed directory on disk rather than restating
    // `FIRST_COMMITTED_LEVEL` keeps this true if the split ever moves.
    const seen: number[] = []
    const { fetchImpl, urls } = mockLevelFetch()
    await loadTerrainProgressively((level) => seen.push(level), fetchImpl)

    expect(urls).toEqual(seen.map(terrainLevelUrl))
    for (const level of seen) {
      expect(existsSync(`${TERRAIN_DIR}L${level}.bin`)).toBe(true)
    }
    const finest = Math.min(...seen)
    expect(finest).toBe(FINEST_FETCHED_LEVEL)
    expect(existsSync(`${TERRAIN_DIR}L${finest - 1}.bin`)).toBe(false)
  })

  it('treats a level that will not load as a failure, not as flat ground', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found' }) as Response)
    // Silently carrying on leaves the aeroplane over an empty sea that looks
    // exactly like the game working -- spec §9's "fail loudly" case.
    await expect(
      loadTerrainProgressively(() => {}, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/404/)
  })
})

describe('terrain mesh', () => {
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
    const mesh = createTerrainMesh(TERRAIN_HEADER)
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
    const mesh = createTerrainMesh(TERRAIN_HEADER)
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
    const mesh = createTerrainMesh(TERRAIN_HEADER)
    for (const child of mesh.object.children) {
      expect(child.frustumCulled).toBe(false)
    }
  })

  it('winds its triangles to face up, so the ground is not inside out', () => {
    // Backface culling is on (FrontSide is three's default), and a grid wound
    // the other way renders nothing at all from an aeroplane. Nothing else in
    // this task can see that headless.
    const mesh = createTerrainMesh(TERRAIN_HEADER)
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
    const mesh = createTerrainMesh(TERRAIN_HEADER)
    const level = TERRAIN_HEADER.levels - 1
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
    const mesh = createTerrainMesh(TERRAIN_HEADER)
    expect(() => mesh.setLevel(12, new Int16Array(4))).toThrow(/samples/i)
  })

  it('reads the finest level it has for any ring finer than that level', () => {
    // Rings 0-3 want mips 0-3, which no clone has (see the fetch test above).
    // Clamping BOTH taps to the finest level held makes the morph blend a
    // no-op there rather than blending the ground under the aeroplane toward
    // a coarser level than the one it could have had.
    const coarsest = TERRAIN_HEADER.levels - 1
    expect(sampleLevelsForRing(0, FINEST_FETCHED_LEVEL, coarsest)).toEqual({
      fine: FINEST_FETCHED_LEVEL,
      coarse: FINEST_FETCHED_LEVEL,
    })
    expect(sampleLevelsForRing(5, FINEST_FETCHED_LEVEL, coarsest)).toEqual({ fine: 5, coarse: 6 })
    // The coarsest ring has no coarser level to morph toward.
    expect(sampleLevelsForRing(coarsest, FINEST_FETCHED_LEVEL, coarsest)).toEqual({
      fine: coarsest,
      coarse: coarsest,
    })
    // Every ring the selector can return must land on a level that exists.
    for (let ring = 0; ring < LOD.rings; ring++) {
      const { fine, coarse } = sampleLevelsForRing(ring, FINEST_FETCHED_LEVEL, coarsest)
      expect(fine).toBeGreaterThanOrEqual(FINEST_FETCHED_LEVEL)
      expect(coarse).toBeLessThanOrEqual(coarsest)
    }
  })
})
