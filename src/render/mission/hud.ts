/**
 * The in-flight objective line and radio line (spec §3; ruling R7, R8).
 * Split like `paddlesBadge.ts`: a pure half a Node test pins, thin DOM under
 * it. Both read `World.mission` only; neither owns any sim state.
 */
import { DT } from '../../sim/flight/model.js'
import { radioMessages, type MissionState } from '../../sim/mission/state.js'

const MAX_SHOWN = 2

/** The current primary objective(s), compact (spec §3; ruling R7). */
export function objectiveLineLabel<M>(m: MissionState<M> | null): string | null {
  if (m === null) return null
  const primaries = m.objectives.map((o, i) => ({ o, p: m.progress[i]! })).filter(({ o }) => o.priority === 'primary')
  const failed = primaries.some(({ p }) => p.status === 'failed')
  const parts = primaries
    .filter(({ o, p }) => p.status === 'active' && o.kind !== 'protect' && o.kind !== 'deny')
    .slice(0, MAX_SHOWN)
    .map(({ o, p }) => {
      const name = o.label.toUpperCase()
      if (o.kind === 'destroy') return `${name} ${p.count}/${o.count ?? o.resolved.length}`
      if (o.kind === 'land' && (o.count ?? 1) > 1) return `${name} ${p.count}/${o.count}`
      if (o.kind === 'hold') return `${name} ${Math.floor(p.heldTicks * DT + 1e-9)}/${o.seconds} S`
      return name
    })
  if (parts.length > 0) return `${failed ? 'NO BADGE · ' : ''}${parts.join(' · ')}`
  if (failed) return 'NO BADGE · RETURN TO BASE'
  return primaries.every(({ p }) => p.status === 'complete') ? 'OBJECTIVES COMPLETE' : null
}

export const RADIO_SHOW_MS = 5000
export type RadioLine = { readonly seen: number; readonly text: string | null; readonly remainingMs: number }
export const NO_RADIO: RadioLine = { seen: 0, text: null, remainingMs: 0 }

/** One radio-line step (ruling R8). `dtMs` is 0 while paused (open question 4). */
export function nextRadioLine(r: RadioLine, messages: readonly { readonly text: string }[], dtMs: number): RadioLine {
  const base = messages.length < r.seen ? NO_RADIO : r
  const left = base.text === null ? 0 : base.remainingMs - dtMs
  if (left > 0) return { ...base, remainingMs: left }
  const next = messages[base.seen]
  return next === undefined ? { seen: base.seen, text: null, remainingMs: 0 } : { seen: base.seen + 1, text: next.text, remainingMs: RADIO_SHOW_MS }
}

export type MissionHudHandle = {
  update<M>(m: MissionState<M> | null, frameMs: number, paused: boolean): void
  reset(): void
  text(): { objective: string | null; radio: string | null }
}

/** `paddlesBadge.ts`'s pattern: create the two elements once, then write
 *  only on change (a `shown` guard each), so an unchanging label costs no
 *  DOM write per frame. */
export function createMissionHud(root: HTMLElement): MissionHudHandle {
  const objectiveEl = document.createElement('div')
  objectiveEl.setAttribute('aria-label', 'Objective')
  objectiveEl.style.cssText =
    'position:fixed;left:50%;top:72px;transform:translateX(-50%);padding:4px 12px;' +
    'border:1px solid #2b3440;border-radius:4px;background:rgba(12,14,18,.72);color:#e8d9a8;' +
    'font:13px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.08em;white-space:nowrap;' +
    'pointer-events:none;display:none;z-index:9'
  root.appendChild(objectiveEl)

  const radioEl = document.createElement('div')
  radioEl.setAttribute('role', 'status')
  radioEl.setAttribute('aria-label', 'Radio')
  radioEl.setAttribute('aria-live', 'polite')
  radioEl.style.cssText =
    'position:fixed;left:50%;top:24%;transform:translateX(-50%);padding:6px 14px;' +
    'border:1px solid #2b3440;border-radius:6px;background:rgba(12,14,18,.78);color:#bfe8c8;' +
    'font:15px/1.35 ui-monospace,Menlo,monospace;letter-spacing:.04em;max-width:min(720px,80vw);' +
    'pointer-events:none;display:none;z-index:9'
  root.appendChild(radioEl)

  let radio: RadioLine = NO_RADIO
  let shownObjective: string | null = null
  let shownRadio: string | null = null

  return {
    update<M>(m: MissionState<M> | null, frameMs: number, paused: boolean): void {
      const objective = objectiveLineLabel(m)
      if (objective !== shownObjective) {
        shownObjective = objective
        objectiveEl.textContent = objective ?? ''
        objectiveEl.style.display = objective === null ? 'none' : 'block'
      }

      radio = nextRadioLine(radio, m === null ? [] : radioMessages(m), paused ? 0 : frameMs)
      if (radio.text !== shownRadio) {
        shownRadio = radio.text
        radioEl.textContent = radio.text ?? ''
        radioEl.style.display = radio.text === null ? 'none' : 'block'
      }
    },
    reset(): void {
      radio = NO_RADIO
      shownObjective = null
      shownRadio = null
      objectiveEl.textContent = ''
      objectiveEl.style.display = 'none'
      radioEl.textContent = ''
      radioEl.style.display = 'none'
    },
    text(): { objective: string | null; radio: string | null } {
      return { objective: shownObjective, radio: shownRadio }
    },
  }
}
