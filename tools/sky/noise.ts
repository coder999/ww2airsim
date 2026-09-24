import { createRng } from '../../src/sim/rng.js'
import { COVERAGE_SIZE, DETAIL_SIZE, SHAPE_SIZE } from '../../src/render/sky/noise.js'

/**
 * Tileable Perlin and Worley noise for the cloud volumes (design §3), after
 * Schneider & Vos 2015. Pure integer-hash lattices from mulberry32, so the
 * committed files are bit-identical on any machine. Slow is fine: this runs
 * once, offline.
 */
export function createPermutation(seed: number): Uint8Array {
  const rng = createRng(seed)
  const p = Uint8Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const t = p[i]!
    p[i] = p[j]!
    p[j] = t
  }
  return p
}
const hash3 = (perm: Uint8Array, x: number, y: number, z: number): number =>
  perm[(perm[(perm[x & 255]! + y) & 255]! + z) & 255]!

const GRADIENTS = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1],
  [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
] as const
const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
const wrap = (i: number, period: number): number => ((i % period) + period) % period

/** Perlin noise in [-1, 1] that repeats every `period` units on each axis. */
export function perlinTileable(x: number, y: number, z: number, period: number, perm: Uint8Array): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
  const xf = x - xi, yf = y - yi, zf = z - zi
  const u = fade(xf), v = fade(yf), w = fade(zf)
  const g = (dx: number, dy: number, dz: number): number => {
    const h = hash3(perm, wrap(xi + dx, period), wrap(yi + dy, period), wrap(zi + dz, period)) % 12
    const [gx, gy, gz] = GRADIENTS[h]!
    return gx * (xf - dx) + gy * (yf - dy) + gz * (zf - dz)
  }
  const x00 = lerp(g(0, 0, 0), g(1, 0, 0), u), x10 = lerp(g(0, 1, 0), g(1, 1, 0), u)
  const x01 = lerp(g(0, 0, 1), g(1, 0, 1), u), x11 = lerp(g(0, 1, 1), g(1, 1, 1), u)
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w)
}

/** Inverted Worley: 1 at a feature point, toward 0 between them; `cells`
 *  per unit on each axis, wrapping so a unit cube tiles. */
export function worleyTileable(x: number, y: number, z: number, cells: number, perm: Uint8Array): number {
  const px = x * cells, py = y * cells, pz = z * cells
  const cx = Math.floor(px), cy = Math.floor(py), cz = Math.floor(pz)
  let best = Infinity
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const ix = cx + dx, iy = cy + dy, iz = cz + dz
    const h = hash3(perm, wrap(ix, cells), wrap(iy, cells), wrap(iz, cells))
    const fx = ix + perm[h]! / 256, fy = iy + perm[(h + 71) & 255]! / 256, fz = iz + perm[(h + 149) & 255]! / 256
    best = Math.min(best, (px - fx) ** 2 + (py - fy) ** 2 + (pz - fz) ** 2)
  }
  return Math.max(0, 1 - Math.sqrt(best))
}

export const remap = (v: number, lo: number, hi: number, newLo: number, newHi: number): number =>
  newLo + ((v - lo) / (hi - lo)) * (newHi - newLo)

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
const quantize = (v: number): number => Math.round(clamp01(v) * 255)

/** Perlin-Worley: low-frequency Perlin fbm, its low end pulled up by Worley
 *  fbm so cloud bodies are billowy rather than blobby (Schneider 2015). */
export function buildShape(size = SHAPE_SIZE, seed = 1944): Uint8Array {
  const perm = createPermutation(seed)
  const out = new Uint8Array(size ** 3)
  const base = 4 // periods per tile
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, w = z / size
    let perlin = 0, amp = 0.5, freq = base
    for (let o = 0; o < 3; o++) {
      perlin += amp * perlinTileable(u * freq, v * freq, w * freq, freq, perm)
      amp *= 0.5
      freq *= 2
    }
    perlin = clamp01(perlin * 0.5 + 0.5)
    const worley = 0.625 * worleyTileable(u, v, w, base, perm) + 0.25 * worleyTileable(u, v, w, base * 2, perm) + 0.125 * worleyTileable(u, v, w, base * 4, perm)
    out[(z * size + y) * size + x] = quantize(remap(perlin, 0, 1, worley, 1))
  }
  return out
}

/** Worley fbm alone: the high-frequency erosion of cloud edges. */
export function buildDetail(size = DETAIL_SIZE, seed = 1945): Uint8Array {
  const perm = createPermutation(seed)
  const out = new Uint8Array(size ** 3)
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, w = z / size
    const d = 0.625 * worleyTileable(u, v, w, 4, perm) + 0.25 * worleyTileable(u, v, w, 8, perm) + 0.125 * worleyTileable(u, v, w, 16, perm)
    out[(z * size + y) * size + x] = quantize(d)
  }
  return out
}

/** Large-scale 2D Perlin fbm: the cumulus coverage-modulation "weather map"
 *  (design §2). Perlin alone, no Worley mix -- unlike buildShape this has no
 *  billowy cloud-body job to do, just smooth regional clumping/gapping of
 *  the per-layer coverage scalar. `base = 3` (vs. buildShape's 4) for even
 *  lower frequency: this is meant to vary over tens of kilometres. */
export function buildCoverage(size = COVERAGE_SIZE, seed = 1946): Uint8Array {
  const perm = createPermutation(seed)
  const out = new Uint8Array(size * size)
  const base = 3
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size
    let n = 0, amp = 0.5, freq = base
    for (let o = 0; o < 3; o++) {
      n += amp * perlinTileable(u * freq, v * freq, 0, freq, perm)
      amp *= 0.5
      freq *= 2
    }
    out[y * size + x] = quantize(n * 0.5 + 0.5)
  }
  return out
}
