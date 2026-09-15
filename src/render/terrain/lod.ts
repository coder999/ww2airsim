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
 * `finestRangeM` is the distance at which ring 0 gives way to ring 1: `2 *
 * nodeSize`, the standard CDLOD ratio, which is also what keeps `rangeAtRing`
 * doubling in step with `nodeSizeAtRing` doubling -- the property the
 * "neighbouring nodes within one ring" test depends on.
 *
 * **No longer provisional. Measured 2026-09-14** on the reference GPU (RX
 * 6700 XT, Chromium 153, Dawn/D3D12) at 2560x1440, 3,000 m over Leyte, as
 * WebGPU timestamp-query durations over a 5-second window
 * (`tests/e2e/terrain.spec.ts`; the instrument and the platform are described
 * in design spec section 10, which is the committed home for them --
 * `.gitignore` ignores `.superpowers/`, so Task 11's report and its raw
 * per-run tables are NOT in a fresh clone and this comment does not send
 * anyone there). The multiplier here is the only thing that changed between
 * rows:
 *
 *   finestRangeM        selected nodes   vertices   GPU p50   GPU p95
 *   0.5x =    781.25 m             121      0.51 M    1.442*    2.032*
 *   1x   =  1,562.5  m             127      0.54 M    2.032     2.228
 *   2x   =  3,125    m (this)      151      0.64 M    2.097     2.359
 *   4x   =  6,250    m             316      1.34 M    2.949     3.211
 *
 *   (* 0.5x is below the CDLOD ratio and reported a bimodal, under-sampled
 *   distribution -- 356 samples where the others gave ~515, with a floor at
 *   0.393 ms. It is quoted as a bracket, not as a candidate; whatever it is
 *   doing was not chased, because nothing here wants to go below 1x.)
 *
 * Node counts and vertices are `selectNodes` at the same camera, computed in
 * Node; the GPU column is the same camera on the reference platform.
 *
 * **What the measurement says, and it is not "go finer".** Between 1x and 2x
 * the whole GPU frame moves by 0.065 ms -- exactly one step of the timestamp
 * query's 65.54 us quantisation, i.e. at the floor of what the instrument can
 * resolve. Against the platform's 10.0 ms requestAnimationFrame cadence that
 * is 0.7%. (Cadence, not refresh rate: the monitor runs at 120 Hz and the
 * 10.0 ms comes from Chromium itself -- design spec section 10.2.) Frame
 * time therefore does not choose between 1x and 2x, and 2x is kept because it
 * is the ratio the rest of this file's geometry is written for and it puts
 * the ring-0 -> ring-1 transition further from the eye, where a transition is
 * smaller in screen space.
 *
 * 4x is the first setting frame time has an opinion about (+0.85 ms, 40% of
 * the frame) and it is rejected on both counts: it costs real time AND buys
 * no detail, because rings 0-3 all clamp both mip taps to L4 (`content.ts`'s
 * `FINEST_FETCHED_LEVEL`; L0-L3 are 178,319,368 bytes and are not shipped).
 * A ring-0
 * patch already tessellates at 24.4 m against L4's 390 m sample spacing --
 * sixteen times finer than the data can express -- so widening ring 0 adds
 * triangles to a surface that is already the bilinear interpolant of samples
 * it has all of.
 *
 * That last fact is also the honest caveat on this whole constant: it is
 * being tuned against the pyramid a browser can actually fetch. If L0-L3 ever
 * ship (or move to R2 -- design spec section 9 item 2), the "buys no detail"
 * half of the argument stops holding and this wants re-measuring. The
 * frame-time half would not change.
 */
const FINEST_RANGE_M = 2 * FINEST_NODE_SIZE_M

export const LOD: LodParams = {
  halfExtentM: HEADER.halfExtentM,
  rings: RINGS,
  quadsPerNode: 64,
  finestRangeM: FINEST_RANGE_M,
  // Exactly the value given by the Task 9 brief's own LodParams interface
  // comment ("drawDistanceM: number // 100000"), not derived from anything.
  // Its numeric equality with HEADER.halfExtentM below is COINCIDENTAL, not
  // a relationship -- halfExtentM is the resampled world's half-extent
  // (tools/terrain/resample.ts's GRID.halfExtentM), drawDistanceM is a
  // camera far-plane/fog distance the brief specified directly, and nothing
  // ties the two together (review 2026-09-14, finding I3).
  //
  // Flagging for Task 10, which is the first task that will actually use
  // this number: the world's diagonal is up to 2 * halfExtentM * sqrt(2) =
  // ~283 km, so a 100 km draw distance WILL clip terrain that `selectNodes`
  // legitimately returns for a camera near one corner looking toward the
  // opposite one. Node selection itself does not cull on this value (see
  // the LodParams doc comment above) -- Task 10 has to decide whether to
  // raise it, fog the gap, or accept the clip.
  drawDistanceM: 100_000,
}

/**
 * The coarsest pyramid level any LOD ring can ever sample.
 *
 * `ring k samples mip k` (mesh.ts's `sampleLevelsForRing`), and the coarsest
 * ring is `LOD.rings - 1`, which morphs toward mip `LOD.rings`. A pyramid can
 * (and does -- `tools/terrain/mips.ts` builds down to 3x3) have more levels
 * than that: nothing above `LOD.rings` can ever be drawn, so it is also the
 * coarsest level worth asking the network for, and the coarsest level the
 * mesh should reserve a texture for.
 *
 * This is the single definition: `load.ts`'s fetch loop and
 * `createTerrainMesh`'s texture allocation both call it instead of each
 * re-deriving `Math.min(LOD.rings, pyramidLevels - 1)` -- before review round
 * 2 they did, independently, and nothing would have caught the two moving
 * apart if `LOD.rings` or the pyramid depth ever changed.
 * `tests/render/terrainLoad.test.ts` asserts the set of levels `load.ts`
 * fetches equals the set the rings sample, which is this function's contract
 * from the outside.
 *
 * Takes the pyramid's level count rather than a header or `TerrainHeader`
 * object: `load.ts` closes over the one committed `TERRAIN_HEADER`, while
 * `createTerrainMesh` is handed whatever header its caller passes, and the
 * level count is the only field either side needs -- forcing them onto one
 * concrete header shape would couple two things that don't need to agree
 * about anything else.
 */
export function coarsestFetchedLevel(pyramidLevels: number): number {
  return Math.min(LOD.rings, pyramidLevels - 1)
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
    // Clamped, and this is the ROUTINE case, not a rare edge case: whenever
    // a parent subdivides, it does so because ITS CLOSEST child is within
    // range, but the other three children can easily be much farther from
    // the camera than their own [lower, upper) band expects -- and a
    // forced-balance split does the same. Measured 2026-09-14 at camera
    // (3000, 3000): 73 of 148 returned nodes have morph clamped to exactly
    // 1, and only 74 have a distance genuinely inside their own band.
    // Task 10 blends geometry toward the next coarser ring using `morph`;
    // it needs to know "fully morphed" is the common case near any tree
    // boundary, not the exception.
    const morph = Math.min(1, Math.max(0, (distance - lower) / (upper - lower)))
    return { centreX: cell.centreX, centreZ: cell.centreZ, sizeM: cell.sizeM, ring: cell.ring, morph }
  })
}
