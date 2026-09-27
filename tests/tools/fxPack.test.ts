import { describe, expect, it } from 'vitest'
import {
  acceptance, crossfadeLoop, encodeMotion, litScale, measureSheet, mipLevels, packCell, pickFrames, pyramidFlow, type FramePasses,
} from '../../tools/fx/pack.js'

const C = 64
/** A soft disc of radius r texels centered at (cx, cy), row 0 at the top. */
function disc(cx: number, cy: number, r: number): Float32Array {
  const a = new Float32Array(C * C)
  for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r
    a[y * C + x] = d < 1 ? Math.min(1, (1 - d) * 3) : 0
  }
  return a
}
/** A lit ball: each lit pass is brighter on the side it is named for, unless `flip`. */
function frame(cx: number, cy: number, r: number, o: { emit?: number | undefined; flip?: boolean | undefined; alpha?: Float32Array | undefined } = {}): FramePasses {
  const alpha = o.alpha ?? disc(cx, cy, r)
  const side = (sx: number, sy: number): Float32Array => {
    const L = new Float32Array(C * C)
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      const i = y * C + x, nx = (x + 0.5 - cx) / r, ny = (cy - (y + 0.5)) / r
      L[i] = alpha[i]! > 0 ? 0.3 + 0.2 * (sx * nx + sy * ny) : 0
    }
    return L
  }
  const f = o.flip ? -1 : 1
  return {
    lit: { right: side(f, 0), left: side(-f, 0), top: side(0, 1), bottom: side(0, -1), back: side(0, 0), front: side(0, 0) },
    alpha, emit: alpha.map((v) => v * (o.emit ?? 0)),
  }
}
/** A rising, growing puff: stays inside the frame, fill 0.625. */
const puff = (n = 16, o: { emit?: (k: number) => number; flip?: boolean } = {}): FramePasses[] =>
  Array.from({ length: n }, (_, k) => frame(32, 38 - k * 0.5, 8 + k * 0.8, { emit: o.emit?.(k), flip: o.flip }))
const judge = (sheet: Parameters<typeof acceptance>[0], frames: FramePasses[]): string[] => {
  const k = litScale(frames)
  return acceptance(sheet, measureSheet(frames, C, k, frames.some((f) => f.emit.some((v) => v > 0)) ? 1 : 0), frames.length)
}

describe('fx pack: frames and mips (plan E2 Rulings R5, R7)', () => {
  it('picks frames evenly with both ends for a one-shot sheet, and without the end for a loop', () => {
    expect(pickFrames(64, 64)).toEqual(Array.from({ length: 64 }, (_, k) => k))
    const p = pickFrames(64, 48)
    expect([p[0], p.at(-1), p.length]).toEqual([0, 63, 48])
    const l = pickFrames(64, 48, true)
    expect([l[0], l.length]).toEqual([0, 48])
    expect(l.at(-1)).toBeLessThan(63) // the loop's last frame leads back into frame 0, not onto it
    expect(() => pickFrames(8, 9)).toThrow()
  })
  it('stops the mip chain at an 8 to 12 px cell', () => {
    expect([mipLevels(256), mipLevels(192), mipLevels(128)]).toEqual([6, 5, 5])
  })
})

describe('fx pack: channels (E1 Ruling R7, verbatim)', () => {
  it('packs A = right, left, top, alpha and B = bottom, back, front, emission, with a zero border', () => {
    const u = (v: number) => new Float32Array(C * C).fill(v)
    const f: FramePasses = { lit: { right: u(0.1), left: u(0.2), top: u(0.3), bottom: u(0.4), back: u(0.5), front: u(0.6) }, alpha: u(1), emit: u(0.8) }
    const { a, b } = packCell(f, C, 1, 1)
    const at = (img: Uint8Array, x: number, y: number) => Array.from(img.slice((y * C + x) * 4, (y * C + x) * 4 + 4))
    expect(at(a, 32, 32)).toEqual([26, 51, 77, 255])
    expect(at(b, 32, 32)).toEqual([102, 128, 153, 204])
    for (const [x, y] of [[0, 0], [1, 32], [63, 10], [20, 62]] as const) { expect(at(a, x, y)).toEqual([0, 0, 0, 0]); expect(at(b, x, y)).toEqual([0, 0, 0, 0]) }
  })
  it('normalizes a sheet so its 99.9th-percentile lit value is 1 (Ruling R6)', () => {
    const f = frame(32, 32, 20)
    for (const L of Object.values(f.lit)) for (let i = 0; i < L.length; i++) if (f.alpha[i]! > 0) L[i] = (i % 1000) / 999
    expect(litScale([f])).toBeGreaterThan(0.99)
    expect(litScale([f])).toBeLessThan(1.02)
  })
})

describe('fx pack: motion by optical flow (Ruling R3)', () => {
  /** A textured blob moved by (sx, sy) texels: content moves right and down for positive values. */
  const textured = (sx: number, sy: number): Float32Array => {
    const s = new Float32Array(C * C)
    for (let y = 0; y < C; y++) for (let x = 0; x < C; x++) {
      const u = x + 0.5 - sx, v = y + 0.5 - sy
      const d = Math.hypot(u - 32, v - 32) / 18
      s[y * C + x] = d < 1 ? (1 - d) * (0.6 + 0.4 * Math.sin(u * 0.7) * Math.cos(v * 0.5)) : 0
    }
    return s
  }
  const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)]!
  for (const [sx, sy, tol] of [[1.5, -1, 0.25], [4, 2, 0.5]] as const) {
    it(`recovers a (${sx}, ${sy}) texel shift within ${tol}`, () => {
      const prev = textured(0, 0), flow = pyramidFlow(prev, textured(sx, sy), C, C)
      const dx: number[] = [], dy: number[] = []
      for (let i = 0; i < C * C; i++) if (prev[i]! > 0.3) { dx.push(flow.dx[i]!); dy.push(flow.dy[i]!) }
      expect(Math.abs(median(dx) - sx)).toBeLessThan(tol)
      expect(Math.abs(median(dy) - sy)).toBeLessThan(tol)
    })
  }
  it('encodes motion as cell UV about 0.5, with a neutral border', () => {
    const n = C * C, flow = { dx: new Float32Array(n).fill(0.02 * C), dy: new Float32Array(n).fill(-0.01 * C) }
    const m = encodeMotion(flow, C, 0.02)
    const i = (32 * C + 32) * 4
    expect([m[i], m[i + 1], m[i + 2], m[i + 3]]).toEqual([255, 64, 0, 255])
    expect([m[0], m[1]]).toEqual([128, 128])
  })
})

describe('fx pack: acceptance (Review Focus 3, 4, 5)', () => {
  it('a well-framed, correctly lit smoke puff passes', () => {
    expect(judge('smoke', puff())).toEqual([])
  })
  it('refuses a sheet whose right and left lights are swapped (Review Focus 3)', () => {
    expect(judge('smoke', puff(16, { flip: true })).join('\n')).toMatch(/right light .* right side/)
  })
  it('refuses a sim that leaves the frame (Review Focus 4)', () => {
    const leaks = puff().map((f, k) => (k === 15 ? frame(32, 26, 29) : f))
    expect(judge('smoke', leaks).join('\n')).toMatch(/leaves the frame/)
  })
  it('refuses light from a sheet that must not emit, and a fireball that never burns out', () => {
    expect(judge('smoke', puff(16, { emit: () => 0.5 })).join('\n')).toMatch(/emits light/)
    expect(judge('fireball', puff(16, { emit: () => 0.5 })).join('\n')).toMatch(/does not burn out/)
    expect(judge('fireball', puff(16, { emit: (k) => (k < 6 ? 0.8 : 0) }))).toEqual([])
  })
  it('refuses a squat water column', () => {
    expect(judge('water-column', puff()).join('\n')).toMatch(/taller than it is wide/)
  })
  it('crossfading fixes a drifting flame loop (Review Focus 5)', () => {
    const drift = Array.from({ length: 24 }, (_, k) => frame(32, 32, 10 + k * 0.5, { emit: 0.6 }))
    expect(judge('flame', drift.slice(0, 16)).join('\n')).toMatch(/loop seam/)
    expect(judge('flame', crossfadeLoop(drift, 8))).toEqual([])
  })
})
