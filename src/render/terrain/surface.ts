import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat } from 'three'
import { color, float, length, max, min, mix, smoothstep, texture, uniform, vec2, vec3 } from 'three/tsl'
import type { Node, UniformNode } from 'three/webgpu'
import { riverMask } from './rivers.js'
import { coverByteLength, type CoverHeader } from '../landcover/cover.js'

export type CoverNodes = {
  readonly texture: DataTexture
  /** 0 until `setCover` has data; the shader blends to the raster on 1. */
  readonly ready: UniformNode<'float', number>
  readonly halfExtentM: number
  /** Metres between adjacent samples: `(samples - 1)` cells span the full
   *  `2 * halfExtentM` width, the same node-centred convention as the
   *  terrain's own grid (`mesh.ts`'s `sampleField`). */
  readonly step: number
  readonly samples: number
}

/** The raster texture, zero-filled until the fetch lands, as the terrain
 *  height textures are (mesh.ts). Linear filtering is the whole reason the
 *  raster carries fractions rather than a class index. */
export function createCoverNodes(header: CoverHeader): CoverNodes {
  const tex = new DataTexture(new Uint8Array(coverByteLength(header)), header.samples, header.samples, RGBAFormat)
  tex.name = 'ESA-WorldCover-coverage-fractions'
  tex.minFilter = LinearMipmapLinearFilter
  tex.magFilter = LinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return {
    texture: tex,
    ready: uniform(0),
    halfExtentM: header.halfExtentM,
    step: (2 * header.halfExtentM) / (header.samples - 1),
    samples: header.samples,
  }
}

/** Original, deterministic, seamless detail. Channels carry independent
 * scales of noise; this is material detail, not a land-cover dataset. */
export function createDetailTexture(size = 256): DataTexture {
  const hash = (x: number, y: number, seed: number): number => {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
  }
  const noise = (x: number, y: number, cells: number, seed: number): number => {
    const px = x * cells / size, py = y * cells / size
    const ix = Math.floor(px), iy = Math.floor(py)
    const sx = px - ix, sy = py - iy
    const fx = sx * sx * (3 - 2 * sx), fy = sy * sy * (3 - 2 * sy)
    const h = (dx: number, dy: number) => hash((ix + dx) % cells, (iy + dy) % cells, seed)
    return (h(0, 0) * (1 - fx) + h(1, 0) * fx) * (1 - fy) +
      (h(0, 1) * (1 - fx) + h(1, 1) * fx) * fy
  }
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4
    data[i] = Math.round(noise(x, y, 8, 1939) * 255)
    data[i + 1] = Math.round(noise(x, y, 32, 1944) * 255)
    data[i + 2] = Math.round(noise(x, y, 64, 1945) * 255)
    data[i + 3] = 255
  }
  const tex = new DataTexture(data, size, size, RGBAFormat)
  tex.name = 'procedural-ground-detail'
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.minFilter = LinearMipmapLinearFilter
  tex.magFilter = LinearFilter
  tex.generateMipmaps = true
  // Deliberately NO anisotropic filtering. Codex shipped `anisotropy = 8`
  // here, and with nine lookups of this texture per fragment it was two
  // thirds of the GPU frame at 1440p: 8.98 ms with it, 3.80 ms without, on a
  // frame that was 3.15 ms before any of this existed (measured 2026-09-17,
  // serialized GPU timestamps, the table is in tests/render/scenery.test.ts).
  // Screenshots down the runway at 8 and at 1 are indistinguishable, because
  // 8- to 64-cell value noise on a 256-texel tile has no fine structure for
  // anisotropy to preserve. three's default is 1; the guard test pins it.
  tex.needsUpdate = true
  return tex
}

const detail = createDetailTexture()

/** World-locked and mip-filtered: markings never move with the camera,
 * and subpixel grains disappear instead of sparkling on approach. */
export function groundNoise(xz: Node<'vec2'>, metres: number): Node<'vec4'> {
  return texture(detail, xz.div(metres))
}

/**
 * Terrain detail normal (photoreal Task 13, spec §4.5): the near ground's
 * lighting gets relief from the SAME value noise the albedo reads
 * (`createDetailTexture`), as a bump whose slope is taken by finite
 * differences -- three taps per scale -- at two scales, faded out with
 * distance so the far field, where the mesh's own normal carries the relief
 * and the noise would only shimmer, is untouched.
 *
 * Each scale is a channel of the detail tile: `cellM` is the noise's cell
 * (its feature wavelength), `amplitudeM` its height. The amplitudes are set
 * for a TYPICAL tilt of ~6 deg: neighboring value-noise samples differ by
 * ~0.35 on average, so a scale's typical slope is ~0.35 x 1.5 A / cell.
 * Sized from the worst case instead (smoothstep's peak gradient, 1.5 per
 * cell) the first cut read ~2-3 deg typical and its runway capture differed
 * from the flat one by 0.4 of 255 (2026-09-25). The combined slope is
 * CLAMPED to tan(`DETAIL_NORMAL_MAX_TILT_DEG`), the brief's "<= ~12 deg", so
 * the cap is a fact of the node, not of the arithmetic. Mip filtering
 * attenuates it further at grazing angles, which is where it would shimmer.
 */
export const DETAIL_NORMAL_SCALES = [
  { cellM: 8, amplitudeM: 1.3, channel: 'b', cells: 64 },
  { cellM: 40, amplitudeM: 7, channel: 'g', cells: 32 },
] as const
export const DETAIL_NORMAL_MAX_TILT_DEG = 12
const MAX_DETAIL_SLOPE = Math.tan((DETAIL_NORMAL_MAX_TILT_DEG * Math.PI) / 180)
export const DETAIL_NORMAL_NEAR_M = 500
export const DETAIL_NORMAL_FAR_M = 2000

/** 1 at <= 500 m, 0 at >= 2000 m, smoothstep between; finite for any input
 *  (NaN and negatives read as the near field). `detailNormalFadeNode` is its twin. */
export function detailNormalFade(distanceM: number): number {
  if (!(distanceM > DETAIL_NORMAL_NEAR_M)) return 1
  const t = Math.min(1, (distanceM - DETAIL_NORMAL_NEAR_M) / (DETAIL_NORMAL_FAR_M - DETAIL_NORMAL_NEAR_M))
  return 1 - t * t * (3 - 2 * t)
}
export function detailNormalFadeNode(distanceM: Node<'float'>): Node<'float'> {
  return float(1).sub(smoothstep(DETAIL_NORMAL_NEAR_M, DETAIL_NORMAL_FAR_M, distanceM))
}

/** The detail relief's slope (dh/dx, dh/dz) at a world point, in m/m. Each
 *  scale's lookup is rotated and offset from the albedo's so the bumps do not
 *  line up with the color patches. */
export function detailSlopeNode(xz: Node<'vec2'>): Node<'vec2'> {
  let slope: Node<'vec2'> = vec2(0, 0)
  for (const [i, { cellM, amplitudeM, channel, cells }] of DETAIL_NORMAL_SCALES.entries()) {
    const tileM = cellM * cells
    // A quarter-cell step: fine enough to follow the smoothstep, coarse
    // enough that the 8-bit texel steps do not read as noise.
    const h = cellM / 4
    const p = (i === 0 ? vec2(xz.y, xz.x.negate()) : vec2(xz.x.negate(), xz.y.negate())).add(311 * (i + 1))
    const at = (q: Node<'vec2'>): Node<'float'> => groundNoise(q, tileM)[channel]
    const n0 = at(p)
    const dx = at(p.add(vec2(h, 0))).sub(n0)
    const dz = at(p.add(vec2(0, h))).sub(n0)
    // Back from the rotated frame to world x/z: p.x = z, p.y = -x (scale 0);
    // p.x = -x, p.y = -z (scale 1).
    const world = i === 0 ? vec2(dz.negate(), dx) : vec2(dx.negate(), dz.negate())
    slope = slope.add(world.mul(amplitudeM / h))
  }
  return clampSlopeNode(slope)
}

/** Scales a slope vector down to at most tan(`DETAIL_NORMAL_MAX_TILT_DEG`);
 *  `clampDetailSlope` is its CPU twin. */
function clampSlopeNode(slope: Node<'vec2'>): Node<'vec2'> {
  return slope.mul(min(float(1), float(MAX_DETAIL_SLOPE).div(max(length(slope), 1e-6))))
}
export function clampDetailSlope(sx: number, sz: number): [number, number] {
  const m = Math.hypot(sx, sz)
  const k = m > MAX_DETAIL_SLOPE ? MAX_DETAIL_SLOPE / m : 1
  return [sx * k, sz * k]
}

export function terrainSurfaceNode(xz: Node<'vec2'>, height: Node<'float'>, slope: Node<'float'>, cover: CoverNodes): Node<'vec3'> {
  const macro = groundNoise(xz, 2800).r
  const patches = groundNoise(vec2(xz.y.negate(), xz.x).add(173), 610).g
  const canopy = groundNoise(xz, 180).g
  const grain = groundNoise(xz, 18).b
  const sand = mix(color(0x958567), color(0xd6c49b), groundNoise(xz, 95).g)
    .mul(grain.mul(0.16).add(0.92))
  const grass = mix(color(0x626746), color(0x89915b), patches).mul(grain.mul(0.15).add(0.94))
  const forest = mix(color(0x294534), color(0x546847), canopy)
    .mul(macro.mul(0.4).add(0.8))
  // Row 0 of the raster is north (z = -half) and DataTexture row 0 sits at
  // v = 0, so v grows with z and no flip is needed. The raster is
  // NODE-centred, not cell-centred: sample 0 sits exactly on the west/north
  // edge and `step = 2*halfExtentM/(samples-1)` ((samples-1) cells span the
  // full width) -- the terrain's own sample-aligned grid, handled correctly
  // and explicitly at mesh.ts's `sampleField` ("(samples-1) cells span the
  // full width"), and NOT the river mask's convention: `rivers.ts` builds a
  // CELL-centred mask spanning `width` with `uv = (x-minX)/width`, which is
  // right for that mask but wrong here. Sample i's texel centre is at
  // `uv = (i + 0.5) / samples`, not `i / (samples - 1)` -- the latter is off
  // by up to half a texel (up to 97.7 m of a 195.3 m cell), zero only at the
  // dead centre of the box (whole-branch review, 2026-09-18; guarded by the
  // node-centred relationship test beside `createTerrainMesh`'s cover test
  // in scenery.test.ts, since no headless TSL/GPU evaluator exists here to
  // check the expression itself). Fractions filter linearly.
  const uv = xz.add(cover.halfExtentM).div(cover.step).add(0.5).div(cover.samples)
  const fractions = texture(cover.texture, uv)
  // Before the raster arrives, or if it never does, the class weights are
  // Codex's noise-and-height rule from daa1b39. `forestWeight` reads only
  // `fractions.r` (tree) -- NOT `.r + .b` -- because mangrove has its own
  // independent weight below (design spec §"land classes", forest = tree
  // fraction, mangrove separately weighted); adding mangrove into
  // forestWeight as well double-counted it into both layers (review
  // 2026-09-18: tree=0.3/mangrove=0.3/open=0.4 landed at ~0.42 forest / 0.28
  // open / 0.30 mangrove instead of 0.3 / 0.4 / 0.3).
  const proceduralForest = max(smoothstep(0.38, 0.64, macro), smoothstep(70, 220, height))
  const forestWeight = mix(proceduralForest, fractions.r, cover.ready)
  const cropWeight = fractions.g.mul(cover.ready)
  const mangroveWeight = fractions.b.mul(cover.ready)
  const soil = mix(color(0x655644), color(0x8b795b), groundNoise(xz, 150).g)
  // Paddies: a pale yellow-green with the patch noise at field scale, so the
  // Leyte Valley reads as fields from 3,000 m, which is the job (design §1).
  const paddy = mix(color(0x8a9a4e), color(0xb8b56a), groundNoise(vec2(xz.y, xz.x.negate()), 240).g)
  const mangrove = color(0x24402a)
  // Soil patches blend in AFTER the grass/forest mix, weighted by
  // `1 - forestWeight`, exactly as daa1b39 did -- not before it, as an
  // earlier version of this function had it (via a `mix(grass, soil, ...)`
  // "open" term feeding into the forest mix). Blending the patches first
  // lets them show at up to 11.25% strength through the forest canopy at
  // forestWeight=0.5 (peak of forestWeight*(1-forestWeight)), which is a
  // soil patch showing through leaves -- wrong on the merits, and it also
  // broke the "identical to the pre-raster renderer" claim below, since
  // that peak is zero only where forestWeight is exactly 0 or 1. Verified
  // algebraically 2026-09-18, not on the GPU: no headless evaluator for TSL
  // graphs exists in this repo, so this is a code-construction argument
  // (same expression, same operand order as daa1b39), not a pinned pixel
  // measurement -- see the covering-test note in scenery.test.ts.
  const grassOrForest = mix(grass, forest, forestWeight)
  const withSoilPatches = mix(grassOrForest, soil,
    smoothstep(0.74, 0.9, patches).mul(float(1).sub(forestWeight)).mul(0.45))
  const land = mix(mix(withSoilPatches, paddy, cropWeight), mangrove, mangroveWeight)
  const rock = mix(color(0x696c62), color(0x9a9585), groundNoise(xz, 220).g)
    .mul(groundNoise(xz, 26).g.mul(0.35).add(0.82))
  // Tropical summits remain vegetated; steep faces expose rock. No snow line.
  const bare = max(smoothstep(0.48, 1.05, slope), smoothstep(950, 1400, height).mul(0.5))
  const beachToLand = smoothstep(0.4, 2.3, height.add(patches.sub(0.5).mul(0.6)))
  const ground = mix(mix(sand, land, beachToLand), rock, bare)
  const rivers = riverMask()
  const riverUv = xz.sub(vec2(rivers.minX, rivers.minZ)).div(vec2(rivers.width, rivers.depth))
  const riverRoadMask = texture(rivers.texture, riverUv)
  const mask = riverRoadMask.r
  const wetBank = mix(ground, color(0x68664b), smoothstep(0.05, 0.5, mask).mul(0.8))
  const water = mix(color(0x345455), color(0x65796d), groundNoise(xz, 55).g)
  const withWater = mix(wetBank, water, smoothstep(0.45, 0.85, mask))
  // Road: the Maharlika Highway alignment, painted into the mask's green
  // channel by rivers.ts's `paint`. Blended in after water, following the
  // same smoothstep-weighted mix() convention as the river/paddy/mangrove
  // blends above rather than a new blending style. A road DOES overlap a
  // river in the source data -- measured directly against the real mask
  // (2026-09-24): 145 texels have an active road blend over a painted
  // river, 108 of them over open-water-strength river, the highway's real
  // river crossings. Blending the road on last is still the right order at
  // those ~145 crossing texels: the road colour wins, which is what a
  // bridge should look like.
  const roadWeight = smoothstep(0.05, 0.5, riverRoadMask.g)
  const roadColour = vec3(0.42, 0.36, 0.27) // dry earth, matching the design's own description
  return mix(withWater, roadColour, roadWeight)
}
