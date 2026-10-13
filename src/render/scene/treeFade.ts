import { attribute, float, fract, screenCoordinate } from 'three/tsl'
import type { Node } from 'three/webgpu'

export type TreeFadeMode = 'whole' | 'pixel' | 'soft'

export function treeFadeFromQuery(search: string): TreeFadeMode {
  const mode = new URLSearchParams(search).get('treeFade') ?? 'soft'
  if (mode === 'whole' || mode === 'pixel' || mode === 'soft') return mode
  throw new Error(`Unknown treeFade: ${mode}`)
}

export function treeFadeMode(): TreeFadeMode {
  return import.meta.env?.DEV && typeof location !== 'undefined' ? treeFadeFromQuery(location.search) : 'soft'
}

/** Interleaved gradient noise, already used by cloudPass. Stable in screen
 * pixels and per-tree seed; no frame jitter or derivatives. In particular,
 * this avoids the derivative-based alphaHash path that failed on r186/Tint. */
export function treePixelThreshold(): Node<'float'> {
  return fract(float(52.9829189).mul(fract(screenCoordinate.x.mul(0.06711056)
    .add(screenCoordinate.y.mul(0.00583715)).add(attribute('treeFadeSeed', 'float')))))
}

/** CPU reference for coverage and endpoint checks. */
export function treePixelThresholdAt(x: number, y: number, seed: number): number {
  const fract = (v: number) => v - Math.floor(v)
  return fract(52.9829189 * fract(x * 0.06711056 + y * 0.00583715 + seed))
}
