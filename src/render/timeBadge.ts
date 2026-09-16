/**
 * The "this flight is running fast" indicator.
 *
 * Compression is otherwise almost invisible: at altitude, in a stable cruise,
 * three times the speed looks a lot like one times the speed, and the pilot
 * who forgets it is on arrives somewhere unintended. So this is the one piece
 * of the feature that shows in BOTH camera modes -- the follow-view numeric
 * strip hides itself in the cockpit (src/render/flightData.ts), which is
 * exactly where the cue would be missed.
 *
 * Split the way `legend.ts` and `overlay.ts` are: the label is a pure function
 * the node-environment suite can assert on, and the DOM below it is thin
 * enough to read.
 */

/** The badge's text at a given scale, or `null` when there is nothing to say.
 *  Returns null rather than an empty string so that "real time" is a state the
 *  caller must handle, not a falsy value it can render by accident. */
export function timeScaleLabel(scale: number): string | null {
  if (!Number.isFinite(scale) || scale <= 1) return null
  return `${scale}× TIME`
}

export type TimeBadgeHandle = {
  setScale(scale: number): void
}

/**
 * Renders the badge into the page.
 *
 * TOP CENTRE, which is the one corner nothing else claims: the legend takes
 * the top right, the DEV overlay the top left, and the instrument panel and
 * the flight-data strip both live along the bottom.
 */
export function createTimeBadge(root: HTMLElement): TimeBadgeHandle {
  const el = document.createElement('div')
  el.setAttribute('aria-live', 'polite')
  el.style.cssText =
    'position:fixed;left:50%;top:8px;transform:translateX(-50%);padding:4px 10px;' +
    'border-radius:4px;background:rgba(12,14,18,.72);color:#ffd48a;' +
    'font:12px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.08em;' +
    'pointer-events:none;display:none'
  root.appendChild(el)

  let shown: string | null = null
  return {
    setScale(scale: number): void {
      const label = timeScaleLabel(scale)
      if (label === shown) return
      shown = label
      el.textContent = label ?? ''
      el.style.display = label === null ? 'none' : 'block'
    },
  }
}
