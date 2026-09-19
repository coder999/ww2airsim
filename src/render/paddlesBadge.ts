/**
 * The landing signal officer's cue, as one line of text (Plan 8 design
 * section 7). Split like `pauseBadge.ts`: a pure label the Node suite
 * asserts on, thin DOM under it. Placed low center, above the gauge strip,
 * where a pilot on final is already looking; the pause badge owns 40%.
 */
import type { PaddlesCue } from '../sim/paddles.js'

const WORDS: Readonly<Record<PaddlesCue, string>> = {
  high: 'HIGH', low: 'LOW', fast: 'FAST', slow: 'SLOW', roger: 'ROGER', cut: 'CUT', 'wave-off': 'WAVE OFF',
}

export function paddlesLabel(cue: PaddlesCue | null): string | null {
  return cue === null ? null : `PADDLES: ${WORDS[cue]}`
}

export type PaddlesBadgeHandle = { setCue(cue: PaddlesCue | null): void }

export function createPaddlesBadge(root: HTMLElement): PaddlesBadgeHandle {
  const el = document.createElement('div')
  el.setAttribute('aria-live', 'polite')
  el.style.cssText =
    'position:fixed;left:50%;top:68%;transform:translate(-50%,-50%);padding:8px 16px;' +
    'border:1px solid #2b3440;border-radius:6px;background:rgba(12,14,18,.78);color:#ffe16a;' +
    'font:18px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;' +
    'pointer-events:none;display:none;z-index:9'
  root.appendChild(el)
  let shown: string | null = null
  return {
    setCue(cue: PaddlesCue | null): void {
      const label = paddlesLabel(cue)
      if (label === shown) return
      shown = label
      el.textContent = label ?? ''
      el.style.display = label === null ? 'none' : 'block'
    },
  }
}
