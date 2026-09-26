import { float, int, max, min, mix, smoothstep, texture, vec2, vec3 } from 'three/tsl'
import type { Node } from 'three/webgpu'
import { groundNoise } from './surface.js'
import { SURFACE_LAYERS, type SurfaceLayer } from './surfaceManifest.js'
// Type-only: surfaceTextures.ts pulls in KTX2Loader and import.meta.env,
// neither of which belongs in this module's runtime graph or in the node
// tests that import its CPU twins.
import type { SurfaceTextures } from './surfaceTextures.js'

/**
 * Real-texture detail for the terrain (visual realism §2.1; plan Rulings 1, 2, 6).
 *
 * `ratio` is texel / layer mean, so multiplying a procedural color by it
 * keeps that color on average (composeSurface is a partition of unity) and
 * adds the photographed structure. It fades to exactly 1 with eye distance,
 * and beyond ALBEDO_DETAIL_FAR_M the terrain is the pre-texture terrain.
 *
 * Anti-tiling: each layer is read at its real scan size and again at
 * MACRO_TILE_FACTOR times that, rotated a quarter turn and offset, blended by
 * the 2800 m macro noise. 7.3 is deliberately not an integer, so the two
 * repeats never realign.
 */
export const ALBEDO_DETAIL_NEAR_M = 1500
export const ALBEDO_DETAIL_FAR_M = 6000
export const MACRO_TILE_FACTOR = 7.3
export const DETAIL_RATIO_MAX = 3
/** Floor on the tangent-space z before dividing: a grazing texel would
 *  otherwise give an unbounded slope. The result is clamped to 12 deg later anyway. */
const MIN_NZ = 0.2

export type SurfaceDetailNodes = {
  ratio(layer: SurfaceLayer): Node<'vec3'>
  slope(layer: SurfaceLayer): Node<'vec2'>
}

/** 1 at <= 1500 m, 0 at >= 6000 m, smoothstep between; NaN and negatives
 *  read as the near field. The albedo fade in `surfaceDetailNodes` is its twin. */
export function albedoDetailFade(distanceM: number): number {
  if (!(distanceM > ALBEDO_DETAIL_NEAR_M)) return 1
  const t = Math.min(1, (distanceM - ALBEDO_DETAIL_NEAR_M) / (ALBEDO_DETAIL_FAR_M - ALBEDO_DETAIL_NEAR_M))
  return 1 - t * t * (3 - 2 * t)
}

/** CPU twin of the slope node: tangent (nx, ny, nz) is world (nx, nz, -ny)
 *  for an OpenGL normal map with uv = worldXZ / tileM, so dh/dx = -nx/nz and
 *  dh/dz = ny/nz. */
export function normalToSlope([r, g, b]: readonly [number, number, number]): [number, number] {
  const nx = r * 2 - 1, ny = g * 2 - 1, nz = Math.max(b * 2 - 1, MIN_NZ)
  return [-nx / nz, ny / nz]
}

export function surfaceDetailNodes(t: SurfaceTextures, xz: Node<'vec2'>, eyeDistanceM: Node<'float'>): SurfaceDetailNodes {
  const albedoFade = float(1).sub(smoothstep(ALBEDO_DETAIL_NEAR_M, ALBEDO_DETAIL_FAR_M, eyeDistanceM))
  const macroBlend = smoothstep(0.3, 0.7, groundNoise(xz, 2800).r)
  const rotated = vec2(xz.y.negate(), xz.x).add(97)
  const index = (layer: SurfaceLayer): number => SURFACE_LAYERS.indexOf(layer)
  // Memoized per layer: `grass` feeds both the grass and paddy leaves,
  // `jungle` forest and mangrove, `dirt` soil and road. Without the memo
  // each would be sampled twice.
  const ratios = new Map<SurfaceLayer, Node<'vec3'>>()
  const slopes = new Map<SurfaceLayer, Node<'vec2'>>()
  return {
    ratio(layer) {
      let n = ratios.get(layer)
      if (!n) {
        const i = index(layer)
        const { tileM, meanLinear } = t.manifest.layers[i]!
        const near = texture(t.albedo, xz.div(tileM)).depth(int(i)).rgb
        const far = texture(t.albedo, rotated.div(tileM * MACRO_TILE_FACTOR)).depth(int(i)).rgb
        const r = min(mix(near, far, macroBlend).div(vec3(...meanLinear)), vec3(DETAIL_RATIO_MAX))
        n = mix(vec3(1), r, albedoFade)
        ratios.set(layer, n)
      }
      return n
    },
    slope(layer) {
      let n = slopes.get(layer)
      if (!n) {
        const i = index(layer)
        const nrm = texture(t.normal, xz.div(t.manifest.layers[i]!.tileM)).depth(int(i)).xyz.mul(2).sub(1)
        n = vec2(nrm.x.negate(), nrm.y).div(max(nrm.z, MIN_NZ))
        slopes.set(layer, n)
      }
      return n
    },
  }
}
