import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat } from 'three'
import { color, float, max, mix, smoothstep, texture, vec2 } from 'three/tsl'
import type { Node } from 'three/webgpu'
import { riverMask } from './rivers.js'

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

export function terrainSurfaceNode(xz: Node<'vec2'>, height: Node<'float'>, slope: Node<'float'>): Node<'vec3'> {
  const macro = groundNoise(xz, 2800).r
  const patches = groundNoise(vec2(xz.y.negate(), xz.x).add(173), 610).g
  const canopy = groundNoise(xz, 180).g
  const grain = groundNoise(xz, 18).b
  const sand = mix(color(0x958567), color(0xd6c49b), groundNoise(xz, 95).g)
    .mul(grain.mul(0.16).add(0.92))
  const grass = mix(color(0x626746), color(0x89915b), patches).mul(grain.mul(0.15).add(0.94))
  const forest = mix(color(0x294534), color(0x546847), canopy)
    .mul(macro.mul(0.4).add(0.8))
  const forestWeight = max(smoothstep(0.38, 0.64, macro), smoothstep(70, 220, height))
  const soil = mix(color(0x655644), color(0x8b795b), groundNoise(xz, 150).g)
  const land = mix(mix(grass, forest, forestWeight), soil,
    smoothstep(0.74, 0.9, patches).mul(float(1).sub(forestWeight)).mul(0.45))
  const rock = mix(color(0x696c62), color(0x9a9585), groundNoise(xz, 220).g)
    .mul(groundNoise(xz, 26).g.mul(0.35).add(0.82))
  // Tropical summits remain vegetated; steep faces expose rock. No snow line.
  const bare = max(smoothstep(0.48, 1.05, slope), smoothstep(950, 1400, height).mul(0.5))
  const beachToLand = smoothstep(0.4, 2.3, height.add(patches.sub(0.5).mul(0.6)))
  const ground = mix(mix(sand, land, beachToLand), rock, bare)
  const rivers = riverMask()
  const mask = texture(rivers.texture, xz.sub(vec2(rivers.minX, rivers.minZ))
    .div(vec2(rivers.width, rivers.depth))).r
  const wetBank = mix(ground, color(0x68664b), smoothstep(0.05, 0.5, mask).mul(0.8))
  const water = mix(color(0x345455), color(0x65796d), groundNoise(xz, 55).g)
  return mix(wetBank, water, smoothstep(0.45, 0.85, mask))
}
