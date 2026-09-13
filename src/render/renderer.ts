import { WebGPURenderer } from 'three/webgpu'
import { judgeAdapter, type AdapterVerdict } from './adapterGuard.js'

export type RendererBundle = {
  readonly renderer: WebGPURenderer
  readonly adapterVerdict: AdapterVerdict
}

/**
 * Normalises whatever `Renderer.onError` is actually called with.
 *
 * `@types/three` 0.186.0 declares `onError: (errorMessage: string) => void`
 * (node_modules/@types/three/src/renderers/common/Renderer.d.ts:265), but the
 * installed three@0.186.0 runtime's WebGPUBackend calls it with an object --
 * `renderer.onError({ api, type, message, originalEvent })` -- built from a
 * `GPUUncapturedErrorEvent` (node_modules/three/src/renderers/webgpu/WebGPUBackend.js:281-291).
 * Verified 2026-09-13 by reading both files directly; the published type is
 * wrong, not this code. Accepting the union rather than casting means a
 * handler built from this function is assignable to the (incorrect) declared
 * type with no `as` and no `any` -- TypeScript's contravariant parameter
 * checking allows a handler that accepts a superset of what is declared.
 */
export function normalizeGpuError(info: string | { message?: string }): string {
  // `||`, not `??`: matches the runtime's own fallback pattern for this same
  // shape (`(gpuError && gpuError.message) || 'Unknown uncaptured GPU error'`,
  // node_modules/three/src/renderers/webgpu/WebGPUBackend.js:285), so an empty
  // string is treated as "no message" the same way three itself treats it.
  return (typeof info === 'string' ? info : info.message) || 'Unknown GPU error'
}

/**
 * Brings up WebGPU and judges the adapter.
 *
 * The guard warns here rather than failing: a laptop should still run the game.
 * Tier 2 treats the same verdict as fatal, because that is where a silent
 * fallback would corrupt frame budgets and goldens (master spec §11).
 */
export async function initRenderer(canvas: HTMLCanvasElement): Promise<RendererBundle> {
  if (!('gpu' in navigator)) throw new Error('no-webgpu')

  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
  // A DISTINCT kind from a missing navigator.gpu. Both threw 'no-webgpu'
  // until 2026-09-13, and the message for that kind sends the operator to
  // check their SSH tunnel -- advice that is false here, because a tunnel
  // that were not working could not have got them a `navigator.gpu` to call
  // `requestAdapter` on in the first place.
  if (!adapter) throw new Error('no-adapter')

  const info = adapter.info
  const adapterVerdict = judgeAdapter({
    vendor: info.vendor,
    architecture: info.architecture,
    device: info.device,
    description: info.description,
    isFallbackAdapter: info.isFallbackAdapter,
  })

  const renderer = new WebGPURenderer({ canvas, antialias: true })
  await renderer.init()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(window.innerWidth, window.innerHeight)

  return { renderer, adapterVerdict }
}
