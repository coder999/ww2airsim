/**
 * The sight's state and range readout (B2, F6B): the one place the Assist's state shows on the HUD, since the other
 * assists are legend-only. Top centre, a row under the autopilot badge. The text is `impactLabel` / `torpedoLabel`
 * (scene/impactMarker.ts); this is only the DOM.
 *
 * Accessibility (F6B plan section 8): the visible text changes every frame (the miles), so it is NOT a live region;
 * a separate visually hidden `aria-live="polite"` region carries only a CHANGE of verdict (`createAnnouncer`, at most
 * once a second). Tone changes the text color (green drop OK, red no drop) but the words carry the verdict. 14 px.
 */
export type SightTone = 'plain' | 'ok' | 'bad'
export type ImpactBadgeHandle = { set(label: string | null, tone?: SightTone): void; announce(text: string | null): void }

export const TONE_COLOR: Readonly<Record<SightTone, string>> = { plain: '#ff9d75', ok: '#7ee787', bad: '#ff9e97' }

export function createImpactBadge(root: HTMLElement): ImpactBadgeHandle {
  const el = document.createElement('div')
  el.style.cssText =
    'position:fixed;left:50%;top:64px;transform:translateX(-50%);padding:4px 10px;' +
    'border-radius:4px;background:rgba(12,14,18,.82);color:#ff9d75;' +
    'font:14px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.06em;' +
    'pointer-events:none;display:none'
  const live = document.createElement('div')
  live.setAttribute('aria-live', 'polite')
  live.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap'
  root.append(el, live)
  let shown: string | null = null
  let tone: SightTone = 'plain'
  return {
    set(label, t = 'plain') {
      if (t !== tone) { tone = t; el.style.color = TONE_COLOR[t] }
      if (label === shown) return
      shown = label
      el.textContent = label ?? ''
      el.style.display = label === null ? 'none' : 'block'
    },
    announce(text) { if (text !== null) live.textContent = text },
  }
}
