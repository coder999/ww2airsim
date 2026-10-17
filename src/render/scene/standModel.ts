/**
 * Stand model (forest canopy rework, 2026-10-16, D2 and D3): which tree
 * placements are the EDGE of a stand, which are its INTERIOR, and which interior
 * ones stay as individual EMERGENT crowns.
 *
 * Pure: it knows nothing about terrain or land cover. The caller supplies
 * `forestAt`, "would a tree stand here", built from the same rules
 * `treeSites` uses (land cover, shore, clearings, huts, rivers). Slope is left
 * out of the probe on purpose: a slope test is five height reads per probe and
 * the band is about cover boundaries, not cliffs.
 */
export type StandRole = 'edge' | 'interior' | 'emergent'

/** About 3 tree rows, about 100 ft (D2). */
export const EDGE_BAND_M = 30
/** Roughly 1 in 20 interior trees stays an individual crown (D3). */
export const EMERGENT_ONE_IN = 20
/** An emergent crown is taller and slightly broader than its neighbors. */
export const EMERGENT_HEIGHT_SCALE = 1.35
export const EMERGENT_RADIUS_SCALE = 1.15

const PROBES: readonly (readonly [number, number])[] = Array.from({ length: 8 }, (_, i) => [Math.cos(i * Math.PI / 4), Math.sin(i * Math.PI / 4)] as const)

/** Seeded from the cell and the candidate index, never from load order: the same tree is
 *  emergent every visit (D3: deterministic, not random per load). */
export function isEmergent(cellX: number, cellZ: number, index: number): boolean {
  let h = (Math.imul(cellX, 73856093) ^ Math.imul(cellZ, 19349663) ^ Math.imul(index + 1, 83492791) ^ 0x2f6e2b1) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0
  h ^= h >>> 16
  return (h >>> 0) % EMERGENT_ONE_IN === 0
}

/** Edge when any of 8 probes at the band width lands off the stand. For a straight boundary that is
 *  exactly "within `EDGE_BAND_M` of it". */
export function standRole(x: number, z: number, forestAt: (x: number, z: number) => boolean, cellX: number, cellZ: number, index: number): StandRole {
  for (const [dx, dz] of PROBES) if (!forestAt(x + dx * EDGE_BAND_M, z + dz * EDGE_BAND_M)) return 'edge'
  return isEmergent(cellX, cellZ, index) ? 'emergent' : 'interior'
}
