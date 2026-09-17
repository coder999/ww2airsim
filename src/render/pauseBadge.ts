/**
 * The "the world is held" indicator, the pause counterpart of `timeBadge.ts`
 * and split the same way: a pure label the node-environment suite asserts on,
 * and thin DOM under it.
 *
 * CENTRE of the frame rather than the top-centre strip the time badge owns:
 * a pause is the one state the pilot must not mistake for a stall in the
 * renderer, so it is large and in the middle, and it names the key that
 * releases it.
 */
import { BINDINGS } from '../input/bindings.js'
import { keyLabel } from './legend.js'

export function pauseLabel(paused: boolean): string | null {
  if (!paused) return null
  return `PAUSED \u2014 ${keyLabel(BINDINGS.pause[0])} to resume`
}

export type PauseBadgeHandle = {
  setPaused(paused: boolean): void
}

export function createPauseBadge(root: HTMLElement): PauseBadgeHandle {
  const el = document.createElement('div')
  el.setAttribute('aria-live', 'polite')
  el.style.cssText =
    'position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);padding:10px 18px;' +
    'border:1px solid #2b3440;border-radius:6px;background:rgba(12,14,18,.78);color:#eceff3;' +
    'font:18px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.12em;' +
    'pointer-events:none;display:none;z-index:9'
  root.appendChild(el)

  let shown: string | null = null
  return {
    setPaused(paused: boolean): void {
      const label = pauseLabel(paused)
      if (label === shown) return
      shown = label
      el.textContent = label ?? ''
      el.style.display = label === null ? 'none' : 'block'
    },
  }
}
