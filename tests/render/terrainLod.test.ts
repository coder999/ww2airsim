import { existsSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { selectNodes, LOD, type LodNode } from '../../src/render/terrain/lod.js'
import { FIRST_COMMITTED_LEVEL, loadTerrainHeader, loadTerrainLevel, terrainLevelPath } from '../../tools/terrain/load.js'
import { createTerrainField, heightAt, type TerrainField } from '../../src/sim/world/terrain.js'
import { samplesAtLevel, type TerrainHeader } from '../../src/sim/world/schema.js'

const area = (n: { sizeM: number }) => n.sizeM * n.sizeM

/**
 * Worst absolute height difference between `referenceLevel`'s mip and the
 * mip actually selected, by ring, for a camera at `(cameraX, cameraZ)` --
 * design spec §6's "how wrong is the far field" as a number. Sampled at
 * every one of a node's `quadsPerNode + 1` grid vertices (the resolution
 * Task 10 will actually draw), taking the worst over every node
 * `selectNodes` returned at that ring. Rings below `referenceLevel` are
 * skipped entirely -- not just `referenceLevel` itself (trivially zero) --
 * because the caller may only have committed levels on disk (see the
 * CI-runnable L4-referenced table below, which cannot load rings 0-3 at
 * all).
 */
function worstErrorByRing(
  header: TerrainHeader,
  referenceLevel: number,
  cameraX: number,
  cameraZ: number,
): Record<number, number> {
  const reference = createTerrainField(header, referenceLevel, loadTerrainLevel(referenceLevel, header))
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
  for (const node of selectNodes(cameraX, cameraZ)) {
    const list = nodesByRing.get(node.ring)
    if (list) list.push(node)
    else nodesByRing.set(node.ring, [node])
  }

  const q = LOD.quadsPerNode
  const worstByRing: Record<number, number> = {}
  for (const [ring, nodes] of nodesByRing) {
    if (ring <= referenceLevel) continue
    const field = fieldForRing(ring)
    let worst = 0
    for (const node of nodes) {
      for (let i = 0; i <= q; i++) {
        for (let j = 0; j <= q; j++) {
          const x = node.centreX - node.sizeM / 2 + (i / q) * node.sizeM
          const z = node.centreZ - node.sizeM / 2 + (j / q) * node.sizeM
          const diff = Math.abs(heightAt(reference, x, z) - heightAt(field, x, z))
          if (diff > worst) worst = diff
        }
      }
    }
    worstByRing[ring] = worst
  }
  return worstByRing
}

const numericAscending = (a: number, b: number) => a - b

/** Asserts `actual`'s ring set and values match `pinned` exactly (to one
 *  decimal place, matching the int16-decimetres on-disk encoding). */
function expectPinnedTable(actual: Record<number, number>, pinned: Readonly<Record<number, number>>): void {
  expect(Object.keys(actual).map(Number).sort(numericAscending)).toEqual(
    Object.keys(pinned).map(Number).sort(numericAscending),
  )
  for (const [ring, value] of Object.entries(pinned)) {
    expect(actual[Number(ring)], `ring ${ring}`).toBeCloseTo(value, 1)
  }
}

describe('CDLOD node selection', () => {
  it('always draws the ground under the camera at the finest ring', () => {
    // This is the guard that makes "what you hit is what you see" true near
    // the airplane. A test comparing L0 with L0 would pass while proving
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
    // (design's own review-gates note). This instead asks, at tens of
    // thousands of points spanning the world, "does exactly one selected
    // node contain this point?", which a hole (zero owners) or an overlap
    // (two or more) both fail directly, with no way for the errors to
    // cancel (Ruling: LOD review, coordinator dispatch).
    //
    // I2 (review 2026-09-14): an earlier 21x21 = 441-point grid (10 km
    // spacing) landed inside only 1 of the 32 ring-0 leaves (1,562.5 m
    // each) and 3 of the 24 ring-1 leaves at this camera -- the fine half
    // of the tree, which is exactly where a compensating hole-plus-overlap
    // is most plausible, was effectively untested. 201x201 = 40,401 points
    // is a 1 km pitch against 1,562.5 m ring-0 leaves, i.e. ~2.4 samples per
    // leaf on average (an earlier version of this comment claimed "dozens
    // per leaf", which overstated it by roughly an order of magnitude --
    // corrected 2026-09-14, round 2). ~2.4 is not a generous margin by
    // itself, but it is enough: a dropped ring-0 child is invisible to the
    // occupancy loop at 21x21 (caught only by the summed-area assertion
    // below) and fails the occupancy loop directly at 201x201, at
    // (8000, -7000) -- see the fix report's I2 mutation proof. Still well
    // under a second (measured 2026-09-14: ~0.2 s against the ~145 leaves
    // this camera selects).
    const half = LOD.halfExtentM
    const SAMPLES_PER_AXIS = 201 // 40,401 points total
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
    const ringAt = (d: number): number => {
      const matching = nodes.filter((n) => Math.hypot(n.centreX - d, n.centreZ) <= n.sizeM)
      // Without this, `Math.min(...[])` is `Infinity` and
      // `expect(Infinity).toBeGreaterThan(0)` below passes vacuously --
      // closing that permanently rather than relying on today's two
      // assertions to jointly happen to catch every possible mutation (M4).
      expect(matching.length, `no node found near d=${d}`).toBeGreaterThan(0)
      return Math.min(...matching.map((n) => n.ring))
    }
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

  it('stays inside a triangle budget from every camera position on a sweep, staying balanced there too', () => {
    // The ring-difference check is folded in here (M5) rather than left
    // only at the single camera (31e3, 4e3) below that found the original
    // balance bug: this sweep already visits 289 positions for the budget
    // check, so re-using it for balance is near-zero extra cost and much
    // broader cover than one fixed point.
    for (let x = -100e3; x <= 100e3; x += 12.5e3) {
      for (let z = -100e3; z <= 100e3; z += 12.5e3) {
        const nodes = selectNodes(x, z)
        expect(nodes.length, `at ${x},${z}`).toBeLessThan(400) // 400 * 64*64*2 tris
        expect(nodes.length, `at ${x},${z}`).toBeGreaterThan(0)
        for (const a of nodes) {
          for (const b of nodes) {
            const touching =
              Math.abs(a.centreX - b.centreX) <= (a.sizeM + b.sizeM) / 2 + 1 &&
              Math.abs(a.centreZ - b.centreZ) <= (a.sizeM + b.sizeM) / 2 + 1
            if (touching) expect(Math.abs(a.ring - b.ring), `at ${x},${z}`).toBeLessThanOrEqual(1)
          }
        }
      }
    }
  })

  it('gives every node a morph factor in range', () => {
    for (const n of selectNodes(3e3, 3e3)) {
      expect(n.morph).toBeGreaterThanOrEqual(0)
      expect(n.morph).toBeLessThanOrEqual(1)
    }
  })

  it('computes a specific, non-clamped morph value, and is monotonic with distance', () => {
    // I1 (review 2026-09-14): the range check above is structurally true of
    // ANY expression clamped to [0, 1] -- replacing `morph` outright with a
    // constant 0 or 1 still passes it, so it catches nothing but NaN. This
    // test instead engineers an exact scenario and checks a computed value.
    //
    // A tiny two-ring world (root = ring 1, four ring-0 leaves, no deeper
    // recursion possible) makes every leaf's own footprint and distance
    // hand-computable, rather than depending on where the real 8-ring tree
    // happens to put a boundary.
    const params = { halfExtentM: 1000, rings: 2, quadsPerNode: 1, finestRangeM: 100, drawDistanceM: 1000 }
    // Camera sits inside the SE quadrant (x >= 0, z <= 0), 10 m east of the
    // vertical midline and 50 m south of the horizontal one.
    const nodes = selectNodes(10, -50, params)
    expect(nodes).toHaveLength(4) // root always subdivides once; ring 0 cannot subdivide further

    const byQuadrant = (cx: number, cz: number): LodNode => {
      const found = nodes.find((n) => n.centreX === cx && n.centreZ === cz)
      if (!found) throw new Error(`no node at quadrant (${cx}, ${cz})`)
      return found
    }

    // SE (500, -500): contains the camera, closest-point distance 0.
    expect(byQuadrant(500, -500).morph).toBe(0)
    // SW (-500, -500): closest point is (0, -50) -- 10 m west of camera,
    // same z. distance = 10, band is [0, 100), so morph = 10 / 100 = 0.1
    // exactly.
    expect(byQuadrant(-500, -500).morph).toBeCloseTo(0.1, 9)
    // NE (500, 500): closest point is (10, 0) -- same x as camera, 50 m
    // north. distance = 50, exactly the midpoint of [0, 100), so morph
    // must be 0.5 -- the "midpoint of its band" case the review asked for.
    expect(byQuadrant(500, 500).morph).toBeCloseTo(0.5, 9)
    // NW (-500, 500): closest point is (0, 0) -- 10 m west, 50 m north of
    // camera. distance = hypot(10, 50) ~= 50.99, just past the NE value.
    const expectedNW = Math.hypot(10, 50) / 100
    expect(byQuadrant(-500, 500).morph).toBeCloseTo(expectedNW, 9)

    // Monotonic in distance, strictly, across all four (all ring 0, so this
    // is a same-ring comparison, not an artefact of ring boundaries): SE
    // (0) < SW (0.1) < NE (0.5) < NW (~0.51). Replacing the morph formula
    // with any constant, or with a formula that ignores distance, collapses
    // this to non-strict and fails.
    const inDistanceOrder = [
      byQuadrant(500, -500).morph,
      byQuadrant(-500, -500).morph,
      byQuadrant(500, 500).morph,
      byQuadrant(-500, 500).morph,
    ]
    for (let i = 1; i < inDistanceOrder.length; i++) {
      expect(inDistanceOrder[i]!, `index ${i}`).toBeGreaterThan(inDistanceOrder[i - 1]!)
    }
  })
})

// M8 (review 2026-09-14): both pinned tables below depend on `finestRangeM`
// (lod.ts) -- retuning it moves ring boundaries, which moves which mip lands
// under which distance, which moves every pinned number below. If either
// table goes red, check whether `finestRangeM` or the committed pyramid
// changed before treating it as a regression: it may just need re-measuring
// and re-pinning.
//
// This said "PROVISIONAL pending Task 11" until the final review on
// 2026-09-14. Task 11 measured it and `lod.ts` has read "No longer
// provisional" since -- a comment about another file that had moved, which is
// this repository's named worst failure mode. The dependency itself is real
// and unchanged; only the word was stale.

// Mip 0 (the finest, 8193-sample level) lives in the gitignored
// `content/terrain/tiles/` -- see `tools/terrain/load.ts`'s
// FIRST_COMMITTED_LEVEL -- so a fresh clone (and CI) has no L0.bin. Skip
// named, not vanished, matching tests/tools/terrainBuild.test.ts's own
// `describe.skipIf(!haveSource)` pattern for exactly the same reason: a
// silently-vanished check is indistinguishable from one that ran and passed.
const haveFinestMip = existsSync(terrainLevelPath(0))
if (!haveFinestMip) {
  console.warn(
    `[terrainLod.test.ts] ${terrainLevelPath(0)} is absent -- the mip-0-referenced far-field ` +
    'height-error measurement is SKIPPED (the L4-referenced twin below still runs everywhere). ' +
    'Run `npx tsx tools/terrain/fetch.ts && npm run terrain:build` to enable it.',
  )
}

describe.skipIf(!haveFinestMip)('far-field height error against mip 0, by ring', () => {
  it('matches the pinned worst-case error against mip 0, measured 2026-09-14', () => {
    // Design spec §6 asks "how wrong is the far field" to have a number in
    // the repo, not just a plausibility argument. Camera (99000, 99000) is
    // not arbitrary: that corner puts real Leyte relief (not open ocean)
    // under every coarse ring, so these are the pipeline's actual worst
    // case, not a flat-sea zero -- an earlier choice of corner gave zero
    // error for rings 1-3 because that quadrant of the map is open water at
    // those rings. Values are exact multiples of 0.1 m because the on-disk
    // encoding is int16 decimetres (`schema.ts`'s `encoding`).
    const header = loadTerrainHeader()
    const worstByRing = worstErrorByRing(header, 0, 99e3, 99e3)
    expectPinnedTable(worstByRing, {
      1: 4.6,
      2: 21.4,
      3: 47.7,
      4: 80.2,
      5: 221.7,
    })
  })

  it('pins the worst |L0 - L4| error over the whole surface, measured 2026-09-14', () => {
    // The table above is about LOD SELECTION -- how much coarser the far field
    // is than the near field. This is the error both of them share: L4 is the
    // finest level a clone has, the renderer clamps rings 0-3 to it and the
    // physics is handed it, so a fresh clone flies a Leyte that is this much
    // flatter than the Copernicus data EVERYWHERE, near field included.
    //
    // Recorded in the design spec (section 6) and in the handoff as the number
    // behind "does the relief want a vertical exaggeration?", and pinned here
    // rather than left as prose because it is the premise that argument rests
    // on. It was previously called unpinnable "because it needs L0, which CI
    // lacks" -- which this block already answers: it is the same
    // `skipIf(!haveFinestMip)` gate the mip-0 table above runs under.
    //
    // Every one of L0's 8193^2 samples against `heightAt` on the L4 field, not
    // a subsample: the worst cell is a single ridge top and a stride would
    // step over it.
    const header = loadTerrainHeader()
    const l0 = loadTerrainLevel(0, header)
    const l4 = createTerrainField(header, FIRST_COMMITTED_LEVEL, loadTerrainLevel(FIRST_COMMITTED_LEVEL, header))
    const n = samplesAtLevel(header, 0)
    const half = header.halfExtentM
    const step = (2 * half) / (n - 1)
    let worst = 0
    let worstX = 0
    let worstZ = 0
    for (let row = 0; row < n; row++) {
      const z = -half + row * step
      for (let col = 0; col < n; col++) {
        const x = -half + col * step
        // Decimetres on disk (schema.ts's `encoding`), metres everywhere else.
        const diff = Math.abs(l0[row * n + col]! / 10 - heightAt(l4, x, z))
        if (diff > worst) {
          worst = diff
          worstX = x
          worstZ = z
        }
      }
    }
    expect(worst).toBeCloseTo(220.862, 3)
    // WHERE, not just how much: a measurement that moved to a different peak
    // is a different claim even if the magnitude happened to survive.
    expect([Math.round(worstX), Math.round(worstZ)]).toEqual([-78027, -80664])
  })
})

// Controller ruling (review 2026-09-14): the mip-0-referenced table above
// never runs in CI or in a fresh clone (mip 0 is gitignored), so it cannot
// be the plan's only far-field guard -- "a guard that only executes on a box
// that has run the 178 MB build is not a guard." This twin uses L4, the
// finest COMMITTED level, as its reference instead: same measurement, worse
// reference (so smaller, less dramatic numbers than the mip-0 table above --
// that is expected, not a discrepancy), but it runs everywhere. It only
// measures rings 5 and up (`worstErrorByRing` skips anything <= the
// reference level), because rings 0-3 need mips that are not on disk here.
describe('far-field height error against mip 4, by ring (runs everywhere)', () => {
  it('matches the pinned worst-case error against mip 4, measured 2026-09-14', () => {
    // Camera at the exact world corner (100000, 100000): the opposite
    // corner from it is far enough to stay at ring 6, which a moderate
    // corner like (99000, 99000) above does not reach, giving two rings of
    // data instead of one.
    const header = loadTerrainHeader()
    const worstByRing = worstErrorByRing(header, FIRST_COMMITTED_LEVEL, 100e3, 100e3)
    expectPinnedTable(worstByRing, {
      5: 94.7,
      6: 205.4,
    })
  })
})
