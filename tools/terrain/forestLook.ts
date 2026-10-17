/**
 * Look statistics for the forest canopy rework (D8, 2026-10-16): numbers for comparing two renders of the same frozen
 * view. They are REPORTED with tolerances, never a pass/fail gate (Mark: his eye decides). Pure functions over an
 * RGB or RGBA byte image so they test on synthetic pictures; `tests/e2e/forestCanopyCapture.spec.ts` feeds them
 * real captures.
 */
export type Image = { readonly data: Uint8Array | Uint8ClampedArray; readonly width: number; readonly height: number; readonly channels: 3 | 4 }

export type LookStats = {
  /** Mean Rec. 709 luma of the sRGB bytes, 0 to 1. */
  meanLuminance: number
  /** Share of pixels classed as canopy (green-dominant and not bright), 0 to 1. */
  canopyCoverage: number
  /** Pixels whose Sobel gradient of luma exceeds `EDGE_THRESHOLD`, as a count. */
  edgeCount: number
  /** Canopy-mask pixels with a non-canopy 4-neighbor: the length of the canopy outline in pixels. */
  silhouetteCount: number
}

export const EDGE_THRESHOLD = 0.12

/** Report-only tolerances, set 2026-10-16 before any capture was looked at: the share of the old value (or points of coverage) a view may move. */
export const LOOK_TOLERANCE = { meanLuminance: 0.05, canopyCoverage: 0.05, edgeCount: 0.25, silhouetteCount: 0.25, meanAbsDifference: 0.08 } as const

const luma = (img: Image, i: number): number => (0.2126 * img.data[i]! + 0.7152 * img.data[i + 1]! + 0.0722 * img.data[i + 2]!) / 255

export function isCanopy(r: number, g: number, b: number): boolean {
  return g > r * 1.04 && g > b * 1.08 && (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.55
}

export function lookStats(img: Image): LookStats {
  const { width: w, height: h, channels: c } = img
  const lum = new Float32Array(w * h), canopy = new Uint8Array(w * h)
  let sum = 0, green = 0
  for (let p = 0; p < w * h; p++) {
    const i = p * c
    lum[p] = luma(img, i)
    sum += lum[p]!
    if (isCanopy(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!)) { canopy[p] = 1; green++ }
  }
  let edges = 0, outline = 0
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const p = y * w + x
    const gx = lum[p - w + 1]! + 2 * lum[p + 1]! + lum[p + w + 1]! - lum[p - w - 1]! - 2 * lum[p - 1]! - lum[p + w - 1]!
    const gy = lum[p + w - 1]! + 2 * lum[p + w]! + lum[p + w + 1]! - lum[p - w - 1]! - 2 * lum[p - w]! - lum[p - w + 1]!
    if (Math.hypot(gx, gy) / 4 > EDGE_THRESHOLD) edges++
    if (canopy[p] && (!canopy[p - 1] || !canopy[p + 1] || !canopy[p - w] || !canopy[p + w])) outline++
  }
  return { meanLuminance: sum / (w * h), canopyCoverage: green / (w * h), edgeCount: edges, silhouetteCount: outline }
}

/** Mean absolute per-channel difference of two same-size images, 0 to 1. */
export function meanAbsDifference(a: Image, b: Image): number {
  if (a.width !== b.width || a.height !== b.height) throw new Error(`size mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}`)
  let sum = 0
  for (let p = 0; p < a.width * a.height; p++) for (let k = 0; k < 3; k++) sum += Math.abs(a.data[p * a.channels + k]! - b.data[p * b.channels + k]!)
  return sum / (a.width * a.height * 3 * 255)
}

export type LookComparison = {
  a: LookStats; b: LookStats; meanAbsDifference: number
  /** Relative change of b against a (coverage: absolute points). */
  change: { meanLuminance: number; canopyCoverage: number; edgeCount: number; silhouetteCount: number }
  /** Names of the measures outside `LOOK_TOLERANCE`; empty means the view matches within tolerance. */
  outside: string[]
}

export function compareLooks(imgA: Image, imgB: Image): LookComparison {
  const a = lookStats(imgA), b = lookStats(imgB)
  const rel = (x: number, y: number): number => (x === 0 ? (y === 0 ? 0 : Infinity) : (y - x) / x)
  const change = { meanLuminance: rel(a.meanLuminance, b.meanLuminance), canopyCoverage: b.canopyCoverage - a.canopyCoverage,
    edgeCount: rel(a.edgeCount, b.edgeCount), silhouetteCount: rel(a.silhouetteCount, b.silhouetteCount) }
  const diff = meanAbsDifference(imgA, imgB)
  const outside = (Object.keys(change) as (keyof typeof change)[]).filter(k => Math.abs(change[k]) > LOOK_TOLERANCE[k])
  if (diff > LOOK_TOLERANCE.meanAbsDifference) outside.push('meanAbsDifference')
  return { a, b, meanAbsDifference: diff, change, outside }
}
