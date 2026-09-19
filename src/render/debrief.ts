import type { Impact } from '../sim/loop.js'
import type { AircraftState } from '../sim/flight/state.js'
import { attitudeAngles } from '../sim/flight/attitude.js'
import { length } from '../sim/math/vec3.js'
import type { LandingReport } from './landing.js'

export type ScoreRow = {
  readonly target: string
  readonly destroyed: number
  readonly score: number
}

/**
 * The mission's score.
 *
 * A stub, and deliberately the ONLY one: scoring is Plan 9's (master spec §8),
 * and nothing destructible exists yet, so every honest number here is zero.
 * The categories are §8's own table, so Plan 9 replaces this one function
 * rather than a scattering of assumptions spread through a dialog.
 */
export function missionScore(): { readonly rows: readonly ScoreRow[]; readonly total: number } {
  const targets = ['Fighter', 'Bomber', 'AAA Battery', 'Carrier', 'Battleship', 'Cruiser', 'Runway']
  return { rows: targets.map((target) => ({ target, destroyed: 0, score: 0 })), total: 0 }
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
}

const MPH_PER_MPS = 2.23694

/** What the debrief says about a landing (Mark, 2026-09-17: "successful
 *  landing - nice job! (or similar)"). Pure, like `debriefModel`.
 *  `shipNames` maps a carrier's ship id (`LandingReport.at.name`) to its
 *  display name -- `landing.ts` names a carrier by id because that is what
 *  `nextLandingTracking` has in hand; `main.ts` passes the world's ships. */
export function landingModel(report: LandingReport, shipNames: Readonly<Record<string, string>> = {}): DebriefModel {
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
    score: missionScore(),
    continueLabel: 'Continue',
  }
}

/** What the debrief says about how a flight ended. Pure, so the node-environment
 *  suite can assert on all of it; the DOM in `createDebrief` renders it. */
export function debriefModel(impact: Impact, state: AircraftState): DebriefModel {
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
      score: missionScore(),
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
    score: missionScore(),
  }
}

export type DebriefHandle = {
  /** `onContinue` is called when the model's `continueLabel` button is
   *  pressed; a model without one shows no such button and never calls it. */
  show(model: DebriefModel, onContinue?: () => void): void
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
 * ONE button for a crash. "Resume" is meaningless after a death, and the 1991
 * original's "End Mission" returns to a mission selector this game does not
 * have -- a button that goes nowhere is how a stale document starts. Plan 9
 * adds the menu and the button that reaches it. A LANDING (2026-09-17) is the
 * one outcome the flight survives, so its model carries a `continueLabel`
 * and this renders a second button for it; the caller decides what
 * continuing means (releasing the pause it took when it showed the dialog).
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

  return {
    show(model: DebriefModel, continueHandler?: () => void): void {
      onContinue = continueHandler
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

      if (model.continueLabel !== undefined) {
        cont.textContent = model.continueLabel
        panel.appendChild(cont)
      }
      panel.appendChild(restart)
      backdrop.style.display = 'flex'
      if (model.continueLabel !== undefined) cont.focus()
      else restart.focus()
    },
    hide(): void {
      backdrop.style.display = 'none'
    },
  }
}
