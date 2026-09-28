// tools/fx/pack.ts
/**
 * The pure half of the flipbook pack (plan E2). Channel layout, E1 Ruling R7 verbatim:
 * light A RGBA = right, left, top, alpha; light B RGBA = bottom, back, front, emission;
 * motion RG = frame-to-frame motion in cell UV, 0.5 = none. Images are Float32Array,
 * row-major, row 0 at the TOP, one value per texel. tests/tools/fxPack.test.ts covers every
 * export with synthetic images; bake.ts does the file I/O.
 */
import type { FxSheetName } from '../../src/render/fx/sheetManifest.js'

export const PASSES = ['right', 'left', 'top', 'bottom', 'back', 'front'] as const
export type Pass = (typeof PASSES)[number]
export type FramePasses = { readonly lit: Readonly<Record<Pass, Float32Array>>; readonly alpha: Float32Array; readonly emit: Float32Array }

/** Ruling R5: the first rung whose content/fx fits the 10 MB gate ships. */
export const LADDER: readonly { readonly cellPx: number; readonly frames: number }[] = [
  { cellPx: 256, frames: 64 }, { cellPx: 256, frames: 48 }, { cellPx: 192, frames: 64 }, { cellPx: 192, frames: 48 }, { cellPx: 128, frames: 64 },
]
/** Ruling R7: only the flame loops (ship fire and the rocket motor play it at a rate). */
export const LOOPING: readonly FxSheetName[] = ['flame']
export const LOOP_BLEND = 8
/** A texel is covered above this alpha; E1's placeholder fill was measured at 25/255. */
export const COVERED = 0.1
/** Border texels forced to zero in A and B, so no mip bleeds one sheet into its neighbor. */
export const BORDER = 2
/** Before masking, no alpha within EDGE_BAND texels of the cell edge may exceed EDGE_ALPHA_MAX. */
export const EDGE_BAND = 4
export const EDGE_ALPHA_MAX = 0.1

export const mipLevels = (cellPx: number): number => Math.floor(Math.log2(cellPx / 8)) + 1

export function pickFrames(total: number, n: number, loop = false): number[] {
  if (!Number.isInteger(n) || n < 1 || n > total) throw new Error(`cannot pick ${n} of ${total} frames`)
  if (loop) return Array.from({ length: n }, (_, k) => Math.floor((k * total) / n))
  if (n === 1) return [total - 1]
  return Array.from({ length: n }, (_, k) => Math.round((k * (total - 1)) / (n - 1)))
}

/** The value at quantile `q` of everything `each` visits, to 1/4096 of the maximum; 0 if none is positive. */
export function quantile(each: (visit: (x: number) => void) => void, q: number): number {
  let max = 0, n = 0
  each((x) => { if (x > max) max = x; n++ })
  if (n === 0 || !(max > 0)) return 0
  const BINS = 4096, hist = new Uint32Array(BINS)
  each((x) => { hist[Math.min(BINS - 1, Math.floor((x / max) * BINS))]!++ })
  let acc = 0
  for (let b = 0; b < BINS; b++) { acc += hist[b]!; if (acc >= q * n) return ((b + 1) / BINS) * max }
  return max
}

/** Ruling R6: maps the sheet's 99.9th-percentile covered lit value to 1. */
export function litScale(frames: readonly FramePasses[]): number {
  const p = quantile((visit) => {
    for (const f of frames) for (const pass of PASSES) { const L = f.lit[pass]; for (let i = 0; i < L.length; i++) if (f.alpha[i]! > COVERED) visit(L[i]!) }
  }, 0.999)
  if (!(p > 0)) throw new Error('the sheet has no lit, covered texel')
  return 1 / p
}
/** Task 5c (plan E2 ledger ruling, "emission soft knee at p75"): emission is heavy-tailed, so
 *  instead of R6's linear 99.9th-percentile map (which leaves nearly every emitting texel a faint
 *  ember and clips the rare hot ones), the knee is the sheet's 75th percentile of raw emitting
 *  values. Paired with encodeEmit below. 0 for a sheet that emits nothing. */
export function emitKnee(frames: readonly FramePasses[]): number {
  return quantile((visit) => { for (const f of frames) for (let i = 0; i < f.emit.length; i++) if (f.emit[i]! > 0) visit(f.emit[i]!) }, 0.75)
}
/** Soft knee (plan E2 ledger ruling, Task 5c: emission soft knee at p75): e = 1 - exp(-v/k), so a
 *  raw value at the knee encodes to 1 - 1/e ~ 0.632 instead of clipping, and the heavy tail
 *  compresses gently instead of being thrown away. 0 if the sheet emits nothing (knee <= 0) or v
 *  is not positive. */
export function encodeEmit(v: number, knee: number): number {
  return knee > 0 && v > 0 ? 1 - Math.exp(-v / knee) : 0
}

/** Ruling R7: n + k consecutive frames become n that loop. Frame i < k blends frame n + i into
 *  frame i, so the kept last frame (n - 1) leads naturally into the new frame 0 (mostly frame n). */
export function crossfadeLoop(frames: readonly FramePasses[], k: number): FramePasses[] {
  const n = frames.length - k
  if (k < 1 || n < k) throw new Error(`cannot loop ${frames.length} frames with a ${k}-frame blend`)
  const mix = (a: Float32Array, b: Float32Array, w: number): Float32Array => {
    const o = new Float32Array(a.length)
    for (let i = 0; i < a.length; i++) o[i] = a[i]! * (1 - w) + b[i]! * w
    return o
  }
  return frames.slice(0, n).map((f, i) => {
    if (i >= k) return f
    const tail = frames[n + i]!, w = (i + 0.5) / k // weight of the original frame i
    const lit = Object.fromEntries(PASSES.map((p) => [p, mix(tail.lit[p], f.lit[p], w)])) as Record<Pass, Float32Array>
    return { lit, alpha: mix(tail.alpha, f.alpha, w), emit: mix(tail.emit, f.emit, w) }
  })
}

const byte = (x: number): number => Math.round((x < 0 ? 0 : x > 1 ? 1 : x) * 255)
const isBorder = (x: number, y: number, cellPx: number, band: number): boolean =>
  x < band || y < band || x >= cellPx - band || y >= cellPx - band

export function packCell(f: FramePasses, cellPx: number, litK: number, emitKnee: number): { readonly a: Uint8Array; readonly b: Uint8Array } {
  const n = cellPx * cellPx, a = new Uint8Array(n * 4), b = new Uint8Array(n * 4)
  for (let y = 0; y < cellPx; y++) for (let x = 0; x < cellPx; x++) {
    if (isBorder(x, y, cellPx, BORDER)) continue
    const i = y * cellPx + x, o = i * 4
    a[o] = byte(f.lit.right[i]! * litK); a[o + 1] = byte(f.lit.left[i]! * litK); a[o + 2] = byte(f.lit.top[i]! * litK); a[o + 3] = byte(f.alpha[i]!)
    b[o] = byte(f.lit.bottom[i]! * litK); b[o + 1] = byte(f.lit.back[i]! * litK); b[o + 2] = byte(f.lit.front[i]! * litK); b[o + 3] = byte(encodeEmit(f.emit[i]!, emitKnee))
  }
  return { a, b }
}

export type Flow = { readonly dx: Float32Array; readonly dy: Float32Array }

function sample(img: Float32Array, w: number, h: number, x: number, y: number): number {
  const cx = Math.max(0, Math.min(w - 1.001, x - 0.5)), cy = Math.max(0, Math.min(h - 1.001, y - 0.5))
  const x0 = Math.floor(cx), y0 = Math.floor(cy), fx = cx - x0, fy = cy - y0
  const p = (xx: number, yy: number) => img[yy * w + xx]!
  return (p(x0, y0) * (1 - fx) + p(x0 + 1, y0) * fx) * (1 - fy) + (p(x0, y0 + 1) * (1 - fx) + p(x0 + 1, y0 + 1) * fx) * fy
}
function blur(src: Float32Array, w: number, h: number): Float32Array {
  const K = [1, 4, 6, 4, 1], t = new Float32Array(w * h), o = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0
    for (let k = -2; k <= 2; k++) s += K[k + 2]! * src[y * w + Math.max(0, Math.min(w - 1, x + k))]!
    t[y * w + x] = s / 16
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0
    for (let k = -2; k <= 2; k++) s += K[k + 2]! * t[Math.max(0, Math.min(h - 1, y + k)) * w + x]!
    o[y * w + x] = s / 16
  }
  return o
}
function halve(src: Float32Array, w: number, h: number): Float32Array {
  const hw = w >> 1, hh = h >> 1, o = new Float32Array(hw * hh)
  for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
    const i = 2 * y * w + 2 * x
    o[y * hw + x] = (src[i]! + src[i + 1]! + src[i + w]! + src[i + w + 1]!) / 4
  }
  return o
}
/** Sum over the (2r+1)² window around each texel, clamped at the edges, by an integral image. */
function boxSum(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const I = new Float64Array((w + 1) * (h + 1))
  for (let y = 0; y < h; y++) { let row = 0; for (let x = 0; x < w; x++) { row += src[y * w + x]!; I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1]! + row } }
  const o = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1)
    o[y * w + x] = I[y1 * (w + 1) + x1]! - I[y0 * (w + 1) + x1]! - I[y1 * (w + 1) + x0]! + I[y0 * (w + 1) + x0]!
  }
  return o
}

/** Dense iterative Lucas–Kanade: forward flow in texels such that next(p + d) ≈ prev(p). */
export function lucasKanade(prev: Float32Array, next: Float32Array, w: number, h: number, init: Flow | null, radius = 4, iterations = 3): Flow {
  const n = w * h, P = blur(prev, w, h), N = blur(next, w, h)
  const ix = new Float32Array(n), iy = new Float32Array(n)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x
    ix[i] = (P[y * w + Math.min(w - 1, x + 1)]! - P[y * w + Math.max(0, x - 1)]!) / 2
    iy[i] = (P[Math.min(h - 1, y + 1) * w + x]! - P[Math.max(0, y - 1) * w + x]!) / 2
  }
  const sxx = boxSum(ix.map((g) => g * g), w, h, radius), syy = boxSum(iy.map((g) => g * g), w, h, radius)
  const sxy = boxSum(ix.map((g, i) => g * iy[i]!), w, h, radius)
  const dx = init ? Float32Array.from(init.dx) : new Float32Array(n), dy = init ? Float32Array.from(init.dy) : new Float32Array(n)
  const tx = new Float32Array(n), ty = new Float32Array(n)
  for (let it = 0; it < iterations; it++) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x, e = sample(N, w, h, x + 0.5 + dx[i]!, y + 0.5 + dy[i]!) - P[i]!
      tx[i] = ix[i]! * e; ty[i] = iy[i]! * e
    }
    const bx = boxSum(tx, w, h, radius), by = boxSum(ty, w, h, radius)
    for (let i = 0; i < n; i++) {
      const det = sxx[i]! * syy[i]! - sxy[i]! * sxy[i]!
      if (!(det > 1e-9)) continue // no texture here: leave the estimate alone
      dx[i]! -= (syy[i]! * bx[i]! - sxy[i]! * by[i]!) / det
      dy[i]! -= (sxx[i]! * by[i]! - sxy[i]! * bx[i]!) / det
    }
  }
  return { dx, dy }
}

/** Two levels: the half-resolution flow, doubled, seeds the full-resolution solve. */
export function pyramidFlow(prev: Float32Array, next: Float32Array, w: number, h: number): Flow {
  if (w < 32 || h < 32 || w % 2 || h % 2) return lucasKanade(prev, next, w, h, null)
  const hw = w >> 1, hh = h >> 1
  const coarse = lucasKanade(halve(prev, w, h), halve(next, w, h), hw, hh, null)
  const dx = new Float32Array(w * h), dy = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const j = Math.min(hh - 1, y >> 1) * hw + Math.min(hw - 1, x >> 1)
    dx[y * w + x] = coarse.dx[j]! * 2; dy[y * w + x] = coarse.dy[j]! * 2
  }
  return lucasKanade(prev, next, w, h, { dx, dy })
}

/** Forward flow from each frame to the next, on the coverage-weighted front-lit signal. The
 *  last frame repeats its predecessor's flow, or, in a loop, flows into frame 0. */
export function flowSequence(frames: readonly FramePasses[], cellPx: number, litK: number, loop: boolean): Flow[] {
  const signal = frames.map((f) => f.alpha.map((a, i) => a * (0.5 + 0.5 * Math.min(1, f.lit.front[i]! * litK))))
  const out: Flow[] = []
  for (let k = 0; k < frames.length; k++) {
    const next = k + 1 < frames.length ? signal[k + 1] : loop ? signal[0] : undefined
    out.push(next ? pyramidFlow(signal[k]!, next, cellPx, cellPx) : out[k - 1] ?? { dx: new Float32Array(cellPx * cellPx), dy: new Float32Array(cellPx * cellPx) })
  }
  return out
}
/** One manifest motionScale for every sheet: the 99th percentile of moving texels' speed, in cell UV. */
export function motionScaleOf(flows: readonly Flow[], cellPx: number): number {
  const p = quantile((visit) => {
    for (const f of flows) for (let i = 0; i < f.dx.length; i++) { const s = Math.hypot(f.dx[i]!, f.dy[i]!); if (s > 0) visit(s / cellPx) }
  }, 0.99)
  return Math.max(0.005, p)
}
export function encodeMotion(flow: Flow, cellPx: number, motionScale: number): Uint8Array {
  const o = new Uint8Array(cellPx * cellPx * 4)
  for (let y = 0; y < cellPx; y++) for (let x = 0; x < cellPx; x++) {
    const i = y * cellPx + x, q = i * 4
    const border = isBorder(x, y, cellPx, BORDER)
    o[q] = border ? 128 : byte(0.5 + flow.dx[i]! / cellPx / (2 * motionScale))
    o[q + 1] = border ? 128 : byte(0.5 + flow.dy[i]! / cellPx / (2 * motionScale))
    o[q + 2] = 0; o[q + 3] = 255
  }
  return o
}

export type SheetMetrics = {
  readonly coverageByFrame: readonly number[]
  /** Largest covered bounding-box side over all frames, over the cell size: E1's placeholder "fill". */
  readonly fill: number
  readonly edgeAlpha: number
  readonly emitMeanByFrame: readonly number[]
  readonly emitFrames: number
  /** Height over width of the covered box at the frame of peak coverage. */
  readonly aspectAtPeak: number
  readonly seam: number
  readonly step: number
  /** Mean normalized lit value on the named side minus the opposite side, about the coverage centroid, at peak coverage. */
  readonly sixWay: Readonly<Record<'right' | 'left' | 'top' | 'bottom', number>>
}

export function measureSheet(frames: readonly FramePasses[], cellPx: number, litK: number, emitKnee: number): SheetMetrics {
  const coverageByFrame: number[] = [], emitMeanByFrame: number[] = []
  let fill = 0, edgeAlpha = 0, peak = 0, peakAt = 0
  const boxes: { w: number; h: number }[] = []
  frames.forEach((f, k) => {
    let covered = 0, x0 = cellPx, x1 = -1, y0 = cellPx, y1 = -1, emit = 0
    for (let y = 0; y < cellPx; y++) for (let x = 0; x < cellPx; x++) {
      const i = y * cellPx + x, a = f.alpha[i]!
      if (isBorder(x, y, cellPx, EDGE_BAND)) edgeAlpha = Math.max(edgeAlpha, a)
      if (a <= COVERED) continue
      covered++; emit += encodeEmit(f.emit[i]!, emitKnee)
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
    }
    const w = x1 < 0 ? 0 : x1 - x0 + 1, h = y1 < 0 ? 0 : y1 - y0 + 1
    boxes.push({ w, h })
    fill = Math.max(fill, Math.max(w, h) / cellPx)
    coverageByFrame.push(covered / (cellPx * cellPx))
    emitMeanByFrame.push(covered > 0 ? emit / covered : 0)
    if (covered > peak) { peak = covered; peakAt = k }
  })
  const pf = frames[peakAt]!
  // Each sun's own local brightening toward it (plan E2 ledger ruling, Task 4 fix round 2). Round 1's
  // half-split (either single-pass, or a pair's differential) measured a global region, so a wide,
  // low-contrast base could swamp a small, high-contrast tip (the vase test below) -- but a paired
  // differential turned out to score right/left and top/bottom as a SUM (diffMean(a,b,half) -
  // diffMean(a,b,!half) algebraically equals old_a + old_b), so a single mis-rotated sun rode in on
  // its healthy partner and was accepted, and the failure message named both sides of the pair, never
  // the one actually wrong (measured 2026-09-27: injecting a single rotated sun into the real smoke
  // and dust renders was accepted by round 1; the paired sum canceled nothing). Instead, score side s
  // by whether its OWN pass gets brighter as you step a short distance toward s's sun, per covered
  // texel pair: right/left step in +-x, top/bottom in -+y (row 0 is the top). This is local (no global
  // half split), so it can't be swamped by an unrelated region, and it is scored per sun, so only the
  // actually-misrotated side fails.
  const DIR: Readonly<Record<'right' | 'left' | 'top' | 'bottom', readonly [number, number]>> = {
    right: [1, 0], left: [-1, 0], top: [0, -1], bottom: [0, 1],
  }
  const st = Math.max(1, Math.round(cellPx / 32))
  const localBrighten = (L: Float32Array, [dx, dy]: readonly [number, number]): number => {
    let s = 0, n = 0
    for (let y = 0; y < cellPx; y++) for (let x = 0; x < cellPx; x++) {
      const i = y * cellPx + x
      if (!(pf.alpha[i]! > COVERED)) continue
      const qx = x + dx * st, qy = y + dy * st
      if (qx < 0 || qx >= cellPx || qy < 0 || qy >= cellPx) continue
      const j = qy * cellPx + qx
      if (!(pf.alpha[j]! > COVERED)) continue
      s += (L[j]! - L[i]!) * litK; n++
    }
    return n > 0 ? s / n : 0
  }
  const sixWay = {
    right: localBrighten(pf.lit.right, DIR.right),
    left: localBrighten(pf.lit.left, DIR.left),
    top: localBrighten(pf.lit.top, DIR.top),
    bottom: localBrighten(pf.lit.bottom, DIR.bottom),
  }
  const meanAbs = (a: Float32Array, b: Float32Array): number => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i]! - b[i]!); return s / a.length }
  let step = 0
  for (let k = 0; k + 1 < frames.length; k++) step += meanAbs(frames[k]!.alpha, frames[k + 1]!.alpha)
  step /= Math.max(1, frames.length - 1)
  const box = boxes[peakAt]!
  return {
    coverageByFrame, fill, edgeAlpha, emitMeanByFrame, emitFrames: emitMeanByFrame.filter((e) => e > 0.05).length,
    aspectAtPeak: box.w > 0 ? box.h / box.w : 0, seam: meanAbs(frames.at(-1)!.alpha, frames[0]!.alpha), step, sixWay,
  }
}

/** Every rule a baked sheet must pass; each failure is one sentence. [] = ship it. */
export function acceptance(sheet: FxSheetName, m: SheetMetrics, frames: number): string[] {
  const out: string[] = []
  const peak = Math.max(...m.coverageByFrame)
  if (peak < 0.05) out.push(`${sheet}: peak coverage ${peak.toFixed(3)} is under 0.05`)
  if (!(m.coverageByFrame[0]! > 0)) out.push(`${sheet}: frame 0 is empty, so a triggered effect would start invisible`)
  if (m.edgeAlpha > EDGE_ALPHA_MAX) out.push(`${sheet}: alpha ${m.edgeAlpha.toFixed(2)} within ${EDGE_BAND} texels of the cell edge; the sim leaves the frame`)
  if (m.fill < 0.45 || m.fill > 0.95) out.push(`${sheet}: fill ${m.fill.toFixed(2)} is outside 0.45..0.95`)
  for (const side of ['right', 'left', 'top', 'bottom'] as const) {
    if (!(m.sixWay[side] >= 0.01)) out.push(`${sheet}: the ${side} light does not brighten the ${side} side (${m.sixWay[side].toFixed(3)})`)
  }
  const peakEmit = Math.max(...m.emitMeanByFrame)
  if (sheet === 'fireball') {
    if (m.emitFrames < 0.25 * frames) out.push(`fireball: emits in only ${m.emitFrames} of ${frames} frames`)
    if (m.emitMeanByFrame.at(-1)! > 0.25 * peakEmit) out.push('fireball: does not burn out; last-frame emission is over a quarter of its peak')
  } else if (sheet === 'flame') {
    if (m.emitFrames !== frames) out.push(`flame: emits in ${m.emitFrames} of ${frames} frames; a steady flame emits in all`)
  } else if (m.emitFrames !== 0) {
    out.push(`${sheet}: emits light in ${m.emitFrames} frames; only fireball and flame may`)
  }
  if (sheet === 'water-column' && m.aspectAtPeak < 1.5) out.push(`water-column: must be taller than it is wide (height/width ${m.aspectAtPeak.toFixed(2)}, want at least 1.5)`)
  if (LOOPING.includes(sheet) && m.seam > 1.5 * m.step) out.push(`${sheet}: loop seam ${m.seam.toFixed(4)} is over 1.5 x the mean step ${m.step.toFixed(4)}`)
  return out
}
