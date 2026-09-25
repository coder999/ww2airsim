import { createRng } from '../../src/sim/rng.js'
import { WEATHER_SIZE, WEATHER_TILE_M } from '../../src/render/sky/noise.js'
import { createPermutation, perlinTileable } from './noise.js'

/**
 * The cumulus weather map (Cloud Fidelity II spec §3.3): one Worley cell per
 * cloud. Feature points on a jittered grid (Worley's construction) are the
 * clouds; each gets a footprint radius, a cloud type (0 stratus, 0.5
 * cumulus, 1 towering cumulus) and a top height, bigger clouds being taller
 * and more towering, as fair-weather cumulus are. RGBA8 per texel:
 *
 * - R, cell potential: the strongest cloud's strength times a smooth
 *   compact bump (1 at its centre, 0 at twice its radius), over the
 *   tile's maximum. `createCloudField` thresholds it at the quantile that
 *   leaves the layer's `coverage` of the map above it
 *   (`weatherCoverageThresholds`), so the scenario's per-layer `coverage`
 *   keeps its meaning and the map decides WHERE that fraction of sky goes:
 *   at low coverage only the strong cells survive, shrunk to their cores;
 *   at high coverage neighbours merge.
 * - G, cloud type; B, top height as a fraction of the layer's thickness,
 *   mapped by the shader onto [WEATHER_TOP_MIN, 1]; A, the peak potential
 *   of the cloud the texel belongs to, so the shader can bring EVERY
 *   surviving cloud to full coverage at its own centre (a dome, where an
 *   equalized R made strong cells into flat mesas -- first capture,
 *   2026-09-25). All three from the cells that dominate the texel (a sharp
 *   soft-argmax, so a texel between two merged cells blends, not cliffs).
 *
 * A slow Perlin factor on each cell's strength clumps and gaps the deck over
 * ~10-20 km, the job Plan 16d's separate coverage-modulation field did.
 *
 * Arithmetic only (mulberry32, Perlin's fade polynomials, a compact
 * polynomial bump, sqrt), so the bytes are identical on any machine; `tests/tools/skyNoise.test.ts` pins them.
 */

/** Metres between feature points on the jittered grid. */
export const WEATHER_CELL_SPACING_M = 1500
/** Footprint radius range of one cloud, metres (fair-weather cumulus are
 *  roughly as wide as they are deep: 300-900 m here). */
export const WEATHER_RADIUS_M: readonly [number, number] = [330, 950]

export function buildWeather(size = WEATHER_SIZE, seed = 1947, tileM = WEATHER_TILE_M): Uint8Array {
  const cells = Math.round(tileM / WEATHER_CELL_SPACING_M)
  const spacing = tileM / cells
  const rng = createRng(seed)
  const perm = createPermutation(seed + 1)
  const n = cells * cells
  const fx = new Float64Array(n), fz = new Float64Array(n), radius = new Float64Array(n)
  const strength = new Float64Array(n), kind = new Float64Array(n), top = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const cx = i % cells, cz = Math.floor(i / cells)
    fx[i] = (cx + 0.1 + 0.8 * rng()) * spacing
    fz[i] = (cz + 0.1 + 0.8 * rng()) * spacing
    // Many small clouds, few big ones.
    const size01 = rng() ** 1.6
    radius[i] = WEATHER_RADIUS_M[0] + (WEATHER_RADIUS_M[1] - WEATHER_RADIUS_M[0]) * size01
    // Regional clumping: the cell's strength times a slow tileable Perlin.
    const u = fx[i]! / tileM, v = fz[i]! / tileM
    const regional = 0.5 * perlinTileable(u * 2, v * 2, 0.5, 2, perm) + 0.25 * perlinTileable(u * 4, v * 4, 0.5, 4, perm)
    strength[i] = (0.55 + 0.45 * rng()) * (1 + 0.9 * regional)
    kind[i] = clamp01(0.3 + 0.6 * size01 + 0.2 * (rng() - 0.5))
    top[i] = clamp01(0.15 + 0.85 * size01 + 0.3 * (rng() - 0.5))
  }

  const texel = tileM / size
  const potential = new Float64Array(size * size)
  const outKind = new Float64Array(size * size), outTop = new Float64Array(size * size), outPeak = new Float64Array(size * size)
  const reach = Math.ceil((WEATHER_RADIUS_M[1] * 2) / spacing)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = (x + 0.5) * texel, pz = (y + 0.5) * texel
    const gx = Math.floor(px / spacing), gz = Math.floor(pz / spacing)
    let best = 0, nearest = Infinity, nearestCell = 0
    let wSum = 0, kSum = 0, tSum = 0, pSum = 0
    for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) {
      const ix = gx + dx, iz = gz + dz
      const c = wrap(iz, cells) * cells + wrap(ix, cells)
      // The feature point in THIS copy of the tile: tileable by construction.
      const ox = fx[c]! + (ix - wrap(ix, cells)) * spacing
      const oz = fz[c]! + (iz - wrap(iz, cells)) * spacing
      const d2 = (px - ox) ** 2 + (pz - oz) ** 2
      const dist = Math.sqrt(d2)
      if (dist < nearest) { nearest = dist; nearestCell = c }
      // Compact bump reaching zero at twice the radius; ~0.32 at the radius.
      const q = d2 / (4 * radius[c]! ** 2)
      if (q >= 1) continue
      const bump = (1 - q) ** 3
      const f = strength[c]! * bump
      if (f > best) best = f
      const w = f ** 6
      wSum += w
      kSum += w * kind[c]!
      tSum += w * top[c]!
      pSum += w * strength[c]!
    }
    const i = y * size + x
    potential[i] = best
    outKind[i] = wSum > 1e-12 ? kSum / wSum : kind[nearestCell]!
    outTop[i] = wSum > 1e-12 ? tSum / wSum : top[nearestCell]!
    outPeak[i] = wSum > 1e-12 ? pSum / wSum : strength[nearestCell]!
  }

  let peak = 0
  for (let c = 0; c < n; c++) peak = Math.max(peak, strength[c]!)
  const out = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    out[i * 4] = Math.round(clamp01(potential[i]! / peak) * 255)
    out[i * 4 + 1] = Math.round(clamp01(outKind[i]!) * 255)
    out[i * 4 + 2] = Math.round(clamp01(outTop[i]!) * 255)
    out[i * 4 + 3] = Math.round(clamp01(outPeak[i]! / peak) * 255)
  }
  return out
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const wrap = (i: number, period: number): number => ((i % period) + period) % period
