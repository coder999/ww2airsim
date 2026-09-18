import { GRID, type GridSpec } from './resample.js'

/** The waterline itself, in decimetres: 0.3 m. */
export const SHORE_BASE_DM = 3
/** How much higher a fully dry cell sits than the waterline: 1.5 m. */
export const SHORE_RISE_DM = 15

/**
 * Move the shoreline into the DEM, per design spec §6.
 *
 * Copernicus quantizes coastal land to exactly 0, and the renderer discards
 * `h <= 0` as sea (`src/render/terrain/mesh.ts`), so a 5-10 km run of real
 * beach is drawn as ocean — measured on the committed L4, 2026-09-18. This
 * rewrites those cells to a low shore INSIDE the existing 0.4-2.3 m beach
 * band in `terrainSurfaceNode`, so it still reads as sand rather than as a
 * new green step.
 *
 * Runs on the finest grid before `buildPyramid`, so every mip inherits it and
 * no other terrain code changes.
 *
 * `seaFractionAt` is a function of (col, row) rather than a mask object so
 * this stays a pure rule that a synthetic test can drive without a GeoTIFF.
 */
export function reshapeCoast(
  finest: Int16Array,
  seaFractionAt: (col: number, row: number) => number,
  grid: GridSpec = GRID,
): Int16Array {
  const out = new Int16Array(finest.length)
  for (let row = 0; row < grid.samples; row++) {
    for (let col = 0; col < grid.samples; col++) {
      const i = row * grid.samples + col
      const h = finest[i]!
      const w = seaFractionAt(col, row)
      if (w >= 0.5) {
        out[i] = 0
      } else if (h > 0) {
        out[i] = h
      } else {
        // 0.3 + 1.5 * (1 - w) metres. Never negative, by construction.
        out[i] = Math.round(SHORE_BASE_DM + SHORE_RISE_DM * (1 - w))
      }
    }
  }
  return out
}
