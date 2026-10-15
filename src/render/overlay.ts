import { toGeodetic } from '../sim/world/projection.js'

const FEET_PER_METRE = 3.28084

/** Two lines that say where the airplane is, for reporting a place: latitude,
 *  longitude and altitude in feet, then the exact query that respawns there
 *  (`spawn.ts`: world metres, +x east, +y up, +z south). Typed or read off a
 *  screenshot, the second line is enough to fly back to the spot. */
export function formatPosition(p: { readonly x: number; readonly y: number; readonly z: number }): string {
  const { latDeg, lonDeg } = toGeodetic(p.x, p.z)
  const lat = `${Math.abs(latDeg).toFixed(4)}${latDeg >= 0 ? 'N' : 'S'}`
  const lon = `${Math.abs(lonDeg).toFixed(4)}${lonDeg >= 0 ? 'E' : 'W'}`
  return `${lat} ${lon}  ${Math.round(p.y * FEET_PER_METRE)} ft\n` +
    `?spawnX=${Math.round(p.x)}&spawnY=${Math.round(p.y)}&spawnZ=${Math.round(p.z)}`
}

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
    /** The airplane, in world metres; omitted until there is one. */
    position?: { readonly x: number; readonly y: number; readonly z: number }
  }): void
}

export function createOverlay(root: HTMLElement): OverlayHandle {
  const el = document.createElement('pre')
  el.style.cssText =
    'position:fixed;top:8px;left:8px;margin:0;padding:8px 10px;border-radius:4px;' +
    'background:rgba(12,14,18,.72);color:#cfe3ff;font:12px/1.45 ui-monospace,Menlo,monospace;' +
    // Selectable and copyable (Mark 2026-10-14: the position line is what he pastes to report a place).
    // Only this box takes the pointer; the game's mouse input lives on the canvas and keys on `window`.
    'pointer-events:auto;user-select:text;-webkit-user-select:text;cursor:text;white-space:pre'
  root.appendChild(el)
  let dropped = 0
  // Clicking the box freezes it so a selection survives (the text is rewritten every frame, which would collapse
  // it); a click anywhere else releases it. No per-frame getSelection() and no document selectionchange
  // listener, and the text is rewritten with `textContent` as before: the dev build's GPU p95 was measured to
  // move by 2 to 5 ms with any of those (2026-10-14, the budget probe), because CPU cost per frame changes how
  // hard the GPU is driven.
  let holding = false
  el.addEventListener('pointerdown', () => { holding = true })
  window.addEventListener('pointerdown', (e) => { if (!el.contains(e.target as Node)) { holding = false; window.getSelection()?.removeAllRanges() } }, true)
  return {
    update(s) {
      dropped += s.droppedSteps
      if (holding) return
      el.textContent =
        `${s.fps.toFixed(0)} fps  ${s.frameMs.toFixed(1)} ms\n` +
        `tick ${s.tick}  steps/frame ${s.stepsRun}\n` +
        `dropped ${dropped}${dropped > 0 ? '  <-- replay invalid' : ''}\n` +
        `${s.adapter}` +
        (s.position ? `\n${formatPosition(s.position)}` : '')
    },
  }
}
