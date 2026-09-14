import { existsSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { selectNodes, LOD, type LodNode } from '../../src/render/terrain/lod.js'
import { loadTerrainHeader, loadTerrainLevel, terrainLevelPath } from '../../tools/terrain/load.js'
import { createTerrainField, heightAt, type TerrainField } from '../../src/sim/world/terrain.js'

const area = (n: { sizeM: number }) => n.sizeM * n.sizeM

describe('CDLOD node selection', () => {
  it('always draws the ground under the camera at the finest ring', () => {
    // This is the guard that makes "what you hit is what you see" true near
    // the aeroplane. A test comparing L0 with L0 would pass while proving
    // nothing (design S6); this one fails the moment selection coarsens
    // underfoot.
    // Typed as tuples, not `number[][]`: with `noUncheckedIndexedAccess` a
    // plain array literal destructure leaves `x`/`z` as `number | undefined`
    // (test-helper mechanics, Ruling 3 -- the assertions below are unchanged).
    const positions: ReadonlyArray<readonly [number, number]> = [
      [0, 0],
      [1, 1],
      [781, -781],
      [50e3, -37e3],
      [-99e3, 99e3],
      [99.9e3, 0],
    ]
    for (const [x, z] of positions) {
      const under = selectNodes(x, z).filter(
        (n) => Math.abs(n.centreX - x) <= n.sizeM / 2 && Math.abs(n.centreZ - z) <= n.sizeM / 2,
      )
      expect(under.length, `at ${x},${z}`).toBeGreaterThan(0)
      expect(Math.min(...under.map((n) => n.ring)), `at ${x},${z}`).toBe(0)
    }
  })

  it('covers the world exactly once, with no gap and no overlap', () => {
    // A gap is a hole you can see the sky through; an overlap is z-fighting.
    // Summed area is the cheap way to catch both at once, and it catches the
    // quadtree bugs that a spot check walks straight past.
    const nodes = selectNodes(12e3, -7e3)

    // Rasterised occupancy check, up front: summed area can, in principle,
    // be satisfied by a wrong tree with compensating errors -- a hole here
    // and an equal-area overlap there -- so it is not proof by itself
    // (design's own review-gates note). This instead asks, at 441 points
    // spanning the world, "does exactly one selected node contain this
    // point?", which a hole (zero owners) or an overlap (two or more) both
    // fail directly, with no way for the errors to cancel (Ruling: LOD
    // review, coordinator dispatch).
    const half = LOD.halfExtentM
    const SAMPLES_PER_AXIS = 21 // 441 points total, "a few hundred"
    // Half-open per axis (lower inclusive, upper exclusive) so every point
    // belongs to exactly one node under a correct dyadic partition, with no
    // need to dodge exact shared-boundary coordinates -- except the world's
    // own outer edge, which is nobody's "lower" bound, so it gets `<=`.
    const contains = (n: { centreX: number; centreZ: number; sizeM: number }, x: number, z: number): boolean => {
      const r = n.sizeM / 2
      // The `<=` fallback only fires for the node whose OWN edge is the
      // world boundary (`c + r === half`) -- not for every node whenever
      // the sample happens to equal `half` in magnitude, which would wrongly
      // let every node in a node's own row/column claim the far sample too
      // (caught by this test itself: an earlier, unconditional `v === half`
      // gave the corner (-100000, 100000) four owners instead of one).
      const inAxis = (v: number, c: number): boolean => v >= c - r && (v < c + r || (v === half && c + r === half))
      return inAxis(x, n.centreX) && inAxis(z, n.centreZ)
    }
    for (let ix = 0; ix < SAMPLES_PER_AXIS; ix++) {
      for (let iz = 0; iz < SAMPLES_PER_AXIS; iz++) {
        const x = -half + (ix / (SAMPLES_PER_AXIS - 1)) * 2 * half
        const z = -half + (iz / (SAMPLES_PER_AXIS - 1)) * 2 * half
        const owners = nodes.filter((n) => contains(n, x, z)).length
        expect(owners, `at ${x},${z}`).toBe(1)
      }
    }

    const total = nodes.reduce((a, n) => a + area(n), 0)
    const world = (2 * LOD.halfExtentM) ** 2
    // Relative, not `toBeCloseTo`: that helper's tolerance is ABSOLUTE, so at
    // an area of 4e10 it would demand agreement to half a square metre and
    // fail on floating-point summation alone.
    expect(Math.abs(total / world - 1)).toBeLessThan(1e-9)
  })

  it('coarsens with distance, at a pinned threshold', () => {
    const nodes = selectNodes(0, 0)
    const ringAt = (d: number) =>
      Math.min(...nodes.filter((n) => Math.hypot(n.centreX - d, n.centreZ) <= n.sizeM).map((n) => n.ring))
    expect(ringAt(500)).toBe(0)
    expect(ringAt(LOD.finestRangeM * 3)).toBeGreaterThan(0)
  })

  it('keeps neighbouring nodes within one ring of each other', () => {
    // More than one ring apart at a shared edge is a crack the size of the
    // level difference. CDLOD's morph only closes a single-level seam.
    const nodes = selectNodes(31e3, 4e3)
    for (const a of nodes) {
      for (const b of nodes) {
        const touching =
          Math.abs(a.centreX - b.centreX) <= (a.sizeM + b.sizeM) / 2 + 1 &&
          Math.abs(a.centreZ - b.centreZ) <= (a.sizeM + b.sizeM) / 2 + 1
        if (touching) expect(Math.abs(a.ring - b.ring)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('stays inside a triangle budget from every camera position on a sweep', () => {
    for (let x = -100e3; x <= 100e3; x += 12.5e3) {
      for (let z = -100e3; z <= 100e3; z += 12.5e3) {
        const n = selectNodes(x, z).length
        expect(n, `at ${x},${z}`).toBeLessThan(400) // 400 * 64*64*2 tris
        expect(n, `at ${x},${z}`).toBeGreaterThan(0)
      }
    }
  })

  it('gives every node a morph factor in range', () => {
    for (const n of selectNodes(3e3, 3e3)) {
      expect(n.morph).toBeGreaterThanOrEqual(0)
      expect(n.morph).toBeLessThanOrEqual(1)
    }
  })
})

// Mip 0 (the finest, 8193-sample level) lives in the gitignored
// `content/terrain/tiles/` -- see `tools/terrain/load.ts`'s
// FIRST_COMMITTED_LEVEL -- so a fresh clone (and CI) has no L0.bin. Skip
// named, not vanished, matching tests/tools/terrainBuild.test.ts's own
// `describe.skipIf(!haveSource)` pattern for exactly the same reason: a
// silently-vanished check is indistinguishable from one that ran and passed.
const haveFinestMip = existsSync(terrainLevelPath(0))
if (!haveFinestMip) {
  console.warn(
    `[terrainLod.test.ts] ${terrainLevelPath(0)} is absent -- the far-field height-error ` +
    'measurement is SKIPPED. Run `npx tsx tools/terrain/fetch.ts && npm run terrain:build` to enable it.',
  )
}

describe.skipIf(!haveFinestMip)('far-field height error, by ring', () => {
  it('matches the pinned worst-case error against mip 0, measured 2026-09-14', () => {
    // Design spec §6 asks "how wrong is the far field" to have a number in
    // the repo, not just a plausibility argument. This measures it directly:
    // for a camera near a corner (so every ring from 0 up to the coarsest
    // this bounded world reaches is actually selected somewhere), take every
    // node `selectNodes` actually returned at each ring, sample mip 0 and
    // that ring's own mip at every one of its `quadsPerNode + 1` grid
    // vertices (the resolution Task 10 will actually draw), and record the
    // worst absolute difference. Ring 0 is mip 0 itself, so its error is
    // zero by construction and is not pinned.
    const header = loadTerrainHeader()
    const mip0 = createTerrainField(header, 0, loadTerrainLevel(0, header))
    const fieldByRing = new Map<number, TerrainField>()
    const fieldForRing = (ring: number): TerrainField => {
      let field = fieldByRing.get(ring)
      if (!field) {
        field = createTerrainField(header, ring, loadTerrainLevel(ring, header))
        fieldByRing.set(ring, field)
      }
      return field
    }

    const nodesByRing = new Map<number, LodNode[]>()
    for (const node of selectNodes(99e3, -99e3)) {
      const list = nodesByRing.get(node.ring)
      if (list) list.push(node)
      else nodesByRing.set(node.ring, [node])
    }

    const q = LOD.quadsPerNode
    const worstByRing: Record<number, number> = {}
    for (const [ring, nodes] of nodesByRing) {
      if (ring === 0) continue
      const field = fieldForRing(ring)
      let worst = 0
      for (const node of nodes) {
        for (let i = 0; i <= q; i++) {
          for (let j = 0; j <= q; j++) {
            const x = node.centreX - node.sizeM / 2 + (i / q) * node.sizeM
            const z = node.centreZ - node.sizeM / 2 + (j / q) * node.sizeM
            const diff = Math.abs(heightAt(mip0, x, z) - heightAt(field, x, z))
            if (diff > worst) worst = diff
          }
        }
      }
      worstByRing[ring] = worst
    }

    // Measured 2026-09-14 by running the computation above once and
    // recording its output. Camera (99000, -99000) is not arbitrary: that
    // corner puts real Leyte relief (not open ocean) under every coarse
    // ring, so these are the pipeline's actual worst case, not a flat-sea
    // zero -- an earlier choice of corner gave zero error for rings 1-3
    // because that quadrant of the map is open water at those rings. Values
    // are exact multiples of 0.1 m because the on-disk encoding is int16
    // decimetres (`schema.ts`'s `encoding`).
    const PINNED_WORST_ERROR_M: Readonly<Record<number, number>> = {
      1: 4.6,
      2: 21.4,
      3: 47.7,
      4: 80.2,
      5: 221.7,
    }
    const numericAscending = (a: number, b: number) => a - b
    expect(Object.keys(worstByRing).map(Number).sort(numericAscending)).toEqual(
      Object.keys(PINNED_WORST_ERROR_M).map(Number).sort(numericAscending),
    )
    for (const [ring, pinned] of Object.entries(PINNED_WORST_ERROR_M)) {
      expect(worstByRing[Number(ring)], `ring ${ring}`).toBeCloseTo(pinned, 1)
    }
  })
})
