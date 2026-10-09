// tools/models/skin/compose.ts
import type { Painted } from './layers.js'
import type { Sidecar } from './sidecar.js'
import { linearToSrgb8 } from './colors.js'
import type { BakeMaps } from './bake.js'

export interface SkinMaps { readonly size: number; readonly baseColor: Uint8Array; readonly metallicRoughness: Uint8Array; readonly normal: Uint8Array }

const NEUTRAL = { base: [128, 128, 128], mr: [255, 230, 0], nrm: [128, 128, 255] } as const
/** Normal tilt per groove unit of height change per texel (layers.ts: height is in groove units). */
export const NORMAL_GAIN = 1
/** M1c: how much of a committed bake's occlusion darkens the paint (1 = all of it). ESTIMATE, by eye in the Hangar. */
export const AO_STRENGTH = 0.85
const byte = (x: number): number => Math.round(Math.min(1, Math.max(0, x)) * 255)

/**
 * The 2x samples down to atlas texels (covered samples averaged), height to a tangent-space
 * normal (glTF convention: +x toward +u, +y toward -v, the top of the image), blended with the
 * scan normal (whiteout), encoded; then `paddingPx` rounds of dilation, each uncovered texel
 * copying its first covered neighbor (left, right, up, down) from the round before, so padding
 * holds its own patch (Review Focus 4). What is still uncovered gets a neutral value.
 */
export function compose(p: Painted, side: Sidecar, atlasPx: number, bake: BakeMaps | null = null): SkinMaps {
  if (bake && bake.size !== atlasPx) throw new Error(`compose: the bake is ${bake.size} px, the atlas ${atlasPx} px`)
  // M1c: the bake paints only the patches the sidecar lists (no overlapping chart: its texels are one surface's).
  const baked = new Set(bake ? side.baked ?? [] : [])
  const W = atlasPx, S = p.size / W, n = W * W
  if (!Number.isInteger(S) || S < 1) throw new Error(`compose: sample grid ${p.size} is not a multiple of the ${W} px atlas`)
  const covered = new Uint8Array(n), patch = new Int32Array(n).fill(-1)
  const color = new Float32Array(3 * n), rough = new Float32Array(n), metal = new Float32Array(n), height = new Float32Array(n), sn = new Float32Array(3 * n)
  for (let ty = 0; ty < W; ty++) for (let tx = 0; tx < W; tx++) {
    const t = ty * W + tx
    let c = 0
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const i = (ty * S + sy) * p.size + tx * S + sx
      if (!p.covered[i]) continue
      if (c === 0) patch[t] = p.patch[i]!
      c++
      for (let k = 0; k < 3; k++) { color[3 * t + k]! += p.color[3 * i + k]!; sn[3 * t + k]! += p.scanN[3 * i + k]! }
      rough[t]! += p.rough[i]!; metal[t]! += p.metal[i]!; height[t]! += p.height[i]!
    }
    if (c === 0) continue
    covered[t] = 1
    for (let k = 0; k < 3; k++) { color[3 * t + k]! /= c; sn[3 * t + k]! /= c }
    rough[t]! /= c; metal[t]! /= c; height[t]! /= c
  }
  const baseColor = new Uint8Array(3 * n), metallicRoughness = new Uint8Array(3 * n), normal = new Uint8Array(3 * n)
  const same = (t: number, dx: number, dy: number): number => {
    const x = (t % W) + dx, y = Math.floor(t / W) + dy
    if (x < 0 || y < 0 || x >= W || y >= W) return -1
    const o = y * W + x
    return covered[o] && patch[o] === patch[t] ? o : -1
  }
  const slope = (t: number, dx: number, dy: number): number => {
    const a = same(t, -dx, -dy), b = same(t, dx, dy)
    if (a >= 0 && b >= 0) return (NORMAL_GAIN * (height[b]! - height[a]!)) / 2
    if (b >= 0) return NORMAL_GAIN * (height[b]! - height[t]!)
    if (a >= 0) return NORMAL_GAIN * (height[t]! - height[a]!)
    return 0
  }
  for (let t = 0; t < n; t++) {
    if (!covered[t]) continue
    const inBake = baked.has(patch[t]!)
    // M1c: occlusion multiplies the linear paint, before the sRGB encode.
    const occ = inBake ? 1 - AO_STRENGTH * (1 - bake!.ao[3 * t]! / 255) : 1
    for (let k = 0; k < 3; k++) baseColor[3 * t + k] = linearToSrgb8(color[3 * t + k]! * occ)
    metallicRoughness[3 * t] = 255; metallicRoughness[3 * t + 1] = byte(rough[t]!); metallicRoughness[3 * t + 2] = byte(metal[t]!)
    // height normal: dh/du along +x (image right), dh/dv along +y (image down); glTF +y is image up
    let hx = -slope(t, 1, 0), hy = slope(t, 0, 1), hz = 1
    const hl = Math.sqrt(hx * hx + hy * hy + hz * hz); hx /= hl; hy /= hl; hz /= hl
    let sx = sn[3 * t]!, sy = sn[3 * t + 1]!, sz = sn[3 * t + 2]!
    const sl = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1; sx /= sl; sy /= sl; sz /= sl
    let nx = hx + sx, ny = hy + sy, nz = hz * sz
    if (inBake) { // M1c: the baked detail normal, whiteout-blended over the painted one (the same convention: +y up the image)
      const bx = bake!.normal[3 * t]! / 127.5 - 1, by = bake!.normal[3 * t + 1]! / 127.5 - 1, bz = bake!.normal[3 * t + 2]! / 127.5 - 1
      nx += bx; ny += by; nz *= Math.max(bz, 0.05)
    }
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz); nx /= nl; ny /= nl; nz /= nl
    normal[3 * t] = byte(nx * 0.5 + 0.5); normal[3 * t + 1] = byte(ny * 0.5 + 0.5); normal[3 * t + 2] = byte(nz * 0.5 + 0.5)
  }
  for (let round = 0; round < side.paddingPx; round++) {
    const was = covered.slice()
    for (let t = 0; t < n; t++) {
      if (was[t]) continue
      const x = t % W, y = (t - x) / W
      const from = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].find(([a, b]) => a! >= 0 && b! >= 0 && a! < W && b! < W && was[b! * W + a!])
      if (!from) continue
      const o = from[1]! * W + from[0]!
      for (let k = 0; k < 3; k++) { baseColor[3 * t + k] = baseColor[3 * o + k]!; metallicRoughness[3 * t + k] = metallicRoughness[3 * o + k]!; normal[3 * t + k] = normal[3 * o + k]! }
      covered[t] = 1; patch[t] = patch[o]!
    }
  }
  for (let t = 0; t < n; t++) {
    if (covered[t]) continue
    for (let k = 0; k < 3; k++) { baseColor[3 * t + k] = NEUTRAL.base[k]!; metallicRoughness[3 * t + k] = NEUTRAL.mr[k]!; normal[3 * t + k] = NEUTRAL.nrm[k]! }
  }
  return { size: W, baseColor, metallicRoughness, normal }
}
