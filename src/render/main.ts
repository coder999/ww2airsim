import { initRenderer } from './renderer.js'
import { showFailure } from './failure.js'
import { createOverlay } from './overlay.js'

// index.html always contains #app -- it is the mount point the script tag is
// loaded from, so this assertion is safe at the entry point.
const root = document.getElementById('app')!

async function boot(): Promise<void> {
  const canvas = document.createElement('canvas')
  root.appendChild(canvas)

  const { renderer, adapterVerdict } = await initRenderer(canvas)

  if (adapterVerdict.severity === 'fail') {
    showFailure(root, 'software-adapter', adapterVerdict.summary)
    return
  }

  // Windows TDR resets the GPU driver after a hang -- a later plan's ocean
  // compute pass is exactly what trips it. three's WebGPUBackend already
  // filters out an ordinary dispose (reason === 'destroyed') before calling
  // onDeviceLost (verified 2026-09-13 in the installed three@0.186.0 source,
  // node_modules/three/src/renderers/webgpu/WebGPUBackend.js), so every
  // invocation reaching this callback is a real loss worth surfacing, not a
  // teardown.
  renderer.onDeviceLost = (info) => {
    showFailure(root, 'device-lost', info.message)
  }

  const overlay = createOverlay(root)
  let last = performance.now()
  const frame = (now: number): void => {
    const frameMs = now - last
    last = now
    renderer.clear()
    overlay.update({
      frameMs,
      fps: 1000 / Math.max(frameMs, 0.001),
      stepsRun: 0,
      droppedSteps: 0,
      tick: 0,
      adapter: adapterVerdict.summary,
    })
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight)
  })
}

void boot().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e)
  showFailure(root, msg === 'no-webgpu' ? 'no-webgpu' : 'unknown', msg)
})
