// tests/render/shipFixtures.ts
import type { FitSpec, TriangleSoup } from '../../src/render/scene/shipFit.js'
import { boxArrays, type V3 } from '../tools/models/fixtures.js'

/** Closed boxes as one soup, each wound outward. */
export function boxSoup(boxes: readonly [V3, V3][]): TriangleSoup {
  const positions: number[] = [], indices: number[] = []
  for (const [min, max] of boxes) {
    const b = boxArrays(min, max)
    const base = positions.length / 3
    positions.push(...b.positions)
    indices.push(...b.indices.map((i) => i + base))
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) }
}

/** A convex (x, z) outline extruded from `bottom` to `top`: walls plus fan-triangulated caps, wound outward. */
export function prismSoup(outline: readonly [number, number][], bottom: number, top: number): TriangleSoup {
  const positions: number[] = [], indices: number[] = []
  const n = outline.length
  for (const [x, z] of outline) positions.push(x, bottom, z)
  for (const [x, z] of outline) positions.push(x, top, z)
  // Winding: for an outline that runs +x along its -z side first (escortPrism's), these face outward;
  // tests/render/shipFit.test.ts checks every triangle.
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    indices.push(i, n + j, j, i, n + i, n + j)
  }
  for (let i = 1; i < n - 1; i++) {
    indices.push(n, n + i + 1, n + i) // top, facing +y
    indices.push(0, i, i + 1) // bottom, facing -y
  }
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) }
}

/** essex-cv's figures (content/ships/essex-cv.json), as a FitSpec. */
export const CARRIER: FitSpec = {
  id: 'test-cv', role: 'carrier', lengthM: 265.8, beamM: 28.3, deckHeightM: 17,
  flightDeck: { lengthM: 262.7, widthM: 32.9, heightM: 17 },
  trapZone: { fromSternM: 30, toSternM: 130 },
}

/** fletcher-dd's figures, as a FitSpec. */
export const ESCORT: FitSpec = { id: 'test-dd', role: 'escort', lengthM: 114.8, beamM: 12, deckHeightM: 6 }

/**
 * A carrier in `normalize`'s output frame, fitted to nothing yet: a 260 x 26 m
 * hull 15 m high, a 256 x 30 m flight deck slab topped at 16 m, and an island
 * to starboard (x 0..40, z 12..15) standing 24 m over the deck. `deckFit`
 * maps it onto CARRIER with rx 1.0262, ry 1.0625, kWaterline 1.0607 and kDeck 1.0690.
 */
export function carrierBoxes(opts: { islandZ?: [number, number]; deckTop?: number; hullX?: number; extra?: [V3, V3][] } = {}): TriangleSoup {
  const [iz0, iz1] = opts.islandZ ?? [12, 15]
  const top = opts.deckTop ?? 16, hx = opts.hullX ?? 130
  return boxSoup([
    [[-hx, 0, -13], [hx, top - 1, 13]],
    [[-128, top - 1, -15], [128, top, 15]],
    [[0, top, iz0], [40, top + 24, iz1]],
    ...(opts.extra ?? []),
  ])
}

/**
 * A full hull in `normalize`'s output frame: a planform 114.8 m long, 11 m
 * wide at the stern and tapering to 2 m at the bow (+x), keel at -4, main
 * deck at `deck` (6 unless given). `bowAt: -1` builds it reversed.
 */
export function escortPrism(opts: { deck?: number; keel?: number; bowAt?: 1 | -1 } = {}): TriangleSoup {
  const s = opts.bowAt ?? 1
  const outline: [number, number][] = s === 1
    ? [[-57.4, -5.5], [30, -5.5], [57.4, -1], [57.4, 1], [30, 5.5], [-57.4, 5.5]]
    : [[57.4, 5.5], [-30, 5.5], [-57.4, 1], [-57.4, -1], [-30, -5.5], [57.4, -5.5]]
  return prismSoup(outline, opts.keel ?? -4, opts.deck ?? 6)
}
