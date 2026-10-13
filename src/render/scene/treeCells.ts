import { TREE_FADE_END_M } from './tiers.js'

export const TREE_CELL_M = 400
export const TREE_CELL_RADIUS = 5
export const TREES_PER_CELL = 220

/** All cells that can intersect the eye-centered draw disc, including
 * movement within the eye's current cell. Also supports distant-tree ranges. */
export function residentCellOffsets(fadeEndM = TREE_FADE_END_M, cellSize = TREE_CELL_M): readonly (readonly [number, number])[] {
  const offsets: [number, number][] = []
  if (fadeEndM <= 0) return offsets
  const radius = Math.ceil(fadeEndM / cellSize) + 1
  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nearest = Math.hypot(Math.max(0, Math.abs(dx) - 1), Math.max(0, Math.abs(dz) - 1)) * cellSize
      if (nearest <= fadeEndM) offsets.push([dx, dz])
    }
  }
  return offsets
}
