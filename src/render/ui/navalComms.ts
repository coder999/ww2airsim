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
 * another) whose failure mode is silent and total, see below.
 */
export const STAMP_FILTER_ID = 'stampRough'

/**
 * Declares `.stamp`'s roughen filter in the document, once.
 *
 * `.stamp` carries `filter: url(#stampRough)`. The prototype declared that
 * filter inline in its own page; `index.html` does not. Per the Filter
 * Effects spec an element referencing a filter id that does not resolve is
 * **not rendered at all** -- so a `.stamp` without this is invisible, not
 * merely unfiltered, and nothing logs a thing.
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
