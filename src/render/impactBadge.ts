/**
 * The impact marker's state and range readout (B2): the one place the Assist's state shows on the HUD,
 * since the other assists are legend-only. Top centre, a row under the autopilot badge. The text is
 * `impactLabel` (scene/impactMarker.ts); this is only the DOM.
 */
export type ImpactBadgeHandle = { set(label: string | null): void }

export function createImpactBadge(root: HTMLElement): ImpactBadgeHandle {
  const el = document.createElement('div')
  el.setAttribute('aria-live', 'polite')
  el.style.cssText =
    'position:fixed;left:50%;top:64px;transform:translateX(-50%);padding:4px 10px;' +
    'border-radius:4px;background:rgba(12,14,18,.72);color:#ff9d75;' +
    'font:12px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.08em;' +
    'pointer-events:none;display:none'
  root.appendChild(el)
  let shown: string | null = null
  return {
    set(label) {
      if (label === shown) return
      shown = label
      el.textContent = label ?? ''
      el.style.display = label === null ? 'none' : 'block'
    },
  }
}
