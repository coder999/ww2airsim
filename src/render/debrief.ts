import type { Impact } from '../sim/loop.js'
import type { AircraftState } from '../sim/flight/state.js'
import { attitudeAngles } from '../sim/flight/attitude.js'
import { length } from '../sim/math/vec3.js'
import type { LandingReport } from './landing.js'
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

const MPH_PER_MPS = 2.23694

/** What the debrief says about a landing (Mark, 2026-09-17: "successful
 *  landing - nice job! (or similar)"). Pure, like `debriefModel`.
 *  `shipNames` maps a carrier's ship id (`LandingReport.at.name`) to its
 *  display name -- `landing.ts` names a carrier by id because that is what
 *  `nextLandingTracking` has in hand; `main.ts` passes the world's ships. */
export function landingModel(
  report: LandingReport,
  killsSinceLastBank: Readonly<Record<TargetType, number>>,
  shipNames: Readonly<Record<string, string>> = {},
): DebriefModel {
  const mph = (mps: number) => Math.round(mps * MPH_PER_MPS)
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
      { label: 'Touchdown sink', value: `${report.touchdownSinkMps.toFixed(1)} m/s` },
      {
        label: 'Touchdown speed',
        value: `${report.touchdownSpeedMps.toFixed(1)} m/s (${mph(report.touchdownSpeedMps)} mph)`,
      },
      { label: 'Roll-out', value: `${Math.round(report.rollOutM)} m` },
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
    { label: 'Impact speed', value: `${Math.round(length(state.velocity))} m/s` },
    // Sink is a negative `velocity.y` (same sign convention `contact.ts`'s
    // `sinkingGently` gate checks); negated here so the figure reads as a
    // positive sink rate instead of a confusing minus sign next to two
    // positive figures.
    { label: 'Sink rate', value: `${Math.round(-impact.verticalSpeedMps)} m/s` },
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
      { label: 'Final speed', value: `${Math.round(length(state.velocity))} m/s` },
      { label: 'Altitude', value: `${Math.round(state.position.y)} m` },
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
 */
export function createDebrief(root: HTMLElement, onRestart: () => void): DebriefHandle {
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
  panel.style.cssText =
    'min-width:340px;max-width:560px;padding:18px 20px;border:1px solid #2b3440;' +
    'border-radius:6px;background:#eceff3;color:#151b22;' +
    'font:13px/1.5 ui-monospace,Menlo,monospace;box-shadow:0 12px 40px rgba(0,0,0,.45)'
  backdrop.appendChild(panel)
  root.appendChild(backdrop)

  const restart = document.createElement('button')
  restart.textContent = 'Restart'
  restart.style.cssText =
    'margin-top:14px;padding:6px 14px;border:1px solid #2b3440;border-radius:4px;' +
    'background:#fff;color:#151b22;font:12px ui-monospace,Menlo,monospace;cursor:pointer'
  restart.addEventListener('click', () => {
    restart.blur()
    onRestart()
  })

  const cont = document.createElement('button')
  cont.style.cssText = restart.style.cssText + ';margin-right:10px'
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
  returnToTitle.textContent = 'Return to title'
  returnToTitle.style.cssText = restart.style.cssText + ';margin-left:10px'
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
      const headline = document.createElement('div')
      headline.style.cssText = 'font-size:20px;font-weight:700;letter-spacing:.1em'
      headline.textContent = model.headline
      const detail = document.createElement('p')
      detail.style.cssText = 'margin:6px 0 12px'
      detail.textContent = model.detail
      panel.append(headline, detail)

      for (const figure of model.figures) {
        const row = document.createElement('div')
        row.style.cssText = 'display:flex;justify-content:space-between;gap:24px'
        const label = document.createElement('span')
        label.style.color = '#55606b'
        label.textContent = figure.label
        const value = document.createElement('strong')
        value.textContent = figure.value
        row.append(label, value)
        panel.appendChild(row)
      }

      const scoreHeading = document.createElement('div')
      scoreHeading.style.cssText = 'margin:14px 0 4px;font-weight:700'
      scoreHeading.textContent = `Targets destroyed — score ${model.score.total}`
      panel.appendChild(scoreHeading)
      for (const row of model.score.rows) {
        const line = document.createElement('div')
        line.style.cssText = 'display:flex;justify-content:space-between;gap:24px;color:#55606b'
        const target = document.createElement('span')
        target.textContent = row.target
        const count = document.createElement('span')
        count.textContent = `${row.destroyed}`
        const score = document.createElement('span')
        score.textContent = `${row.score}`
        line.append(target, count, score)
        panel.appendChild(line)
      }

      // Whole-branch review I-3: design doc §1's three promised figures this
      // panel was missing entirely -- the recovery multiplier actually
      // applied, the pilot's banked cumulative total, and (only when it
      // actually happened) a promotion notice. Terse, matching this file's
      // existing style rather than a new heading of its own.
      const recovery = document.createElement('div')
      recovery.style.cssText = 'margin-top:6px;color:#55606b'
      recovery.textContent = `Recovery: ${RECOVERY_LABEL[model.outcome]} (×${model.score.multiplier})`
      panel.appendChild(recovery)
      if (model.bankedTotal !== undefined) {
        const banked = document.createElement('div')
        banked.style.cssText = 'color:#55606b'
        banked.textContent = `Banked total: ${model.bankedTotal}`
        panel.appendChild(banked)
      }
      if (model.promotedTo !== undefined) {
        const promoted = document.createElement('div')
        promoted.style.cssText = 'margin-top:4px;font-weight:700'
        promoted.textContent = `Promoted to ${model.promotedTo}!`
        panel.appendChild(promoted)
      }

      if (model.continueLabel !== undefined) {
        cont.textContent = model.continueLabel
        panel.appendChild(cont)
      }
      panel.appendChild(restart)
      panel.appendChild(returnToTitle)
      backdrop.style.display = 'flex'
      if (model.continueLabel !== undefined) cont.focus()
      else restart.focus()
    },
    hide(): void {
      backdrop.style.display = 'none'
    },
  }
}
