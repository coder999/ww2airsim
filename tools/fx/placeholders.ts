import { FX_SHEETS, type FxSheetName } from '../../src/render/fx/sheetManifest.js'

/** Placeholder sheet parameters (effects design §6.4). E2 replaces the files
 *  and the manifest; nothing at runtime reads these constants. */
export const PLACEHOLDER = { cellPx: 128, cols: 3, rows: 2, frames: 16, seed: 1944, motionScale: 0.02 } as const

const hash = (x: number, y: number, z: number): number => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647) ^ Math.imul(PLACEHOLDER.seed, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}
const smooth = (t: number): number => t * t * (3 - 2 * t)
/** 2D value noise at `scale` cells per unit, one octave, layered by `z`. */
const noise = (u: number, v: number, scale: number, z: number): number => {
  const x = u * scale, y = v * scale, xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi)
  const a = hash(xi, yi, z), b = hash(xi + 1, yi, z), c = hash(xi, yi + 1, z), d = hash(xi + 1, yi + 1, z)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

/** Density in [0, 1] at cell coordinates u, v in [0, 1] (v = 0 at the TOP), frame t in [0, 1]. */
function density(sheet: FxSheetName, u: number, v: number, t: number, frame: number): number {
  const x = u - 0.5, yUp = 0.5 - v // +y is up in the picture
  const n = 0.65 + 0.35 * (0.6 * noise(u, v, 6, frame) + 0.4 * noise(u, v, 13, frame + 97))
  let r: number
  switch (sheet) {
    case 'water-column': r = Math.hypot(x / (0.12 + 0.18 * (yUp + 0.5)), (yUp + 0.05) / 0.42); break // narrow at the base, wide crown
    case 'flame': r = Math.hypot(x / (0.18 * (0.5 - yUp) + 0.04), (yUp + 0.1) / 0.36); break
    default: r = Math.hypot(x, yUp) / (0.22 + 0.16 * t)
  }
  // Zero by r = 1, and the growth keeps r = 1 inside a 0.42-radius disc, so
  // every cell's border texels are exactly 0 (fxSheets.test.ts).
  return Math.max(0, Math.min(1, (1 - r) * 2.2 * n)) * (Math.hypot(x, yUp) < 0.46 ? 1 : 0)
}

const clamp01 = (x: number): number => Math.max(0, Math.min(1, x))
const byte = (x: number): number => Math.round(clamp01(x) * 255)

export function placeholderLayer(image: 'lightA' | 'lightB' | 'motion', frame: number): Uint8Array {
  const { cellPx, cols, rows, frames } = PLACEHOLDER
  const w = cols * cellPx, h = rows * cellPx, out = new Uint8Array(w * h * 4)
  const t = (frames as number) === 1 ? 0 : frame / (frames - 1)
  for (const [cell, sheet] of FX_SHEETS.entries()) {
    const ox = (cell % cols) * cellPx, oy = Math.floor(cell / cols) * cellPx
    for (let py = 0; py < cellPx; py++) for (let px = 0; px < cellPx; px++) {
      const u = (px + 0.5) / cellPx, v = (py + 0.5) / cellPx, e = 1 / cellPx
      const d = density(sheet, u, v, t, frame)
      // Surface normal from the density gradient (x right, y up, z toward the viewer).
      const gx = density(sheet, u + e, v, t, frame) - density(sheet, u - e, v, t, frame)
      const gy = density(sheet, u, v - e, t, frame) - density(sheet, u, v + e, t, frame)
      const len = Math.hypot(gx * 40, gy * 40, 1)
      const n = { x: -gx * 40 / len, y: -gy * 40 / len, z: 1 / len }
      const lit = (dot: number): number => d > 0 ? 0.25 + 0.75 * clamp01(dot) : 0
      const i = ((oy + py) * w + ox + px) * 4
      if (image === 'lightA') { out[i] = byte(lit(n.x)); out[i + 1] = byte(lit(-n.x)); out[i + 2] = byte(lit(n.y)); out[i + 3] = byte(d) }
      else if (image === 'lightB') {
        const hot = sheet === 'fireball' ? d * d * (1 - 0.8 * t) : sheet === 'flame' ? Math.pow(d, 1.5) : 0
        out[i] = byte(lit(-n.y)); out[i + 1] = byte(lit(-n.z) * 0.6); out[i + 2] = byte(lit(n.z)); out[i + 3] = byte(hot)
      } else {
        // Placeholder motion: outward radial drift, strongest mid-blob.
        const mx = (u - 0.5) * d * 0.8, my = (v - 0.5) * d * 0.8
        out[i] = byte(0.5 + mx); out[i + 1] = byte(0.5 + my); out[i + 2] = 0; out[i + 3] = 255
      }
    }
  }
  return out
}
