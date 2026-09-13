/** Dev overlay: frame time, rates, and dropped steps. `droppedSteps` is here
 *  because a spiral is only obvious while it is happening. */
export type OverlayHandle = {
  update(stats: {
    frameMs: number
    fps: number
    stepsRun: number
    droppedSteps: number
    tick: number
    adapter: string
  }): void
}

export function createOverlay(root: HTMLElement): OverlayHandle {
  const el = document.createElement('pre')
  el.style.cssText =
    'position:fixed;top:8px;left:8px;margin:0;padding:8px 10px;border-radius:4px;' +
    'background:rgba(12,14,18,.72);color:#cfe3ff;font:12px/1.45 ui-monospace,Menlo,monospace;' +
    'pointer-events:none;white-space:pre'
  root.appendChild(el)
  let dropped = 0
  return {
    update(s) {
      dropped += s.droppedSteps
      el.textContent =
        `${s.fps.toFixed(0)} fps  ${s.frameMs.toFixed(1)} ms\n` +
        `tick ${s.tick}  steps/frame ${s.stepsRun}\n` +
        `dropped ${dropped}${dropped > 0 ? '  <-- replay invalid' : ''}\n` +
        `${s.adapter}`
    },
  }
}
