import { samplesAtLevel, type TerrainHeader } from './schema.js'

/**
 * A terrain field usable by the physics layer: one pyramid level's heights,
 * plus the geometry needed to index them.
 *
 * `src/sim/` must load in a browser and may not import Node core or
 * `tools/terrain/load.ts` (enforced by `.dependency-cruiser.cjs` and
 * `tests/architecture/boundary.test.ts`), so the samples arrive as a plain
 * value the caller already loaded -- the same injection pattern `Assist`
 * uses in `src/sim/loop.ts`, for the same reason: the physics layer must not
 * depend on how or from where its input was produced.
 */
export type TerrainField = {
  readonly header: TerrainHeader
  readonly level: number
  readonly samples: number
  readonly spacingM: number
  readonly heightsDm: Int16Array
}

/** Height below which there is no land: `heightAt` returns this for any
 *  query outside the world, so "no data" reads as open ocean rather than
 *  as a discontinuity or a NaN reaching the integrator (spec §9). */
export const SEA_LEVEL_M = 0

export function createTerrainField(header: TerrainHeader, level: number, heightsDm: Int16Array): TerrainField {
  const samples = samplesAtLevel(header, level)
  const expected = samples * samples
  // Fail loudly on a mismatched buffer rather than reading past the end (a
  // truncated/stale/wrong-level array would otherwise be silently misindexed
  // into a plausible-looking but wrong height) -- the same rationale
  // `loadTerrainLevel` documents in tools/terrain/load.ts for its own length
  // check against the header.
  if (heightsDm.length !== expected) {
    throw new Error(
      `terrain field level ${level} expects ${samples}x${samples} = ${expected} samples, got ${heightsDm.length}`,
    )
  }
  // Sample-aligned grid (mips.ts): (samples-1) cells span the full
  // 2*halfExtentM width, so spacing is that width divided by the cell count,
  // not the sample count.
  const spacingM = (2 * header.halfExtentM) / (samples - 1)
  return { header, level, samples, spacingM, heightsDm }
}

/**
 * Metres above sea level at local (x, z). Sea level outside the world.
 *
 * Bilinear over the four grid samples surrounding (x, z). The grid is
 * row-major, row 0 = NORTH edge (z = -halfExtentM), column 0 = WEST edge
 * (x = -halfExtentM) -- `tools/terrain/resample.ts`'s `gridToLocal`, inverted.
 * Getting the row direction backwards mirrors north and south, which looks
 * like plausible terrain rather than an obvious bug -- see
 * tests/sim/world/terrain.test.ts's "reads north as -z" test.
 *
 * Any non-finite coordinate, or a coordinate outside the world's
 * [-halfExtentM, +halfExtentM] square, returns SEA_LEVEL_M instead of
 * indexing the grid -- both to keep a query "off the edge of the map" well
 * defined, and because a NaN or Infinity reaching the physics integrator is
 * the exact hazard master spec §9 names.
 */
export function heightAt(field: TerrainField, x: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return SEA_LEVEL_M

  const half = field.header.halfExtentM
  if (x < -half || x > half || z < -half || z > half) return SEA_LEVEL_M

  const n = field.samples
  const step = field.spacingM

  // Inverse of gridToLocal: x = -half + col*step, z = -half + row*step.
  let colF = (x + half) / step
  let rowF = (z + half) / step
  // Clamp for floating-point safety at the exact edge (e.g. x === half can
  // compute colF fractionally above n-1), not because the bounds check above
  // can be beaten legitimately.
  colF = Math.min(Math.max(colF, 0), n - 1)
  rowF = Math.min(Math.max(rowF, 0), n - 1)

  const col0 = Math.floor(colF)
  const row0 = Math.floor(rowF)
  const col1 = Math.min(col0 + 1, n - 1)
  const row1 = Math.min(row0 + 1, n - 1)
  const fx = colF - col0
  const fz = rowF - row0

  const heights = field.heightsDm
  const h00 = heights[row0 * n + col0]! / 10
  const h10 = heights[row0 * n + col1]! / 10
  const h01 = heights[row1 * n + col0]! / 10
  const h11 = heights[row1 * n + col1]! / 10

  const h0 = h00 * (1 - fx) + h10 * fx
  const h1 = h01 * (1 - fx) + h11 * fx
  return h0 * (1 - fz) + h1 * fz
}
