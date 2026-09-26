import { createRng } from '../../src/sim/rng.js'
import {
  WEATHER_CELL_REACH, WEATHER_CELL_SPACING_M, WEATHER_FEATURE_STEPS, WEATHER_RADIUS_M, WEATHER_SIZE, WEATHER_TILE_M,
} from '../../src/render/sky/noise.js'
import { createPermutation, perlinTileable } from './noise.js'

/**
 * The cumulus weather map (Cloud Fidelity II spec §3.3): one Worley cell per
 * cloud. Feature points on a jittered grid (Worley's construction) are the
 * clouds; each gets a footprint radius and a strength. The shader derives
 * each cloud's shape variant, top and orientation from its strength.
 * RGBA8 per texel:
 *
 * - R, the winning cloud's strength over the tile's maximum. The shader's
 *   `coverage` keeps the clouds whose R clears 1 - coverage.
 * - G, B: the winning cloud's feature point, X and Z, relative to the
 *   texel's own grid cell: (cell offset + 2) x 51 + its position within its
 *   cell in 1/51 steps. Feature points are snapped to that grid here, so
 *   every texel of a cloud decodes to the SAME centre, and the shader
 *   measures its local position continuously from the world position
 *   rather than from a per-texel value (which quantized each cloud into
 *   39 m blocks: first GPU capture, 2026-09-25).
 * - A: the winning cloud's radius, byte-quantized over WEATHER_RADIUS_M,
 *   and quantized the same way here.
 *
 * The winner is the cloud with the strongest compact bump (1 at its
 * centre, 0 at twice its radius) at the texel centre, or the nearest one
 * where no bump reaches. A second plane of the same size and encoding
 * follows the first: the RUNNER-UP, the second-strongest bump, all zero
 * where none reaches. Without it a cloud that grows past the texels it
 * wins is sliced off in a vertical wall at its neighbor's boundary: 9.5%
 * of cloud area at the densest coverage, 1.3% with it (synthetic study,
 * plan 2026-09-26-cloud-vdb-coverage). The shader samples this map NEAREST: a filtered
 * sample would blend two clouds' centres.
 *
 * A slow Perlin factor on each cell's strength clumps and gaps the deck over
 * ~10-20 km, the job Plan 16d's separate coverage-modulation field did.
 *
 * Arithmetic only (mulberry32, Perlin's fade polynomials, a compact
 * polynomial bump, sqrt), so the bytes are identical on any machine; `tests/tools/skyNoise.test.ts` pins them.
 */

export { WEATHER_CELL_SPACING_M, WEATHER_RADIUS_M }

export function buildWeather(size = WEATHER_SIZE, seed = 1947, tileM = WEATHER_TILE_M): Uint8Array {
  const cells = Math.round(tileM / WEATHER_CELL_SPACING_M)
  const spacing = tileM / cells
  const rng = createRng(seed)
  const perm = createPermutation(seed + 1)
  const n = cells * cells
  const steps = WEATHER_FEATURE_STEPS, step = spacing / steps
  const reach = Math.ceil((WEATHER_RADIUS_M[1] * 2) / spacing)
  if (reach > WEATHER_CELL_REACH) throw new Error(`weather cells of ${spacing} m need reach ${reach} > ${WEATHER_CELL_REACH}`)
  const fx = new Float64Array(n), fz = new Float64Array(n), radius = new Float64Array(n), radiusByte = new Uint8Array(n)
  const strength = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const cx = i % cells, cz = Math.floor(i / cells)
    // Snapped to 1/51 of a cell, so the map's G/B bytes encode it exactly.
    fx[i] = Math.round((cx + 0.1 + 0.8 * rng()) * steps) * step
    fz[i] = Math.round((cz + 0.1 + 0.8 * rng()) * steps) * step
    // Many small clouds, few big ones; byte-quantized, as the map stores it.
    const size01 = rng() ** 1.6
    radiusByte[i] = Math.round(size01 * 255)
    radius[i] = WEATHER_RADIUS_M[0] + (WEATHER_RADIUS_M[1] - WEATHER_RADIUS_M[0]) * radiusByte[i]! / 255
    // Regional clumping: the cell's strength times a slow tileable Perlin.
    const u = fx[i]! / tileM, v = fz[i]! / tileM
    const regional = 0.5 * perlinTileable(u * 2, v * 2, 0.5, 2, perm) + 0.25 * perlinTileable(u * 4, v * 4, 0.5, 4, perm)
    strength[i] = (0.55 + 0.45 * rng()) * (1 + 0.9 * regional)
    // Preserve the two independent draws that historically supplied type
    // and top, so positions/radii/strengths after this cell stay unchanged.
    rng()
    rng()
  }

  const texel = tileM / size
  let peak = 0
  for (let c = 0; c < n; c++) peak = Math.max(peak, strength[c]!)
  const out = new Uint8Array(size * size * 8)
  const runnerBase = size * size * 4
  // One texel's cloud in the map's encoding: strength, the feature point
  // relative to the texel's own grid cell minus the reach, the radius byte.
  const encode = (at: number, c: number, ix: number, iz: number, gx: number, gz: number): void => {
    const fX = Math.round((fx[c]! + (ix - wrap(ix, cells)) * spacing) / step) - (gx - WEATHER_CELL_REACH) * steps
    const fZ = Math.round((fz[c]! + (iz - wrap(iz, cells)) * spacing) / step) - (gz - WEATHER_CELL_REACH) * steps
    if (fX < 0 || fX > 255 || fZ < 0 || fZ > 255) throw new Error(`feature offset ${fX},${fZ} does not fit a byte`)
    out[at] = Math.round(clamp01(strength[c]! / peak) * 255)
    out[at + 1] = fX
    out[at + 2] = fZ
    out[at + 3] = radiusByte[c]!
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = (x + 0.5) * texel, pz = (y + 0.5) * texel
    // The texel's own grid cell, in integer arithmetic the shader repeats
    // exactly: floor((2x + 1) * cells / (2 * size)).
    const gx = Math.floor(((2 * x + 1) * cells) / (2 * size)), gz = Math.floor(((2 * y + 1) * cells) / (2 * size))
    let best = 0, bestCell = -1, bestIx = 0, bestIz = 0
    let second = 0, secondCell = -1, secondIx = 0, secondIz = 0
    let nearest = Infinity, nearestCell = 0, nearestIx = 0, nearestIz = 0
    for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) {
      const ix = gx + dx, iz = gz + dz
      const c = wrap(iz, cells) * cells + wrap(ix, cells)
      // The feature point in THIS copy of the tile: tileable by construction.
      const ox = fx[c]! + (ix - wrap(ix, cells)) * spacing
      const oz = fz[c]! + (iz - wrap(iz, cells)) * spacing
      const d2 = (px - ox) ** 2 + (pz - oz) ** 2
      if (d2 < nearest) { nearest = d2; nearestCell = c; nearestIx = ix; nearestIz = iz }
      // Compact bump reaching zero at twice the radius; ~0.32 at the radius.
      const q = d2 / (4 * radius[c]! ** 2)
      if (q >= 1) continue
      const f = strength[c]! * (1 - q) ** 3
      if (f > best) {
        second = best; secondCell = bestCell; secondIx = bestIx; secondIz = bestIz
        best = f; bestCell = c; bestIx = ix; bestIz = iz
      } else if (f > second) {
        second = f; secondCell = c; secondIx = ix; secondIz = iz
      }
    }
    const i = y * size + x
    if (bestCell >= 0) encode(i * 4, bestCell, bestIx, bestIz, gx, gz)
    else encode(i * 4, nearestCell, nearestIx, nearestIz, gx, gz)
    // The runner-up plane: strength 0 (all four bytes) where no second
    // bump reaches, which the shader reads as "no second cloud".
    if (secondCell >= 0) encode(runnerBase + i * 4, secondCell, secondIx, secondIz, gx, gz)
  }
  return out
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const wrap = (i: number, period: number): number => ((i % period) + period) % period
