import { toGeodetic } from '../../src/sim/world/projection.js'

/** Height in metres at a geodetic point, or NaN where the source has no data. */
export type SourceSampler = (latDeg: number, lonDeg: number) => number

export type GridSpec = {
  readonly samples: number // 8193
  readonly halfExtentM: number // 100000
}

/** The shipped world grid: 8193 × 8193 samples covering ±100 km from Leyte Gulf. */
export const GRID: GridSpec = {
  samples: 8193,
  halfExtentM: 100e3,
}

/** Maximum magnitude in metres that can be represented as int16 decimetres.
 *  int16 range is ±32767; stored as decimetres, max magnitude is 3276.7 m. */
export const DECIMETRE_LIMIT = 3276.7

/** Convert grid column and row to local x, z coordinates.
 *  Row 0 = north edge (z = +half), row samples-1 = south edge (z = -half).
 *  Column 0 = west edge (x = -half), column samples-1 = east edge (x = +half). */
export function gridToLocal(col: number, row: number, grid: GridSpec = GRID): { x: number; z: number } {
  const step = (2 * grid.halfExtentM) / (grid.samples - 1)
  const x = -grid.halfExtentM + col * step
  const z = grid.halfExtentM - row * step
  return { x, z }
}

/** Resample a source elevation sampler onto the fixed world grid.
 *  Returns an Int16Array of heights in decimetres (0.1 m), row-major order
 *  (row 0 = north edge, column 0 = west edge).
 *  NaN samples map to 0 (sea level). Throws if any sample magnitude exceeds
 *  DECIMETRE_LIMIT. */
export function resample(sample: SourceSampler, grid: GridSpec = GRID): Int16Array {
  const gridSize = grid.samples * grid.samples
  const out = new Int16Array(gridSize)

  for (let row = 0; row < grid.samples; row++) {
    for (let col = 0; col < grid.samples; col++) {
      const { x, z } = gridToLocal(col, row, grid)
      const { latDeg, lonDeg } = toGeodetic(x, z)
      let heightM = sample(latDeg, lonDeg)

      // Map NaN to 0 (sea level). Must check before range comparison
      // because NaN fails all comparisons.
      if (Number.isNaN(heightM)) {
        heightM = 0
      }

      // Validate height is within representable range (±DECIMETRE_LIMIT m).
      if (Math.abs(heightM) > DECIMETRE_LIMIT) {
        throw new Error(
          `Height ${heightM} m at (lat=${latDeg}, lon=${lonDeg}) is out of range [${-DECIMETRE_LIMIT}, ${DECIMETRE_LIMIT}]`,
        )
      }

      // Store as int16 decimetres.
      out[row * grid.samples + col] = Math.round(heightM * 10)
    }
  }

  return out
}
