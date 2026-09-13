import { initRenderer, normalizeGpuError } from './renderer.js'
import { showFailure } from './failure.js'
import { createOverlay } from './overlay.js'

// index.html always contains #app -- it is the mount point the script tag is
// loaded from, so this assertion is safe at the entry point.
const root = document.getElementById('app')!

// Accumulated by the uncapturederror handler set on `renderer.onError` below.
// Module-scoped and left un-exposed here on purpose: Task 15 hooks a
// `window.__ww2` accumulator array so its camera-sweep check can assert this
// stays empty; that exposure is Task 15's job, not this task's.
const validationErrors: string[] = []

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

  // See normalizeGpuError's doc comment: the installed three@0.186.0 runtime
  // calls this with an object despite @types/three declaring a string
  // parameter. Accepting the union here is what makes this assignment
  // typecheck against the (wrong) declared signature without a cast.
  renderer.onError = (info: string | { message?: string }) => {
    validationErrors.push(normalizeGpuError(info))
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
