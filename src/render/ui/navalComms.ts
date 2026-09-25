import './naval-comms.css'

/**
 * The Naval Communications design system's runtime companion
 * (`naval-comms.css`, ported in Task 4 of the 2026-09-24 plan-ui-realism
 * plan; design: `docs/superpowers/specs/2026-09-24-naval-comms-ui-design.md`).
 *
 * **Import this module, not the stylesheet, from any screen built in this
 * visual language** (Settings, and Tasks 7/8's roster and debrief). It pulls
 * the stylesheet in for you, and it is where the one piece of the design
 * system that cannot live in CSS lives.
 *
 * Two things every consumer needs:
 * - `class="naval-comms"` on the container. The prototype's page-level rules
 *   (`* { box-sizing }`, `html, body { padding; flex; background }`) are
 *   scoped to that class rather than applied to the document, which in this
 *   app is a full-screen WebGPU canvas.
 * - `ensureStampFilter()` before rendering anything with `.stamp`.
 */

/**
 * The SVG filter id `naval-comms.css`'s `.stamp` rule names in
 * `filter: url(#stampRough)`. Exported so the assertion in
 * `tests/render/navalComms.test.ts` can check the stylesheet and this module
 * still agree -- a cross-boundary claim (CSS says one id, TypeScript creates
 * another) whose failure mode is a silently missing roughen effect.
 */
export const STAMP_FILTER_ID = 'stampRough'

/**
 * Declares `.stamp`'s roughen filter in the document, once.
 *
 * `.stamp` carries `filter: url(#stampRough)`. The prototype declared that
 * filter inline in its own page; `index.html` does not. The reference
 * Chromium build renders a stamp whose filter id does not resolve, but it
 * renders it unroughened and logs nothing (measured 2026-09-24 during Task 9
 * review). The filter element itself therefore has to be asserted; computed
 * style, visibility and bounding-box checks all passed without it.
 *
 * Document-level and idempotent, rather than per-screen: the first version of
 * this (Task 5) injected the defs into the Settings overlay's own DOM under a
 * different id, which meant every other screen's stamps -- the debrief's
 * outcome stamp above all -- would have referenced a filter that existed only
 * while the Settings dialog happened to be on screen. Called as many times as
 * you like; the id check makes every call after the first a no-op.
 */
export function ensureStampFilter(): void {
  if (document.getElementById(STAMP_FILTER_ID) !== null) return
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.setAttribute('aria-hidden', 'true')
  svg.style.cssText = 'position:absolute'
  svg.innerHTML =
    `<filter id="${STAMP_FILTER_ID}" x="-20%" y="-20%" width="140%" height="140%">` +
    '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="noise" scale="3.2"/></filter>'
  // On `document.body`, not inside whichever overlay asked for it: a filter
  // reference is resolved against the whole document, and the overlay that
  // happened to be first is torn down and rebuilt on every `show()`.
  document.body.appendChild(svg)
}

/**
 * One `.ballot-option`, carrying the prototype's own accessibility contract:
 * `role="radio"` + `aria-checked` + `tabindex="0"` + Enter/Space activation
 * (naval-comms spec §3). Ported as a listener pair rather than as the
 * prototype's page-wide inline `<script>` sweep, matching how every other
 * control in `titleScreen.ts` wires itself up. Shared by Settings and the
 * title screen's Sortie Orders form (Mission and Armament rows).
 *
 * Enter is swallowed (`stopPropagation`) for the same reason
 * `titleScreen.ts`'s new-pilot field swallows it: that file has a `window`
 * keydown listener that advances or launches on Enter, and a bubbled Enter
 * from a ballot would do that instead of just picking the row.
 */
export function ballotOption(label: string, note: string, onActivate: () => void): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'ballot-option'
  el.setAttribute('role', 'radio')
  el.setAttribute('aria-checked', 'false')
  el.tabIndex = 0

  const box = document.createElement('span')
  box.className = 'ballot-box'
  const text = document.createElement('span')
  text.className = 'ballot-label'
  text.textContent = label
  el.append(box, text)
  if (note !== '') {
    const noteEl = document.createElement('span')
    noteEl.className = 'ballot-note'
    noteEl.textContent = note
    el.appendChild(noteEl)
  }

  el.addEventListener('click', onActivate)
  el.addEventListener('keydown', (e) => {
    if (e.code !== 'Enter' && e.code !== 'NumpadEnter' && e.code !== 'Space') return
    e.preventDefault()
    e.stopPropagation()
    onActivate()
  })
  return el
}

export function radioGroup(ariaLabel: string): HTMLDivElement {
  const group = document.createElement('div')
  group.setAttribute('role', 'radiogroup')
  group.setAttribute('aria-label', ariaLabel)
  return group
}
