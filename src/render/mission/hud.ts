/**
 * The in-flight objective line and radio line (spec §3; ruling R7, R8).
 * Split like `paddlesBadge.ts`: a pure half a Node test pins, thin DOM under
 * it. Both read `World.mission` only; neither owns any sim state.
 */
import { DT } from '../../sim/flight/model.js'
import type { World } from '../../sim/loop.js'
import { radioMessages, type MissionLogEntry, type MissionState } from '../../sim/mission/state.js'
import { steeringCueFor, steeringCueLabel } from './steeringCue.js'

const MAX_SHOWN = 2

/** The current primary objective(s), compact (spec §3; ruling R7). The
 *  three standing orders -- `protect`, `deny` and `approaches` -- hold for
 *  the whole flight and never appear on the line; the chart lists them. */
export function objectiveLineLabel<M>(m: MissionState<M> | null): string | null {
  if (m === null) return null
  const primaries = m.objectives.map((o, i) => ({ o, p: m.progress[i]! })).filter(({ o }) => o.priority === 'primary')
  const failed = primaries.some(({ p }) => p.status === 'failed')
  const parts = primaries
    .filter(({ o, p }) => p.status === 'active' && o.kind !== 'protect' && o.kind !== 'deny' && o.kind !== 'approaches')
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

/**
 * What the radio line plays: the mission's messages, with the friendly-fire
 * call (`friendlyFireRadio`, src/render/discharge.ts) merged in by tick --
 * after any mission message of the same tick. Works without a mission: the
 * friendly-fire test ranges have none. Both sources are append-only as the
 * flight goes on (the call is set once, at a tick no later than now), so the
 * feed only grows and `RadioLine.seen` stays a valid count.
 */
export function radioFeed<M>(m: MissionState<M> | null, friendlyFire: { readonly tick: number; readonly text: string } | null): readonly { readonly text: string }[] {
  const messages = m === null ? [] : radioMessages(m)
  if (friendlyFire === null) return messages
  const at = messages.findIndex((x) => x.tick > friendlyFire.tick)
  return at < 0 ? [...messages, friendlyFire] : [...messages.slice(0, at), friendlyFire, ...messages.slice(at)]
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
  update<M>(world: World<M>, selectedNavigationId: string | null, frameMs: number, paused: boolean, friendlyFire?: { readonly tick: number; readonly text: string } | null): void
  reset(): void
  text(): { objective: string | null; radio: string | null; steering: string | null }
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

  const steeringEl = document.createElement('div')
  steeringEl.setAttribute('aria-label', 'Steering cue')
  steeringEl.style.cssText =
    'position:fixed;left:50%;top:111px;transform:translateX(-50%);padding:4px 10px;' +
    'border:1px solid #2b3440;border-radius:4px;background:rgba(12,14,18,.72);color:#e8d9a8;' +
    'font:13px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.06em;white-space:nowrap;' +
    'pointer-events:none;display:none;z-index:9'
  const steeringArrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  steeringArrow.setAttribute('aria-hidden', 'true')
  steeringArrow.setAttribute('viewBox', '0 0 16 16')
  steeringArrow.style.cssText = 'display:inline-block;width:16px;height:16px;margin-right:8px;vertical-align:-3px;transform-origin:50% 50%'
  const steeringArrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  steeringArrowPath.setAttribute('d', 'M8 14V3M3.5 7.5 8 3l4.5 4.5')
  steeringArrowPath.setAttribute('fill', 'none')
  steeringArrowPath.setAttribute('stroke', 'currentColor')
  steeringArrowPath.setAttribute('stroke-width', '1.5')
  steeringArrowPath.setAttribute('stroke-linecap', 'square')
  steeringArrowPath.setAttribute('stroke-linejoin', 'miter')
  steeringArrow.appendChild(steeringArrowPath)
  const steeringText = document.createElement('span')
  steeringEl.append(steeringArrow, steeringText)
  root.appendChild(steeringEl)

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
  let shownSteering: string | null = null

  return {
    update<M>(world: World<M>, selectedNavigationId: string | null, frameMs: number, paused: boolean, friendlyFire: { readonly tick: number; readonly text: string } | null = null): void {
      const m = world.mission
      const objective = objectiveLineLabel(m)
      if (objective !== shownObjective) {
        shownObjective = objective
        objectiveEl.textContent = objective ?? ''
        objectiveEl.style.display = objective === null ? 'none' : 'block'
      }

      radio = nextRadioLine(radio, radioFeed(m, friendlyFire), paused ? 0 : frameMs)
      if (radio.text !== shownRadio) {
        shownRadio = radio.text
        radioEl.textContent = radio.text ?? ''
        radioEl.style.display = radio.text === null ? 'none' : 'block'
      }

      const steering = steeringCueFor(world, selectedNavigationId)
      const steeringLabel = steering === null ? null : steeringCueLabel(steering)
      if (steeringLabel !== shownSteering) {
        shownSteering = steeringLabel
        steeringText.textContent = steeringLabel ?? ''
        steeringEl.style.display = steeringLabel === null ? 'none' : 'block'
      }
      if (steering !== null) steeringArrow.style.transform = `rotate(${steering.bearingRad}rad)`
    },
    reset(): void {
      radio = NO_RADIO
      shownObjective = null
      shownRadio = null
      objectiveEl.textContent = ''
      objectiveEl.style.display = 'none'
      radioEl.textContent = ''
      radioEl.style.display = 'none'
      shownSteering = null
      steeringText.textContent = ''
      steeringEl.style.display = 'none'
      steeringArrow.style.transform = 'rotate(0rad)'
    },
    text(): { objective: string | null; radio: string | null; steering: string | null } {
      return { objective: shownObjective, radio: shownRadio, steering: shownSteering }
    },
  }
}

/** `window.__ww2.mission()` (diagnostics.ts), for tests/e2e/mission-ui.spec.ts:
 *  what the two HUD lines are showing, the mission's log and spawned groups,
 *  and every held-group mesh by entity id with its visibility (M2 R1). */
export type MissionDiagnostics = {
  readonly objective: string | null
  readonly radio: string | null
  readonly steering: string | null
  readonly log: readonly MissionLogEntry[]
  readonly spawned: readonly string[]
  readonly meshes: readonly { readonly id: string; readonly visible: boolean }[]
}

/** Builds `MissionDiagnostics` here rather than inline in main.ts's `__ww2`
 *  object, which keeps main.ts to one call (the M2 footprint constraint).
 *  `null` without a mission, or before the scenario's entities are built. */
export function missionDiagnostics<M>(
  m: MissionState<M> | null,
  hud: Pick<MissionHudHandle, 'text'>,
  entities: { readonly held: { readonly airframes: ReadonlyMap<string, { readonly root: { readonly visible: boolean } }> } } | null,
): MissionDiagnostics | null {
  if (m === null || entities === null) return null
  const shown = hud.text()
  return {
    objective: shown.objective, radio: shown.radio, steering: shown.steering, log: m.log, spawned: m.spawned,
    meshes: [...entities.held.airframes].map(([id, a]) => ({ id, visible: a.root.visible })),
  }
}
