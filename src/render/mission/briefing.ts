import type { Scenario } from '../../sim/scenario.js'
import type { Loadout } from '../../sim/weapons/stores.js'
import { formatKnots } from '../dossier.js'
import { figureRow, sectionTitle } from '../ui/navalComms.js'

/**
 * The orders memo's briefing panel (M2 Task 6; missions spec §3): what the
 * title's Form 2 shows under the pickers once a MISSION is selected. Pure
 * model first (`briefingModel`, `conditionsFor`, `briefingRequest`, pinned
 * by `tests/render/mission/briefing.test.ts`), thin DOM under it
 * (`renderBriefing`, covered by E2E).
 */
export type BriefingModel = {
  readonly situation: string | null
  readonly history: { readonly text: string; readonly sources: readonly string[] } | null
  readonly objectives: readonly { readonly label: string; readonly priority: 'PRIMARY' | 'SECONDARY' }[]
  readonly conditions: readonly { readonly label: string; readonly value: string }[]
  readonly loadout: Loadout | null
  readonly badge: { readonly name: string; readonly held: boolean } | null
}

const FT_PER_M = 1 / 0.3048

const pad = (n: number, width: number): string => String(n).padStart(width, '0')

/** Coverage (0..1) as the pilot's word for it: oktas are
 *  `max(1, round(c * 8))`, then 1-2 Few, 3-4 Scattered, 5-7 Broken,
 *  8 Overcast (plan "Measured"). Only called for `c > 0`. */
function coverageWord(coverage: number): string {
  const oktas = Math.max(1, Math.round(coverage * 8))
  if (oktas <= 2) return 'Few'
  if (oktas <= 4) return 'Scattered'
  if (oktas <= 7) return 'Broken'
  return 'Overcast'
}

/** Time, wind and cloud as a pilot reads them. `timeOfDay` absent is noon,
 *  the renderer's own default (`scenario.ts`); cloud bases round to the
 *  nearest 100 ft; layers read in base order, whatever order the file uses. */
export function conditionsFor(weather: Scenario['weather']): BriefingModel['conditions'] {
  const minutes = Math.round((weather.timeOfDay ?? 12) * 60) % (24 * 60)
  const time = `${pad(Math.floor(minutes / 60), 2)}${pad(minutes % 60, 2)} local`
  const wind = weather.windMps === 0
    ? 'Calm'
    : `From ${pad(Math.round(weather.windFromDeg), 3)}° at ${formatKnots(weather.windMps)}`
  const layers = (weather.clouds ?? [])
    .filter((l) => l.coverage > 0)
    .sort((a, b) => a.baseM - b.baseM)
    .map((l) => {
      const feet = Math.round((l.baseM * FT_PER_M) / 100) * 100
      return `${coverageWord(l.coverage)} ${l.kind}, base ${feet.toLocaleString('en-US')} ft`
    })
  return [
    { label: 'Time', value: time },
    { label: 'Wind', value: wind },
    { label: 'Cloud', value: layers.length === 0 ? 'Clear' : layers.join('; ') },
  ]
}

/** The briefing a scenario file declares. `heldBadges` is the selected
 *  pilot's roster `badges` (ids, M2 R4). */
export function briefingModel(s: Scenario, heldBadges: readonly string[]): BriefingModel {
  return {
    situation: s.briefing?.situation ?? null,
    history: s.history ?? null,
    objectives: (s.objectives ?? []).map((o) => ({
      label: o.label,
      priority: o.priority === 'primary' ? 'PRIMARY' : 'SECONDARY',
    })),
    conditions: conditionsFor(s.weather),
    loadout: s.briefing?.loadout ?? null,
    badge: s.badge === undefined ? null : { name: s.badge.name, held: heldBadges.includes(s.badge.id) },
  }
}

/**
 * Latest-wins fetching (Review Focus 5): the player can pick mission A, then
 * mission B before A's file arrives. Every call supersedes the ones before
 * it, so a stale result -- or a stale failure -- never reaches the screen,
 * whichever order the fetches settle in.
 */
export function briefingRequest(
  load: (id: string) => Promise<Scenario>,
): (id: string, apply: (s: Scenario) => void, fail: () => void) => void {
  let latest = 0
  return (id, apply, fail) => {
    const ticket = ++latest
    load(id).then(
      (s) => { if (ticket === latest) apply(s) },
      () => { if (ticket === latest) fail() },
    )
  }
}

/** The small blue AWARDED stamp (PF4): shared by the briefing's badge row and
 *  the title's mission rows. Needs `ensureStampFilter()`, which the title
 *  screen already calls before building anything. */
export function awardedStamp(): HTMLSpanElement {
  const stamp = document.createElement('span')
  stamp.className = 'stamp stamp--sm stamp--blue stamp--rotate-0'
  stamp.style.marginLeft = '10px'
  stamp.textContent = 'AWARDED'
  return stamp
}

const PARAGRAPH_STYLE = 'margin:0 0 10px;font-size:13px;line-height:1.55'
const SOURCES_STYLE = 'margin:0 0 10px;font-size:11.5px;line-height:1.45;color:var(--ink-faint)'

function paragraph(text: string, style = PARAGRAPH_STYLE): HTMLParagraphElement {
  const p = document.createElement('p')
  p.style.cssText = style
  p.textContent = text
  return p
}

/** Replaces `el`'s content with the briefing (or its loading/failed line). */
export function renderBriefing(el: HTMLElement, m: BriefingModel | 'loading' | 'unavailable'): void {
  const section = document.createElement('section')
  section.setAttribute('aria-label', 'Briefing')
  section.appendChild(sectionTitle('Briefing'))
  if (m === 'loading' || m === 'unavailable') {
    section.appendChild(paragraph(m === 'loading' ? 'Retrieving orders…' : 'Orders unavailable.'))
    el.replaceChildren(section)
    return
  }
  if (m.situation !== null) section.appendChild(paragraph(m.situation))
  if (m.history !== null) {
    section.append(
      sectionTitle('Background'),
      paragraph(m.history.text),
      paragraph(`Sources: ${m.history.sources.join('; ')}`, SOURCES_STYLE),
    )
  }
  if (m.objectives.length > 0) {
    section.appendChild(sectionTitle('Objectives'))
    for (const o of m.objectives) section.appendChild(figureRow(o.label, o.priority))
  }
  section.appendChild(sectionTitle('Conditions'))
  for (const c of m.conditions) section.appendChild(figureRow(c.label, c.value))
  if (m.loadout !== null) section.appendChild(figureRow('Recommended loadout', m.loadout.charAt(0).toUpperCase() + m.loadout.slice(1)))
  if (m.badge !== null) {
    const row = figureRow('Badge', m.badge.name)
    if (m.badge.held) row.lastElementChild!.appendChild(awardedStamp())
    section.appendChild(row)
  }
  el.replaceChildren(section)
}
