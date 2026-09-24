/**
 * The on-screen control reference.
 *
 * It exists because a binding that is not written down is a binding nobody
 * finds. On 2026-09-15 Mark asked for a way to reduce the throttle; `Z` and
 * `-` had been bound since Plan 1. The keys were never the problem.
 *
 * So the rows below name BINDINGS entries rather than restating their keys,
 * and `legend.test.ts` requires the two sets to match exactly. Adding a
 * binding without giving it a row fails the suite instead of shipping another
 * invisible control. `src/input/bindings.ts` stays the only place a key
 * changes.
 */
import { BINDINGS, type BindingName } from '../input/bindings.js'

export type LegendRow = {
  /** What the pilot is trying to do, not what the code calls it. */
  readonly label: string
  /** Bindings whose keys are shown together, in this order. */
  readonly bindings: readonly BindingName[]
  /** Joins the keys of a PAIR of opposed bindings, e.g. "W / S". Axes read
   *  better this way than as two rows saying the same thing twice. */
  readonly pair?: boolean
}

export const LEGEND_ROWS: readonly LegendRow[] = [
  { label: 'Guns', bindings: ['fireGuns'] },
  // Plan 6b Task 4 added the bindings; the label text and position here match
  // what Task 9 (docs/superpowers/plans/2026-09-22-strike.md) specifies, added
  // early only because `legend.test.ts`'s pre-existing exhaustiveness check
  // (every BINDINGS entry needs a row) would otherwise fail `npm run verify`
  // the moment `dropBomb`/`fireRockets` exist in BINDINGS.
  { label: 'Bombs', bindings: ['dropBomb'] },
  { label: 'Rockets', bindings: ['fireRockets'] },
  { label: 'Pitch', bindings: ['pitchDown', 'pitchUp'], pair: true },
  { label: 'Roll', bindings: ['rollLeft', 'rollRight'], pair: true },
  { label: 'Yaw', bindings: ['yawLeft', 'yawRight'], pair: true },
  { label: 'Throttle', bindings: ['throttleUp', 'throttleDown'], pair: true },
  { label: 'Throttle cut', bindings: ['throttleCut'] },
  { label: 'Camera', bindings: ['cycleCamera'] },
  {
    label: 'Look',
    bindings: ['lookUp', 'lookDown', 'lookLeft', 'lookRight', 'lookCentre', 'lookBack'],
  },
  { label: 'Stall limiter', bindings: ['toggleStallLimiter'] },
  { label: 'Auto-rudder', bindings: ['toggleAutoRudder'] },
  { label: 'Triple time', bindings: ['toggleTripleTime'] },
  { label: 'Gear', bindings: ['toggleGear'] },
  { label: 'Flaps', bindings: ['toggleFlaps'] },
  { label: 'Hook', bindings: ['toggleHook'] },
  { label: 'Brakes', bindings: ['brakes'] },
  { label: 'Mute', bindings: ['toggleMute'] },
  { label: 'Controls', bindings: ['toggleLegend'] },
  { label: 'Navigation chart', bindings: ['toggleMissionMap'] },
  { label: 'Radar range', bindings: ['toggleRadarRange'] },
  { label: 'Follow-view data', bindings: ['toggleFlightData'] },
  { label: 'Pause', bindings: ['pause'] },
]

const NAMED: Readonly<Record<string, string>> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  Minus: '-',
  Equal: '=',
  // Punctuation codes are named, not symbolic, so every one of these reads as
  // a word unless it is listed. `Slash` shipped as the literal text "Slash"
  // on 2026-09-15 for exactly that reason; `legend.test.ts` now sweeps every
  // bound key rather than the handful anyone thought to list.
  Slash: '/',
  Backslash: '\\',
  Period: '.',
  Comma: ',',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backquote: '`',
  Space: 'Space bar',
  Escape: 'Esc',
  // Plan 17. `KeyboardEvent.code` for this key already IS 'Tab', so the
  // fallthrough `return code` at the bottom of `keyLabel` would print it
  // correctly by coincidence -- but `legend.test.ts`'s "never shows a bound
  // key as its raw DOM code" sweep can't tell coincidence from the `Slash`
  // bug it exists to catch, and fails on the identity either way. An
  // explicit NAMED entry (worded like `Space` above, not left bare) satisfies
  // both: still the keycap's own word, but reached through the same mapping
  // every other multi-character key goes through, not the fallthrough.
  Tab: 'Tab key',
  // The keypad's operator keys: the generic `Numpad` rule below would print
  // "Num Add", which is not what is on the keycap.
  NumpadAdd: 'Num +',
  NumpadSubtract: 'Num -',
}

/**
 * A `KeyboardEvent.code` as it is printed on the keycap.
 *
 * Codes are physical-key identifiers, which is exactly right for binding and
 * exactly wrong for reading: "Numpad8" and "ShiftLeft" are not what a pilot
 * sees in front of them.
 */
export function keyLabel(code: string): string {
  const named = NAMED[code]
  if (named !== undefined) return named
  if (code.startsWith('Numpad')) return `Num ${code.slice('Numpad'.length)}`
  if (code.startsWith('Key')) return code.slice('Key'.length)
  if (code.startsWith('Digit')) return code.slice('Digit'.length)
  return code
}

/** The keys of one binding, de-duplicated in order: both Shifts print once. */
const keysOf = (name: BindingName): string =>
  [...new Set(BINDINGS[name].map(keyLabel))].join(' / ')

/** One display line per row: the label, then its keys. */
export function legendLines(muted = false): readonly string[] {
  return LEGEND_ROWS.map((row) => {
    const keys = row.pair
      ? row.bindings.map(keysOf).join('  /  ')
      : row.bindings.map(keysOf).join('  ')
    // A mute whose state is invisible is the same defect this panel exists to
    // fix: the player has no other way to tell silence-by-choice from an
    // audio system that failed to load.
    const suffix = muted && row.bindings.includes('toggleMute') ? '  (muted)' : ''
    return `${row.label}  ${keys}${suffix}`
  })
}

/** The legend's own key, read from BINDINGS so the prompt cannot name a key
 *  that no longer toggles it. */
const TOGGLE_KEYS = [...new Set(BINDINGS.toggleLegend.map(keyLabel))].join(' / ')

/**
 * The data credits, shown as the panel's last line.
 *
 * The rivers in `content/scenery/rivers.json` are OpenStreetMap data, and the
 * ODbL requires the attribution to be visible to a user of the produced work
 * (`content/scenery/NOTICE.md`). Codex's first pass (daa1b39) met that with a
 * fixed watermark in the corner of the play screen; Mark did not authorize a
 * watermark, so on 2026-09-17 it moved in here, behind the same key as the
 * controls. `dist.test.ts` refuses the old `map-credit` element in the shipped
 * `index.html`.
 *
 * Copernicus (licence Article 6(b)/6(c)) and GEBCO ask only that their notices
 * ACCOMPANY the derived data, which `content/terrain/NOTICE.md` and
 * `content/ocean/NOTICE.md` do; neither requires in-app display, so they get a
 * short "Data:" mention rather than their full attribution strings.
 *
 * ESA WorldCover does not fit that same argument (dated, checked 2026-09-18:
 * an earlier pass appended "ESA WorldCover" to the plain-text mention above
 * on the strength of it, without re-deriving it for a licence that actually
 * differs). WorldCover ships under CC BY 4.0, and §3(a)(2) of that licence
 * asks the licensee to retain, "in any reasonable manner", the creator
 * credit, a licence notice, and "a URI or hyperlink to the licence... to the
 * extent reasonably practicable". A hyperlink is reasonably practicable in
 * this exact panel -- the OSM credit right beside it already is one -- so
 * unlike Copernicus/GEBCO's "accompany, don't display" bar, a bare "Data:"
 * mention does not clear §3(a)(2) on its own. "ESA WorldCover" is therefore a
 * link to the CC BY 4.0 deed (`WORLDCOVER_LICENCE_URL`), the same way the
 * rivers' own credit links to `OSM_COPYRIGHT_URL`. The creator credit and the
 * full licence notice text this line does not carry inline live in
 * `content/landcover/NOTICE.md`, which ships with the raster (verified live,
 * 200, 2026-09-18) and is what `§3(a)(2)`'s "reasonable manner" is satisfied
 * by together with this link -- the section does not require the notice
 * itself to be in-app, only a way to reach the licence, which this panel now
 * has. Nothing on the play screen either way: same rule as the rivers.
 */
export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright'
export const WORLDCOVER_LICENCE_URL = 'https://creativecommons.org/licenses/by/4.0/'
export const CREDITS = {
  /** Everything before the WorldCover link. */
  before: 'Data: Copernicus DEM, GEBCO, ',
  /** The WorldCover link text; `createLegend` points it at `WORLDCOVER_LICENCE_URL`. */
  worldCover: 'ESA WorldCover',
  /** Between the two links. */
  between: ' · Rivers © ',
  /** The OSM link text; `createLegend` points it at `OSM_COPYRIGHT_URL`. */
  link: 'OpenStreetMap contributors',
} as const

/** The credit line as plain text, which is all a `node` test can see. */
export function creditsLine(): string {
  return CREDITS.before + CREDITS.worldCover + CREDITS.between + CREDITS.link
}

export type LegendHandle = {
  /** Collapsed to a single prompt line, or fully shown. */
  setOpen(open: boolean): void
  /** Marks the Mute row, so silence-by-choice is distinguishable from audio
   *  that failed to load. */
  setMuted(muted: boolean): void
}

/**
 * Renders the legend into the page.
 *
 * TOP right, not bottom right: the instrument panel occupies the bottom of the
 * frame in cockpit view, and the first screenshot of this feature (2026-09-15)
 * had the legend sitting on top of the slip dial. The dev overlay takes the
 * top LEFT corner, so the two do not collide either.
 *
 * DOM only, and deliberately thin: the vitest environment is `node`, so
 * everything worth asserting lives in the pure functions above. Same split as
 * `overlay.ts`.
 */
export function createLegend(root: HTMLElement): LegendHandle {
  const el = document.createElement('pre')
  el.style.cssText =
    'position:fixed;right:8px;top:8px;margin:0;padding:8px 10px;border-radius:4px;' +
    'background:rgba(12,14,18,.72);color:#cfe3ff;font:12px/1.45 ui-monospace,Menlo,monospace;' +
    'pointer-events:none;white-space:pre;text-align:right'
  root.appendChild(el)

  // The key lines are one text node; the credit is a separate element after
  // them so its links can be <a>s. A link alone re-enables pointer events:
  // the <pre> disables them so the panel never steals a click from the canvas.
  const lines = document.createTextNode('')
  el.appendChild(lines)
  const credit = document.createElement('div')
  credit.style.cssText = 'margin-top:8px;font-size:10px;opacity:.6'
  const makeLink = (text: string, href: string): HTMLAnchorElement => {
    const a = document.createElement('a')
    a.href = href
    a.target = '_blank'
    a.rel = 'noopener'
    a.textContent = text
    a.style.cssText = 'color:inherit;pointer-events:auto'
    return a
  }
  credit.append(CREDITS.before, makeLink(CREDITS.worldCover, WORLDCOVER_LICENCE_URL), CREDITS.between,
    makeLink(CREDITS.link, OSM_COPYRIGHT_URL))
  el.appendChild(credit)

  let open = true
  let muted = false
  const render = (): void => {
    lines.data = open
      ? [...legendLines(muted), '', `${TOGGLE_KEYS}  hide`].join('\n')
      : `${TOGGLE_KEYS}  controls`
    credit.style.display = open ? '' : 'none'
  }
  render()
  return {
    setOpen(next: boolean): void {
      open = next
      render()
    },
    setMuted(next: boolean): void {
      muted = next
      render()
    },
  }
}
