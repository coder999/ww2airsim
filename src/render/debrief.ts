import type { Impact } from '../sim/loop.js'
import type { AircraftState } from '../sim/flight/state.js'
import { attitudeAngles } from '../sim/flight/attitude.js'
import { length } from '../sim/math/vec3.js'

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
}

/** What the debrief says about how a flight ended. Pure, so the node-environment
 *  suite can assert on all of it; the DOM in `createDebrief` renders it. */
export function debriefModel(impact: Impact, state: AircraftState): DebriefModel {
  const { rollRad } = attitudeAngles(state)
  const figures: DebriefFigure[] = [
    { label: 'Impact speed', value: `${Math.round(length(state.velocity))} m/s` },
    { label: 'Sink rate', value: `${Math.round(impact.verticalSpeedMps)} m/s` },
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
  return {
    headline: 'KILLED',
    detail:
      impact.surface === 'water'
        ? 'You went into the sea. There was nothing left to recover.'
        : 'You went into Leyte. There was nothing left to recover.',
    figures,
    score: missionScore(),
  }
}
