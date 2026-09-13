import { WebGPURenderer } from 'three/webgpu'
import { judgeAdapter, type AdapterVerdict } from './adapterGuard.js'

export type RendererBundle = {
  readonly renderer: WebGPURenderer
  readonly adapterVerdict: AdapterVerdict
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
  if (!adapter) throw new Error('no-webgpu')

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
