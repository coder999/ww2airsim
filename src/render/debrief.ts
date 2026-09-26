import { ensureStampFilter } from './ui/navalComms.js'
import type { Impact } from '../sim/loop.js'
import type { AircraftState } from '../sim/flight/state.js'
import { attitudeAngles } from '../sim/flight/attitude.js'
import { length } from '../sim/math/vec3.js'
import type { LandingReport } from '../sim/landing.js'
import { TARGET_TYPES, type TargetType } from '../sim/weapons/targetType.js'

export type ScoreRow = {
  readonly target: string
  readonly destroyed: number
  readonly score: number
}

/**
 * The per-type kills accrued SINCE the last bank (e.g. since the last
 * landing/ditching/death that already scored them). Exists so a landing
 * followed by "Continue" and more flying does not re-bank the whole flight's
 * cumulative kill count on a second debrief later -- `main.ts` (Plan 9 Task 6)
 * computes the baseline and calls this before each of the three model
 * builders below.
 */
export function killsSince(
  current: Readonly<Record<TargetType, number>>,
  baseline: Readonly<Record<TargetType, number>>,
): Readonly<Record<TargetType, number>> {
  return Object.fromEntries(
    TARGET_TYPES.map((t) => [t, current[t] - baseline[t]]),
  ) as Readonly<Record<TargetType, number>>
}

const POINTS_BY_TARGET_TYPE: Readonly<Record<TargetType, number>> = {
  fighter: 500,
  bomber: 750,
  cruiser: 1500,
  battleship: 3000,
  aaa: 250,
  runway: 500,
  building: 150,
  carrier: 5000,
}

/** The point value of one kill of type `t`. Exported (Hangar spec §5) so the
 *  library's cards read THIS table rather than a copy of it. */
export function pointsForTargetType(t: TargetType): number {
  return POINTS_BY_TARGET_TYPE[t]
}

const TARGET_LABEL: Readonly<Record<TargetType, string>> = {
  fighter: 'Fighter',
  bomber: 'Bomber',
  cruiser: 'Cruiser',
  battleship: 'Battleship',
  aaa: 'AAA Battery',
  runway: 'Runway',
  building: 'Building',
  carrier: 'Carrier',
}

/** The debrief's row label for type `t`, exported for the same reason. */
export function targetLabel(t: TargetType): string {
  return TARGET_LABEL[t]
}

/**
 * The three recovery outcomes the sim can actually produce. Master spec §8
 * has a fourth row ("bailed out over friendly water," 0.25x) -- there is no
 * bail-out/parachute mechanic in this sim to reach it, so it is deliberately
 * absent here rather than an unreachable fourth union member. See this
 * plan's own "Ruling" section for why.
 */
export type RecoveryOutcome = 'landed' | 'ditched' | 'killed'

export const RECOVERY_MULTIPLIER: Readonly<Record<RecoveryOutcome, number>> = {
  landed: 1.0,
  ditched: 0.5,
  killed: 0.0,
}

/** Whole-branch review I-3: the label `createDebrief`'s "Recovery: ..." row
 *  uses -- the same word each model's own `headline` already shows, kept as
 *  a separate table rather than reading `model.headline` so this stays
 *  correct even if a headline's wording ever changes for its own reasons. */
const RECOVERY_LABEL: Readonly<Record<RecoveryOutcome, string>> = {
  landed: 'LANDED',
  ditched: 'DITCHED',
  killed: 'KILLED',
}

/**
 * The mission's score: master spec §8's point table applied to kills SINCE
 * the last bank (`killsSince`, so a landing followed by "Continue" and more
 * flying does not re-bank the whole flight's cumulative total), times the
 * recovery multiplier for how this flight/segment ended.
 */
export function missionScore(
  killsByType: Readonly<Record<TargetType, number>>,
  outcome: RecoveryOutcome,
): { readonly rows: readonly ScoreRow[]; readonly total: number; readonly multiplier: number } {
  const multiplier = RECOVERY_MULTIPLIER[outcome]
  const rows: ScoreRow[] = TARGET_TYPES.map((t) => ({
    target: TARGET_LABEL[t],
    destroyed: killsByType[t],
    score: Math.round(killsByType[t] * POINTS_BY_TARGET_TYPE[t] * multiplier),
  }))
  return { rows, total: rows.reduce((sum, r) => sum + r.score, 0), multiplier }
}

export type DebriefFigure = { readonly label: string; readonly value: string }

export type DebriefModel = {
  readonly headline: string
  readonly detail: string
  readonly figures: readonly DebriefFigure[]
  readonly score: ReturnType<typeof missionScore>
  /**
   * Present only when the flight can go on: the label of a second button
   * that dismisses the dialog without restarting. A crash has none -- see
   * `createDebrief`'s ONE-button reasoning -- a landing has one, because the
   * airplane is intact and the pilot may want to taxi, take off again, or
   * just look at the view.
   */
  readonly continueLabel?: string
  /**
   * Whole-branch review I-3: design doc §1 promises the debrief shows "the
   * recovery multiplier actually applied" -- `score.multiplier` already
   * carries the NUMBER (`missionScore`, above), but not which outcome it
   * came from, which `createDebrief`'s renderer needs for the "Recovery:
   * LANDED (×1)"-style line (`RECOVERY_MULTIPLIER.landed` is the JS number
   * `1`, not a string "1.0" -- template interpolation renders it bare).
   * Always present: every one of the three model builders below scores
   * against exactly one `RecoveryOutcome`.
   */
  readonly outcome: RecoveryOutcome
  /**
   * The pilot's cumulative score AFTER this mission's result was banked, and
   * the rank they were just promoted to (if any) -- design §1's other two
   * promised figures ("the banked total, any promotion"). Both are set by
   * `main.ts`'s call sites, AFTER banking, not by the three builders below:
   * none of them has access to the roster, only to this one mission's score.
   * `promotedTo` is the new rank's full NAME ("Lieutenant, junior grade"),
   * not the abbreviation the roster list uses, matching this file's own
   * `figures` label style; absent when no promotion happened, rather than
   * present-and-equal-to-the-old-rank, so `show()` can render it
   * conditionally the same way it already does `continueLabel`.
   */
  readonly bankedTotal?: number
  readonly promotedTo?: string
}

// The simulation remains SI internally. The debrief is a 1943 US Navy form,
// so its pilot-facing figures use the same imperial units as the instruments.
const MPH_PER_MPS = 1 / 0.44704
const FT_PER_M = 1 / 0.3048

const mph = (mps: number): string => `${Math.round(mps * MPH_PER_MPS)} mph`
const feet = (metres: number): string => `${Math.round(metres * FT_PER_M)} ft`

/** What the debrief says about a landing (Mark, 2026-09-17: "successful
 *  landing - nice job! (or similar)"). Pure, like `debriefModel`.
 *  `shipNames` maps a carrier's ship id (`LandingReport.at.name`) to its
 *  display name -- `src/sim/landing.ts` names a carrier by its ship id
 *  because that is what `nextLandingTracking` has in hand; `main.ts` passes
 *  the world's ships. */
export function landingModel(
  report: LandingReport,
  killsSinceLastBank: Readonly<Record<TargetType, number>>,
  shipNames: Readonly<Record<string, string>> = {},
): DebriefModel {
  const landedAt = (): string => {
    if (report.at === null) return 'off-field'
    if (report.at.kind !== 'carrier') return report.at.name
    // Class name then hull id -- "Essex-class fleet carrier cv-1". No
    // "(carrier)" suffix (Plan 8 review, item 9): the class name says it, and
    // the doubled word read as an unfinished placeholder. With no class name
    // known the id stands alone rather than being decorated with a word the
    // rest of the line cannot support.
    const className = shipNames[report.at.name]
    return className === undefined ? report.at.name : `${className} ${report.at.name}`
  }
  return {
    headline: 'LANDED',
    detail: 'Nice job. You brought her back in one piece.',
    figures: [
      { label: 'Landed at', value: landedAt() },
      { label: 'Touchdown sink', value: mph(report.touchdownSinkMps) },
      { label: 'Touchdown speed', value: mph(report.touchdownSpeedMps) },
      { label: 'Roll-out', value: feet(report.rollOutM) },
    ],
    score: missionScore(killsSinceLastBank, 'landed'),
    continueLabel: 'Continue',
    outcome: 'landed',
  }
}

/** What the debrief says about how a flight ended. Pure, so the node-environment
 *  suite can assert on all of it; the DOM in `createDebrief` renders it. */
export function debriefModel(
  impact: Impact,
  state: AircraftState,
  killsSinceLastBank: Readonly<Record<TargetType, number>>,
): DebriefModel {
  const { rollRad } = attitudeAngles(state)
  const figures: DebriefFigure[] = [
    { label: 'Impact speed', value: mph(length(state.velocity)) },
    // Sink is a negative `velocity.y` (same sign convention `contact.ts`'s
    // `sinkingGently` gate checks); negated here so the figure reads as a
    // positive sink rate instead of a confusing minus sign next to two
    // positive figures.
    { label: 'Sink rate', value: mph(-impact.verticalSpeedMps) },
    { label: 'Bank', value: `${Math.round((rollRad * 180) / Math.PI)}°` },
  ]

  if (impact.kind === 'ditched') {
    return {
      headline: 'DITCHED',
      detail: 'You put her down on the water and survived. The airplane is lost.',
      figures,
      score: missionScore(killsSinceLastBank, 'ditched'),
      outcome: 'ditched',
    }
  }
  // Three surfaces, because `Impact.surface` has had three since Plan 8's
  // Task 2 (`ContactSurface`): a deck arrival fell through to the land
  // sentence, and told a pilot who had just flown into the round-down that he
  // had hit an island 60 km away (Plan 8 review, item 3). The ship is not
  // named: `Impact` carries a surface and a height, not a ship id, and
  // recovering one from the world here would mean re-deriving the decks for
  // the tick the airplane hit -- which the debrief no longer has.
  const detail =
    impact.surface === 'water'
      ? 'You went into the sea. There was nothing left to recover.'
      : impact.surface === 'deck'
        ? 'You went into the deck.'
        : 'You went into Leyte. There was nothing left to recover.'
  return {
    headline: 'KILLED',
    detail,
    figures,
    score: missionScore(killsSinceLastBank, 'killed'),
    outcome: 'killed',
  }
}

/** What the debrief says when combat damage, including structural overload,
 * destroys the aircraft before it makes ground contact. */
export function destructionModel(
  state: AircraftState,
  attacker: string | null,
  killsSinceLastBank: Readonly<Record<TargetType, number>>,
): DebriefModel {
  return {
    headline: 'KILLED',
    detail: attacker === null
      ? 'The airframe failed under structural overload.'
      : 'The aircraft was destroyed in combat.',
    figures: [
      { label: 'Final speed', value: mph(length(state.velocity)) },
      { label: 'Altitude', value: feet(state.position.y) },
    ],
    score: missionScore(killsSinceLastBank, 'killed'),
    outcome: 'killed',
  }
}

export type DebriefHandle = {
  /**
   * `onContinue` is called when the model's `continueLabel` button is
   * pressed; a model without one shows no such button and never calls it.
   * `onReturnToTitle` (design §1, Plan 9 Task 6) is called when the always-
   * present "Return to title" button is pressed -- present on every model,
   * landing included, since spec §1 says the debrief gains this "rather than
   * only offering Restart," not as a landing-only substitute for Continue.
   */
  show(model: DebriefModel, onContinue?: () => void, onReturnToTitle?: () => void): void
  hide(): void
}

function sectionTitle(text: string): HTMLDivElement {
  const el = document.createElement('div')
  el.className = 'form-section-title'
  el.textContent = text
  return el
}

// `.figure-row`/`.k` are the prototype's OWN local styles
// (design-prototypes/telegram-ui/debrief.html's inline `<style>`), specific
// to this one screen's key/value lines -- unlike `.sheet`/`.form-table`/etc.
// they never made it into the shared `naval-comms.css` (that file's own
// `tests/render/navalComms.test.ts` pins the class list Tasks 5/7/8 actually
// share, and this pair is not on it). Kept local rather than added to the
// shared stylesheet other screens also depend on.
const FIGURE_ROW_STYLE = 'display:flex;justify-content:space-between;gap:24px;padding:3px 0;font-size:13px'
const FIGURE_ROW_LABEL_STYLE = 'color:var(--ink-faint)'

/** One "label ... value" line, styled like the prototype's `.figure-row`. */
function figureRow(label: string, value: string): HTMLDivElement {
  const row = document.createElement('div')
  row.style.cssText = FIGURE_ROW_STYLE
  const k = document.createElement('span')
  k.style.cssText = FIGURE_ROW_LABEL_STYLE
  k.textContent = label
  const v = document.createElement('strong')
  v.textContent = value
  row.append(k, v)
  return row
}

/** A figure-row-styled line carrying one pre-joined string rather than a
 *  split label/value pair -- used for the Recovery/Banked total lines so
 *  their wording stays exactly what `tests/e2e/meta-game-relaunch.spec.ts`
 *  already asserts on (`Recovery: LANDED (×1)`, `Banked total: 500`), which
 *  a `k`/`strong` split would break into two text nodes with no colon
 *  between them. */
function plainRow(text: string): HTMLDivElement {
  const row = document.createElement('div')
  row.style.cssText = FIGURE_ROW_STYLE
  row.textContent = text
  return row
}

const DTG_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const

/** Naval date-time-group format (`DDHHMMZ MON YY`) for the routing header's
 *  one genuinely dynamic field -- see `show()`'s own comment on why the rest
 *  of that block is static flavor text rather than real pilot/mission data.
 *  UTC, per the format's own trailing "Z". */
function formatDtg(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const hh = String(date.getUTCHours()).padStart(2, '0')
  const mi = String(date.getUTCMinutes()).padStart(2, '0')
  const mon = DTG_MONTHS[date.getUTCMonth()]
  const yy = String(date.getUTCFullYear()).slice(-2)
  return `${dd}${hh}${mi}Z ${mon} ${yy}`
}

/**
 * The end-of-flight modal, over a scene that is still being drawn.
 *
 * It does NOT stop the simulation and must not learn how to: the frame holds
 * the world once the player has an impact (`nextFrameState`'s `holding`,
 * src/render/frame.ts), and Plan 14's mission map will want the same
 * held-modal behavior without going through a debrief.
 * This module only renders.
 *
 * Originally ONE button for a crash. "Resume" is meaningless after a death,
 * and the 1991 original's "End Mission" returns to a mission selector this
 * game does not have -- a button that goes nowhere is how a stale document
 * starts. Plan 9 Task 6 adds the menu and the "Return to title" button that
 * reaches it (design §1), present on every model regardless of outcome, so a
 * crash debrief now shows Restart + Return to title. A LANDING (2026-09-17)
 * is the one outcome the flight survives, so its model ALSO carries a
 * `continueLabel` and this renders a third button for it; the caller decides
 * what continuing means (releasing the pause it took when it showed the
 * dialog) and what returning to title means (`titleScreen.show()`).
 *
 * Restyled in Task 8 of the 2026-09-24 plan-ui-realism plan into the Naval
 * Communications design system (naval-comms spec §3) -- presentation only;
 * every field below still comes from the same `DebriefModel` the three pure
 * builders above already produced.
 */
export function createDebrief(root: HTMLElement, onRestart: () => void): DebriefHandle {
  // `.stamp` (the outcome stamp `show()` renders below) is invisible with no
  // error if this has not run first -- see `ensureStampFilter`'s own doc
  // comment. Document-level and idempotent, so it does not matter that
  // `titleScreen.ts`/`settings.ts` also call it; called once here, before
  // this dialog's first `show()`.
  ensureStampFilter()

  const backdrop = document.createElement('div')
  backdrop.style.cssText =
    'position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
    'background:rgba(8,10,14,.45);z-index:10'
  const panel = document.createElement('div')
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  // Named so a test (or a screen reader) can tell this dialog from the Plan 14
  // navigation chart, which is a second role="dialog" on the same page.
  panel.setAttribute('aria-label', 'Debrief')
  // Naval Communications design system (naval-comms spec §3). `.naval-comms`
  // brings page furniture meant for a screen that IS the whole page (40px
  // padding, a centered flex column with a 28px gap -- see that class's own
  // comment in naval-comms.css). This panel is one node inside `backdrop`'s
  // own centering flexbox, not the whole page, so those rules would fight
  // its layout: `display:block` neutralizes the class's flex-only properties
  // (`align-items`/`gap` are inert once the container isn't a flex box), and
  // `padding`/`background` are reset directly. Same override
  // `titleScreen.ts`'s roster panel (Task 7, commit ac801cb) and
  // `settings.ts`'s dialog overlay both use, for the same reason.
  panel.className = 'naval-comms'
  panel.style.cssText =
    'display:block;padding:0;background:transparent;width:min(720px,94vw);' +
    'max-height:88vh;overflow-y:auto'
  backdrop.appendChild(panel)
  root.appendChild(backdrop)

  // Built once, re-styled/re-labeled and re-appended on every `show()` --
  // same reason `titleScreen.ts` keeps its native controls stable rather
  // than recreating them: the click listeners below attach exactly once.
  const restart = document.createElement('button')
  restart.className = 'ink-button'
  restart.textContent = 'Restart'
  restart.addEventListener('click', () => {
    restart.blur()
    onRestart()
  })

  const cont = document.createElement('button')
  cont.className = 'ink-button ink-button--primary'
  let onContinue: (() => void) | undefined
  cont.addEventListener('click', () => {
    cont.blur()
    onContinue?.()
  })

  // Design §1: "the debrief gains a second button, 'Return to title', which
  // goes back to the roster rather than only offering Restart" -- present on
  // every model (landing included), not conditioned on a model field the way
  // `continueLabel` is, because it applies uniformly regardless of outcome.
  const returnToTitle = document.createElement('button')
  returnToTitle.className = 'ink-button'
  returnToTitle.textContent = 'Return to title'
  let onReturnToTitle: (() => void) | undefined
  returnToTitle.addEventListener('click', () => {
    returnToTitle.blur()
    onReturnToTitle?.()
  })

  return {
    show(model: DebriefModel, continueHandler?: () => void, returnToTitleHandler?: () => void): void {
      onContinue = continueHandler
      onReturnToTitle = returnToTitleHandler
      panel.textContent = ''

      const sheet = document.createElement('div')
      sheet.className = 'sheet'

      // Outcome stamp (naval-comms spec §3's `.stamp`) -- color and text
      // keyed off the REAL `DebriefModel.outcome` this flight actually
      // produced, never a player-controlled toggle: the prototype's own
      // outcome-switcher buttons (design-prototypes/telegram-ui/debrief.html)
      // are a review-only demo feature for flipping between the three
      // variants by hand, not something this app ships.
      const stampColorClass: Readonly<Record<RecoveryOutcome, string>> = {
        landed: 'stamp--blue',
        ditched: 'stamp--violet',
        killed: 'stamp--red',
      }
      const stamp = document.createElement('div')
      stamp.className =
        `stamp stamp--lg stamp-corner ${stampColorClass[model.outcome]} ` +
        (model.outcome === 'killed' ? 'stamp--rotate-2' : 'stamp--rotate-1')
      stamp.textContent = model.headline
      sheet.appendChild(stamp)

      const letterhead = document.createElement('div')
      letterhead.className = 'letterhead'
      const letterheadText = document.createElement('div')
      letterheadText.className = 'letterhead-text'
      const letterheadKicker = document.createElement('div')
      letterheadKicker.className = 'letterhead-kicker'
      letterheadKicker.textContent = 'Action Report'
      const letterheadTitle = document.createElement('div')
      letterheadTitle.className = 'letterhead-title'
      letterheadTitle.textContent = 'Flight Debrief'
      letterheadText.append(letterheadKicker, letterheadTitle)
      letterhead.appendChild(letterheadText)
      sheet.appendChild(letterhead)

      // Routing header (naval-comms spec §3's `.routing`) -- decorative
      // message-form flavor, the same register as `settings.ts`'s "FORM
      // OPS-4" form number, not new gameplay data: `debrief.ts` is never
      // passed a pilot identity (only `landingModel`'s `shipNames` map, for
      // naming a carrier), so inventing one here would be new plumbing this
      // restyle does not need. "From" names the aircraft rather than a pilot.
      // The Date-Time Group is the one real, dynamic value in the block --
      // this moment, in the standard DDHHMMZ MON YY naval format.
      const routing = document.createElement('dl')
      routing.className = 'routing'
      const routingRow = (term: string, value: string): void => {
        const row = document.createElement('div')
        const dt = document.createElement('dt')
        dt.textContent = term
        const dd = document.createElement('dd')
        dd.textContent = value
        row.append(dt, dd)
        routing.appendChild(row)
      }
      routingRow('From', 'Pilot, this aircraft')
      routingRow('To', 'Bureau of Naval Personnel')
      routingRow('Date-Time Group', formatDtg(new Date()))
      routingRow('Precedence', 'Routine')
      sheet.appendChild(routing)

      const detail = document.createElement('p')
      detail.style.cssText = 'margin:0 0 8px'
      detail.textContent = model.detail
      sheet.appendChild(detail)

      // ---- Flight Figures ----
      sheet.appendChild(sectionTitle('Flight Figures'))
      for (const figure of model.figures) {
        sheet.appendChild(figureRow(figure.label, figure.value))
      }
      // Whole-branch review I-3's three figures (recovery multiplier, banked
      // total, promotion notice) -- given a home in this same section since
      // the prototype predates them and shows no example of its own.
      // `plainRow`, not `figureRow`, for the first two: see that function's
      // own comment on why the exact wording matters.
      sheet.appendChild(plainRow(`Recovery: ${RECOVERY_LABEL[model.outcome]} (×${model.score.multiplier})`))
      if (model.bankedTotal !== undefined) {
        sheet.appendChild(plainRow(`Banked total: ${model.bankedTotal}`))
      }
      if (model.promotedTo !== undefined) {
        // A second stamp (naval-comms spec §3), matching the prototype's own
        // `#promotionStamp` -- both stamps share the one document-level
        // filter `ensureStampFilter()` already declared above.
        const promoted = document.createElement('div')
        promoted.className = 'stamp stamp--violet stamp--md stamp--rotate-3'
        promoted.style.marginTop = '10px'
        promoted.textContent = `Promoted to ${model.promotedTo}!`
        sheet.appendChild(promoted)
      }

      // ---- Targets Destroyed ----
      // All eight of master spec §8's categories, always, zero or not --
      // unchanged from the original DOM's behavior (`model.score.rows` is
      // never filtered), matching `missionScore`'s own contract that every
      // row is present even at zero (tests/render/debrief.test.ts).
      sheet.appendChild(sectionTitle(`Targets Destroyed — score ${model.score.total}`))
      const table = document.createElement('table')
      table.className = 'form-table'
      const thead = document.createElement('thead')
      const headRow = document.createElement('tr')
      for (const label of ['Target', 'Destroyed', 'Score']) {
        const th = document.createElement('th')
        th.textContent = label
        headRow.appendChild(th)
      }
      thead.appendChild(headRow)
      const tbody = document.createElement('tbody')
      for (const row of model.score.rows) {
        const tr = document.createElement('tr')
        const targetCell = document.createElement('td')
        targetCell.textContent = row.target
        const destroyedCell = document.createElement('td')
        destroyedCell.className = 'num'
        destroyedCell.textContent = `${row.destroyed}`
        const scoreCell = document.createElement('td')
        scoreCell.className = 'num'
        scoreCell.textContent = `${row.score}`
        tr.append(targetCell, destroyedCell, scoreCell)
        tbody.appendChild(tr)
      }
      table.append(thead, tbody)
      sheet.appendChild(table)

      // ---- Actions. Unchanged from before this restyle: a crash offers
      // Restart + Return to title, a landing adds Continue -- see this
      // module's own doc comment on `createDebrief` for why. ----
      const buttons = document.createElement('div')
      buttons.className = 'button-row'
      if (model.continueLabel !== undefined) {
        cont.textContent = model.continueLabel
        buttons.appendChild(cont)
      }
      buttons.append(restart, returnToTitle)
      sheet.appendChild(buttons)

      const finePrint = document.createElement('div')
      finePrint.className = 'fine-print'
      const certified = document.createElement('span')
      certified.textContent = 'Figures certified by flight recorder.'
      finePrint.appendChild(certified)
      sheet.appendChild(finePrint)

      panel.appendChild(sheet)
      backdrop.style.display = 'flex'
      if (model.continueLabel !== undefined) cont.focus()
      else restart.focus()
    },
    hide(): void {
      backdrop.style.display = 'none'
    },
  }
}
