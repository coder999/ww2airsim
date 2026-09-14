import header from '../../../content/terrain/header.json' with { type: 'json' }
import { parseTerrainHeader } from '../../sim/world/schema.js'

/**
 * One selected patch of terrain: a square footprint, the pyramid mip it
 * should be drawn from, and a blend factor toward the next coarser mip.
 *
 * `ring` is deliberately the same number as the terrain mip level (`ring: 0`
 * samples `content/terrain/L0.bin`, `ring: 1` samples `L1.bin`, and so on) --
 * `src/sim/world/schema.ts`'s pyramid and this quadtree are two different
 * subdivisions of the same world, and giving their levels the same number is
 * what lets Task 10's mesh builder pick a texture without a lookup table.
 */
export type LodNode = {
  readonly centreX: number
  readonly centreZ: number
  readonly sizeM: number // edge length
  readonly ring: number // 0 = finest, samples mip 0
  readonly morph: number // 0..1, blend toward the next coarser ring
}

/**
 * `quadsPerNode` and `drawDistanceM` are carried here for Task 10's mesh
 * builder (tessellation density and camera far plane / fog range
 * respectively) rather than used by `selectNodes` below, which only needs
 * `halfExtentM`, `rings` and `finestRangeM` to pick node footprints and
 * rings. In particular `drawDistanceM` does NOT cull far nodes here: this
 * world is bounded (not an infinite tiled terrain), so `selectNodes` must
 * still cover every point out to `halfExtentM` regardless of camera
 * position -- that is what "covers the world exactly once" asserts.
 */
export type LodParams = {
  readonly halfExtentM: number
  readonly rings: number // 8
  readonly quadsPerNode: number // 64
  readonly finestRangeM: number // where ring 0 gives way to ring 1
  readonly drawDistanceM: number // 100000
}

/**
 * `halfExtentM` is read from the committed `content/terrain/header.json`
 * (via `parseTerrainHeader`, the same validator the sim and the terrain
 * tooling use) rather than restated as a literal here. `header.json` is the
 * one producer of that number -- it comes from `GRID.halfExtentM` in
 * `tools/terrain/resample.ts`, which is what built the committed grid -- and
 * a second `100000` in this file would be a second source of truth for the
 * same fact, with nothing to stop the two disagreeing (Ruling: LOD review).
 */
const HEADER = parseTerrainHeader(header)

const RINGS = 8

/**
 * Edge length of a ring-0 (finest) quadtree node: the world, halved
 * (`rings - 1`) times from the single root node down to the finest ring.
 * `2 * HEADER.halfExtentM / 2**(RINGS - 1)` = 200,000 / 128 = 1,562.5 m,
 * which -- not by coincidence -- is also `64 * (200,000 / 8,192)`, i.e.
 * `quadsPerNode` finest-mip cells: the quadtree's finest ring and the
 * pyramid's finest mip are the same resolution.
 */
const FINEST_NODE_SIZE_M = (2 * HEADER.halfExtentM) / 2 ** (RINGS - 1)

/**
 * `finestRangeM` is the distance at which ring 0 gives way to ring 1. Set to
 * `2 * nodeSize` (the standard CDLOD ratio, which is also what keeps
 * `rangeAtRing` doubling in step with `nodeSizeAtRing` doubling -- the
 * property the "neighbouring nodes within one ring" test depends on).
 *
 * This value is PROVISIONAL: nothing has yet measured actual frame time
 * against it. Task 11 can measure that; until then this is a geometrically
 * reasonable default, not a tuned one.
 */
const FINEST_RANGE_M = 2 * FINEST_NODE_SIZE_M

export const LOD: LodParams = {
  halfExtentM: HEADER.halfExtentM,
  rings: RINGS,
  quadsPerNode: 64,
  finestRangeM: FINEST_RANGE_M,
  drawDistanceM: 100_000,
}

/** Switch-distance for ring `ring`: the camera distance at or below which a
 *  ring-`ring` node subdivides into four ring-`(ring - 1)` children. Doubles
 *  with `ring` in lockstep with node size doubling with `ring`, which is
 *  what bounds a shared edge to at most one ring of difference. */
function rangeAtRing(ring: number, finestRangeM: number): number {
  return finestRangeM * 2 ** ring
}

/** Distance from `(px, pz)` to the closest point of the axis-aligned square
 *  centred at `(cx, cz)` with edge `size` -- zero if the point is inside.
 *  Using the closest point (not the centre) is what guarantees the node
 *  containing the camera always keeps subdividing down to ring 0, regardless
 *  of how large its ancestors are: the camera's own node has distance zero
 *  at every level, so it always passes every switch test. */
function closestPointDistance(px: number, pz: number, cx: number, cz: number, size: number): number {
  const half = size / 2
  const dx = Math.max(Math.abs(px - cx) - half, 0)
  const dz = Math.max(Math.abs(pz - cz) - half, 0)
  return Math.hypot(dx, dz)
}

type Cell = { readonly centreX: number; readonly centreZ: number; readonly sizeM: number; readonly ring: number }

/** The four quarter-size, one-ring-finer children of `parent`, exactly
 *  partitioning its footprint (no gap, no overlap). */
function childrenOf(parent: Cell): readonly Cell[] {
  const childSizeM = parent.sizeM / 2
  const offset = parent.sizeM / 4
  const children: Cell[] = []
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      children.push({
        centreX: parent.centreX + sx * offset,
        centreZ: parent.centreZ + sz * offset,
        sizeM: childSizeM,
        ring: parent.ring - 1,
      })
    }
  }
  return children
}

/** Whether two square footprints share so much as a corner -- deliberately
 *  8-connected (edges AND corners), because a corner-touching pair still
 *  shares an exact vertex that a >1-ring gap would leave unstitched. The
 *  1e-6 m slack absorbs floating-point noise without being large enough to
 *  call two genuinely separated cells "touching" at these node sizes
 *  (metres to tens of kilometres). */
function touches(a: Cell, b: Cell): boolean {
  const reach = (a.sizeM + b.sizeM) / 2 + 1e-6
  return Math.abs(a.centreX - b.centreX) <= reach && Math.abs(a.centreZ - b.centreZ) <= reach
}

/**
 * Select the set of terrain patches to draw for a camera at `(cameraX,
 * cameraZ)`: the standard CDLOD quadtree descent, plus 2:1 balancing.
 *
 * The descent starts at the root -- the whole world, ring `rings - 1` -- and
 * subdivides a node into four quarter-size children one ring finer whenever
 * the camera is within that finer ring's switch distance of the node.
 * Recursion bottoms out at ring 0, which is never subdivided further (there
 * is no ring -1). This alone already tiles the world exactly once (a node is
 * always replaced by either itself or by children that exactly partition its
 * own footprint), but it does NOT bound how much two touching leaves' rings
 * can differ: a leaf far from the camera can be a corner-neighbour of a leaf
 * that is close to the camera down a completely independent branch of the
 * tree, with no relationship enforced between them. Measured 2026-09-14: the
 * unbalanced descent alone produces a touching pair 2 rings apart at camera
 * (31000, 4000) -- ring 5 (50,000 m) diagonally adjacent to ring 3
 * (12,500 m).
 *
 * The balance pass below is the standard fix (2:1 restricted quadtree /
 * T-vertex elimination): repeatedly find a leaf that is more than one ring
 * coarser than a touching leaf, and force-split it into its four children.
 * This can only make leaves finer, one ring at a time, and ring 0 cannot be
 * split further, so it terminates.
 */
export function selectNodes(cameraX: number, cameraZ: number, params: LodParams = LOD): readonly LodNode[] {
  const { halfExtentM, rings, finestRangeM } = params
  const rootSizeM = 2 * halfExtentM

  function distanceTo(cell: Cell): number {
    return closestPointDistance(cameraX, cameraZ, cell.centreX, cell.centreZ, cell.sizeM)
  }

  const cells: Cell[] = []
  function descend(cell: Cell): void {
    if (cell.ring > 0 && distanceTo(cell) <= rangeAtRing(cell.ring - 1, finestRangeM)) {
      for (const child of childrenOf(cell)) descend(child)
      return
    }
    cells.push(cell)
  }
  descend({ centreX: 0, centreZ: 0, sizeM: rootSizeM, ring: rings - 1 })

  let violation = true
  while (violation) {
    violation = false
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i]!
      if (cell.ring === 0) continue
      const tooCoarse = cells.some((other) => other !== cell && other.ring <= cell.ring - 2 && touches(cell, other))
      if (tooCoarse) {
        cells.splice(i, 1, ...childrenOf(cell))
        violation = true
        break
      }
    }
  }

  return cells.map((cell) => {
    const distance = distanceTo(cell)
    const lower = cell.ring === 0 ? 0 : rangeAtRing(cell.ring - 1, finestRangeM)
    const upper = rangeAtRing(cell.ring, finestRangeM)
    // Clamped: a forced-balance split, or a node whose sibling near the
    // camera forced their shared parent to subdivide, can leave a leaf at a
    // distance far outside its own [lower, upper) band. Without the clamp
    // `morph` would exceed the 0..1 range in exactly that case.
    const morph = Math.min(1, Math.max(0, (distance - lower) / (upper - lower)))
    return { centreX: cell.centreX, centreZ: cell.centreZ, sizeM: cell.sizeM, ring: cell.ring, morph }
  })
}
