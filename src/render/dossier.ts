import { ensureStampFilter } from './ui/navalComms.js'
import { RANK_LADDER, type PilotRecord, type Rank } from './roster.js'
import { TARGET_TYPES } from '../sim/weapons/targetType.js'

/**
 * The pilot Dossier (dossier spec §B.4): a pure model for Tier 1 and a thin
 * memo-sheet DOM, the debrief.ts split. Every pilot-supplied string reaches
 * the DOM through `textContent` only.
 */
const FT_PER_M = 1 / 0.3048
const KT_PER_MPS = 1.943844

export const formatHours = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`
}
export const formatFeet = (m: number): string => `${Math.round(m * FT_PER_M).toLocaleString('en-US')} ft`
export const formatKnots = (mps: number): string => `${Math.round(mps * KT_PER_MPS)} kt`

export function nextRankProgress(score: number): { readonly next: Rank | null; readonly fraction: number } {
  const i = RANK_LADDER.findIndex((r) => r.threshold > score)
  if (i === -1) return { next: null, fraction: 1 }
  const prev = RANK_LADDER[i - 1]!
  const next = RANK_LADDER[i]!
  return { next, fraction: (score - prev.threshold) / (next.threshold - prev.threshold) }
}

const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
const OUTCOME_LABEL = { trap: 'Trap', field: 'Field landing', ditched: 'Ditched', killed: 'Killed' } as const

export type DossierLogRow = {
  readonly date: string; readonly scenario: string; readonly aircraft: string; readonly outcome: string
  readonly points: number; readonly kills: number; readonly time: string; readonly altitude: string; readonly speed: string
}
export type DossierModel = {
  readonly header: { readonly name: string; readonly rank: string; readonly status: string; readonly score: number; readonly nextRank: string; readonly fraction: number }
  readonly record: readonly (readonly [string, string])[]
  readonly kills: readonly (readonly [string, number])[]
  readonly badges: readonly string[]
  readonly badgesEmpty: string
  readonly since: string
  readonly log: readonly DossierLogRow[]
}

export function dossierModel(pilot: PilotRecord, scenarioLabel: (id: string) => string): DossierModel {
  const { next, fraction } = nextRankProgress(pilot.cumulativeScore)
  const c = pilot.career
  const status = pilot.status === 'kia' ? 'K.I.A.' : 'Active'
  return {
    header: {
      name: pilot.name,
      rank: `${pilot.rank.abbrev}, ${pilot.rank.name}`,
      status: pilot.resurrections > 0 ? `${status} · resurrected ${pilot.resurrections}×` : status,
      score: pilot.cumulativeScore,
      nextRank: next === null ? 'Highest rank' : `Next: ${next.name} at ${next.threshold.toLocaleString('en-US')}`,
      fraction,
    },
    record: [
      ['Flight hours', formatHours(c.flightSeconds)],
      ['Sorties', String(pilot.sorties)],
      ['Missions', String(pilot.missionsFlown)],
      ['Landings', `${c.landings.trap} trap · ${c.landings.field} field · ${c.landings.ditched} ditched`],
      ['Highest altitude', formatFeet(c.maxAltitudeM)],
      ['Fastest speed', `${formatKnots(c.maxTrueAirspeedMps)} TAS`],
    ],
    kills: TARGET_TYPES.map((t) => [titleCase(t === 'aaa' ? 'AAA' : t), pilot.killsByType[t]] as const),
    badges: pilot.badges,
    badgesEmpty: 'No badges yet — awarded for completing mission objectives.',
    since: pilot.log.length === 0 ? 'No missions logged yet' : `Records kept since ${pilot.log[0]!.at.slice(0, 10)}`,
    log: [...pilot.log].reverse().map((e) => ({
      date: e.at.slice(0, 10),
      scenario: scenarioLabel(e.scenarioId),
      aircraft: e.aircraft,
      outcome: OUTCOME_LABEL[e.outcome],
      points: e.points,
      kills: Object.values(e.killsByType).reduce((s, n) => s + n, 0),
      time: formatHours(e.flightSeconds),
      altitude: formatFeet(e.maxAltitudeM),
      speed: formatKnots(e.maxTrueAirspeedMps),
    })),
  }
}

export function openDossier(host: HTMLElement, pilot: PilotRecord, scenarioLabel: (id: string) => string, onClose: () => void): void {
  ensureStampFilter()
  const m = dossierModel(pilot, scenarioLabel)
  const panel = document.createElement('div')
  panel.className = 'naval-comms'
  panel.dataset.ww2Dossier = ''
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-label', `Dossier: ${pilot.name}`)
  panel.style.cssText = 'position:absolute;inset:0;overflow-y:auto;background:rgba(11,13,16,.82);z-index:30;display:flex'
  const sheet = document.createElement('div')
  sheet.className = 'sheet'
  sheet.style.cssText = 'width:min(900px,92vw);margin:4vh auto'
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag)
    if (text !== undefined) e.textContent = text
    if (className !== undefined) e.className = className
    return e
  }
  const heading = (t: string): HTMLDivElement => el('div', t, 'form-section-title')
  const table = (head: readonly string[], rows: readonly (readonly (string | number)[])[]): HTMLTableElement => {
    const t = el('table', undefined, 'form-table')
    const hr = el('tr'); for (const h of head) hr.appendChild(el('th', h))
    const thead = el('thead'); thead.appendChild(hr)
    const tbody = el('tbody')
    for (const r of rows) {
      const tr = el('tr')
      for (const c of r) { const td = el('td', String(c)); if (typeof c === 'number') td.className = 'num'; tr.appendChild(td) }
      tbody.appendChild(tr)
    }
    t.append(thead, tbody)
    return t
  }

  // 1. Header
  sheet.appendChild(el('div', 'Pilot Dossier', 'letterhead-kicker'))
  sheet.appendChild(el('div', m.header.name, 'letterhead-title'))
  sheet.appendChild(el('p', `${m.header.rank} · ${m.header.status} · ${m.header.score.toLocaleString('en-US')} points`))
  const bar = el('div')
  bar.setAttribute('role', 'progressbar')
  bar.setAttribute('aria-valuenow', String(Math.round(m.header.fraction * 100)))
  bar.style.cssText = 'height:6px;background:rgba(0,0,0,.12)'
  const fill = el('div'); fill.style.cssText = `height:100%;width:${Math.round(m.header.fraction * 100)}%;background:var(--ink-faint)`
  bar.appendChild(fill)
  sheet.append(bar, el('p', m.header.nextRank))
  // 2. Service record
  sheet.append(heading('Service Record'), table(['', ''], m.record))
  // 3. Kills
  sheet.append(heading('Kills by Type'), table(['Type', 'Kills'], m.kills))
  // 4. Badges
  sheet.appendChild(heading('Badges'))
  if (m.badges.length === 0) sheet.appendChild(el('p', m.badgesEmpty))
  else { const row = el('div'); for (const b of m.badges) row.appendChild(el('span', b, 'stamp-chip')); sheet.appendChild(row) }
  // 5. Mission log
  sheet.append(heading('Mission Log'), el('p', m.since))
  const logScroll = el('div'); logScroll.style.cssText = 'max-height:40vh;overflow-y:auto'
  logScroll.appendChild(table(['Date', 'Scenario', 'Aircraft', 'Outcome', 'Points', 'Kills', 'Time', 'Peak alt', 'Peak spd'],
    m.log.map((r) => [r.date, r.scenario, r.aircraft, r.outcome, r.points, r.kills, r.time, r.altitude, r.speed])))
  sheet.appendChild(logScroll)
  // Close
  const close = el('button', 'Close', 'ink-button')
  const row = el('div', undefined, 'button-row'); row.appendChild(close)
  sheet.appendChild(row)
  panel.appendChild(sheet)
  host.appendChild(panel)

  const done = (): void => { window.removeEventListener('keydown', onKey, true); panel.remove(); onClose() }
  const onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'Escape' && e.code !== 'Enter' && e.code !== 'NumpadEnter') return
    // Capture phase + stop: neither Escape nor Enter may reach the title's
    // own onKey (which would advance or launch) while the dossier is open.
    e.stopPropagation()
    if (e.code === 'Escape') { e.preventDefault(); done() }
  }
  window.addEventListener('keydown', onKey, true)
  close.addEventListener('click', done)
  close.focus()
}
