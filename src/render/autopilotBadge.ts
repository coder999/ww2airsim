/**
 * The "the autopilot has the stick" indicator.
 *
 * Needed because a held Shift can do two different things (src/sim/ai/
 * autoPursuit.ts): chase an enemy, or -- with none above the floor -- hold a
 * level heading. Without a cue the second looks like the key doing nothing.
 *
 * Split the way `timeBadge.ts` is: a pure label the node-environment suite can
 * assert on, and a thin DOM part.
 */
import type { FrameState } from './frame.js'

/** The badge's text, or `null` when the autopilot is not engaged. */
export function autopilotLabel(status: FrameState['autopilot']): string | null {
  if (status === null) return null
  return status.target === null ? 'AUTOPILOT · NO TARGET · LEVEL' : 'AUTOPILOT · PURSUIT'
}

export type AutopilotBadgeHandle = {
  setStatus(status: FrameState['autopilot']): void
}

/** Top centre, one row under the time badge, which owns the top edge. */
export function createAutopilotBadge(root: HTMLElement): AutopilotBadgeHandle {
  const el = document.createElement('div')
  el.setAttribute('aria-live', 'polite')
  el.style.cssText =
    'position:fixed;left:50%;top:36px;transform:translateX(-50%);padding:4px 10px;' +
    'border-radius:4px;background:rgba(12,14,18,.72);color:#8ad4ff;' +
    'font:12px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.08em;' +
    'pointer-events:none;display:none'
  root.appendChild(el)

  let shown: string | null = null
  return {
    setStatus(status: FrameState['autopilot']): void {
      const label = autopilotLabel(status)
      if (label === shown) return
      shown = label
      el.textContent = label ?? ''
      el.style.display = label === null ? 'none' : 'block'
    },
  }
}
