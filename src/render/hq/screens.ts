/**
 * The headquarters screens' DOM (plan F5B Tasks 6 and 7): Personnel Files, the new-campaign form, Air Group
 * Headquarters (the chosen first view, variant A) and its secondary views. Thin: every string and number comes
 * from `hq/model.ts` and the campaign reducers; nothing here computes rank, score or eligibility. Every
 * player-supplied or pilot-supplied string reaches the DOM through `textContent` only.
 */
import { COMMAND_TITLES, commandTitleOf, isValidPlayerName, PLAYER_NAME_MAX, type Campaign, type Faction, type MissionDescriptor } from '../../campaign/index.js'
import type { Scenario } from '../../sim/scenario.js'
import { TITLE_ART_URL } from '../content.js'
import { rankDevice } from '../insignia.js'
import { awardedStamp, briefingModel, briefingRequest, renderBriefing } from '../mission/briefing.js'
import { ribbonElement } from '../insignia.js'
import { buttonRow, inkButton, letterhead, memoPanel, sectionTitle } from '../ui/memo.js'
import { ballotOption, ensureStampFilter, radioGroup } from '../ui/navalComms.js'
import { formatPoints } from './format.js'
import {
  SERVICE_NAME, archiveModel, chaptersModel, commanderDossierModel, hqModel, importConflictModel, pickerRows,
  pilotChoices, pilotDossierModel, type ArchiveFilter, type PickerOption, type PickerRow,
} from './model.js'
import type { Session } from '../campaignSession.js'

export type AssignRequest = { readonly row: PickerRow; readonly pilotId: string; readonly pilotIneligible: boolean }

export type HqDeps = {
  readonly session: Session
  readonly catalog: () => Promise<readonly MissionDescriptor[]>
  readonly options: readonly PickerOption[]
  readonly missionLabel: (id: string) => string
  readonly badgeName: (id: string) => string
  readonly aircraftName: (id: string) => string
  /** Fetch a scenario file for the briefing; `null` shows no briefing. */
  readonly loadScenario: ((id: string) => Promise<Scenario>) | null
  readonly dev: { get(): boolean; set(on: boolean): void }
  readonly god: { get(): boolean; set(on: boolean): void }
  readonly download: (filename: string, text: string) => void
  readonly pickFile: () => Promise<string | null>
  readonly today: () => string
  /** Task 8 wires this to Flight Conditions; until then the picker says so. */
  readonly onAssign?: (r: AssignRequest) => void
  readonly onHide?: () => void
}

export type HqHandle = { show(): void; hide(): void; up(): boolean }

type View =
  | { kind: 'files' } | { kind: 'new' } | { kind: 'hq' } | { kind: 'chapter' } | { kind: 'archive'; filter: ArchiveFilter }
  | { kind: 'exchange'; message?: string; issues?: readonly string[] }
  | { kind: 'conflict'; text: string; campaign: Campaign; existing: { revision: number; points: number } }
  | { kind: 'choose'; focus: 'all' | 'noncampaign' | 'training'; selected?: string }
  | { kind: 'pilot'; rowId: string }

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (text !== undefined) e.textContent = text
  if (className !== undefined) e.className = className
  return e
}
const cell = (text: string, className?: string): HTMLTableCellElement => el('td', text, className)
const table = (head: readonly string[], rows: readonly HTMLTableRowElement[]): HTMLTableElement => {
  const t = el('table', undefined, 'form-table')
  const hr = el('tr')
  for (const h of head) hr.appendChild(el('th', h))
  const thead = el('thead')
  thead.appendChild(hr)
  const tbody = el('tbody')
  tbody.append(...rows)
  t.append(thead, tbody)
  return t
}
const chip = (text: string, kind: 'ok' | 'no' | 'red' | 'blk'): HTMLSpanElement => {
  const c = el('span', text, 'stamp-chip')
  const color = kind === 'ok' ? '--stamp-blue' : kind === 'red' ? '--stamp-red' : '--stamp-black'
  c.style.cssText = `color:var(${color});border-color:var(${color});margin-right:4px;display:inline-block;margin-bottom:2px${kind === 'no' ? ';border-style:dashed;opacity:.55' : ''}`
  return c
}
const para = (text: string, faint = false): HTMLParagraphElement => {
  const p = el('p', text)
  p.style.cssText = `margin:0 0 10px;font-size:13px;line-height:1.55${faint ? ';color:var(--ink-faint)' : ''}`
  return p
}
const routing = (items: readonly (readonly [string, string])[]): HTMLElement => {
  const dl = el('dl', undefined, 'routing')
  for (const [k, v] of items) {
    const row = el('div')
    row.append(el('dt', k), el('dd', v))
    dl.appendChild(row)
  }
  return dl
}
const kv = (rows: readonly (readonly [string, string])[]): HTMLElement => {
  const dl = el('dl')
  dl.style.cssText = 'margin:0;display:grid;grid-template-columns:auto 1fr;gap:5px 14px;font-size:13px'
  for (const [k, v] of rows) {
    const dt = el('dt', k)
    dt.style.cssText = 'color:var(--ink-faint);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;align-self:center'
    const dd = el('dd', v)
    dd.style.cssText = 'margin:0;text-align:right;font-variant-numeric:tabular-nums'
    dl.append(dt, dd)
  }
  return dl
}
const bar = (fraction: number): HTMLElement => {
  const b = el('div')
  b.setAttribute('role', 'progressbar')
  b.setAttribute('aria-valuenow', String(Math.round(fraction * 100)))
  b.style.cssText = 'height:6px;background:rgba(0,0,0,.12);margin:4px 0 2px'
  const f = el('div')
  f.style.cssText = `height:100%;width:${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%;background:var(--ink-faint)`
  b.appendChild(f)
  return b
}
const cols = (left: HTMLElement, right: HTMLElement, ratio = '1.85fr 1fr'): HTMLElement => {
  const g = el('div')
  g.style.cssText = `display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:0 26px`
  g.style.gridTemplateColumns = `minmax(0,${ratio.split(' ')[0]}) minmax(0,${ratio.split(' ')[1]})`
  left.style.minWidth = '0'
  right.style.minWidth = '0'
  g.append(left, right)
  return g
}
const stat = (k: string, v: string, s: string): HTMLElement => {
  const d = el('div')
  d.style.cssText = 'border:1px solid var(--rule-heavy);padding:8px 10px;margin-bottom:10px'
  const kk = el('div', k)
  kk.style.cssText = 'font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-faint)'
  const vv = el('div', v)
  vv.style.cssText = 'font-family:var(--font-display);font-size:22px;letter-spacing:.04em;line-height:1.15'
  const ss = el('div', s)
  ss.style.cssText = 'font-size:11px;color:var(--ink-faint)'
  d.append(kk, vv, ss)
  return d
}

export function createHq(root: HTMLElement, deps: HqDeps): HqHandle {
  const { session } = deps
  let overlay: HTMLDivElement | null = null
  let stage: HTMLDivElement | null = null
  let view: View = { kind: 'files' }
  let onKey: ((e: KeyboardEvent) => void) | null = null
  let dossierClose: (() => void) | null = null
  let renderToken = 0

  const go = (v: View): void => { view = v; void render() }
  const current = (): Campaign => {
    const c = session.current()
    if (c === null) throw new Error('hq: no campaign is open')
    return c
  }

  // ------------------------------------------------------------ shared pieces

  const sheet = (kicker: string, title: string, number: string, stamp?: { text: string; color: string }): { panel: HTMLDivElement; sheet: HTMLDivElement } => {
    const m = memoPanel()
    m.panel.style.marginTop = '0'
    if (stamp !== undefined) {
      const s = el('div', stamp.text, `stamp ${stamp.color} stamp--sm stamp--rotate-2 stamp-corner`)
      m.sheet.appendChild(s)
    }
    m.sheet.appendChild(letterhead(kicker, title, number))
    return m
  }

  const saveBanner = (): HTMLElement | null => {
    const s = session.lastSave()
    if (s === null || s.ok) return null
    const b = el('div')
    b.setAttribute('role', 'alert')
    b.style.cssText = 'border:2px solid var(--stamp-red);color:var(--stamp-red);padding:8px 12px;margin:0 0 12px;font-size:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap'
    const t = el('span', `Progress NOT saved: ${s.error}`)
    t.style.flex = '1'
    const x = inkButton('Export now')
    x.addEventListener('click', () => {
      const c = session.current()
      const text = c === null ? null : session.exportText()
      if (c !== null && text !== null) deps.download(`ww2airsim-${c.faction}-${c.id}-r${c.revision}-${deps.today()}.json`, text)
    })
    b.append(t, x)
    return b
  }

  const devRow = (): HTMLElement => {
    const wrap = el('div')
    wrap.style.cssText = 'display:flex;gap:18px;flex-wrap:wrap;margin-top:14px;font:12px var(--font-body);letter-spacing:.04em'
    const mk = (text: string, get: () => boolean, set: (b: boolean) => void, disabled = false): HTMLLabelElement => {
      const l = el('label')
      l.style.cssText = 'display:inline-flex;align-items:center;gap:6px'
      const box = el('input')
      box.type = 'checkbox'
      box.checked = get()
      box.disabled = disabled
      box.addEventListener('change', () => { set(box.checked); void render() })
      l.append(box, text)
      return l
    }
    wrap.appendChild(mk('Dev: unlocks dev scenarios, God mode, test beds, flight-record export', deps.dev.get, deps.dev.set))
    if (deps.dev.get()) wrap.appendChild(mk('God mode: cannot be hurt, never runs out', deps.god.get, deps.god.set))
    return wrap
  }

  const back = (text: string, to: View): HTMLButtonElement => {
    const b = inkButton(text)
    b.addEventListener('click', () => go(to))
    return b
  }

  const openDossierPanel = (build: (sheet: HTMLDivElement) => void, label: string): void => {
    if (dossierClose !== null || overlay === null) return
    const host = overlay
    const inerted = [...host.children].filter((c) => !c.hasAttribute('inert'))
    for (const c of inerted) c.setAttribute('inert', '')
    const panel = el('div', undefined, 'naval-comms')
    panel.dataset.ww2Dossier = ''
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-modal', 'true')
    panel.setAttribute('aria-label', label)
    panel.style.cssText = 'position:absolute;inset:0;overflow-y:auto;background:rgba(11,13,16,.82);z-index:30;display:flex'
    const s = el('div', undefined, 'sheet')
    s.style.cssText = 'width:min(900px,92vw);margin:4vh auto'
    build(s)
    const close = inkButton('Close')
    const row = buttonRow(close)
    s.appendChild(row)
    panel.appendChild(s)
    host.appendChild(panel)
    let closed = false
    const done = (): void => {
      if (closed) return
      closed = true
      window.removeEventListener('keydown', key, true)
      panel.remove()
      for (const c of inerted) c.removeAttribute('inert')
      dossierClose = null
    }
    const key = (e: KeyboardEvent): void => {
      if (e.code !== 'Escape' && e.code !== 'Enter' && e.code !== 'NumpadEnter') return
      e.stopPropagation()
      if (e.code === 'Escape') { e.preventDefault(); done() }
    }
    close.addEventListener('keydown', (e) => { if (e.key === 'Tab') { e.preventDefault(); close.focus() } })
    window.addEventListener('keydown', key, true)
    close.addEventListener('click', done)
    dossierClose = done
    close.focus()
  }

  const logTable = (rows: readonly { date: string; mission: string; aircraft: string; outcome: string; points: number; kills: number; time: string; flags: string }[], empty: string): HTMLElement => {
    if (rows.length === 0) return para(empty, true)
    const scroll = el('div')
    scroll.style.cssText = 'max-height:40vh;overflow-y:auto'
    scroll.appendChild(table(['Date', 'Mission', 'Aircraft', 'Outcome', 'Points', 'Kills', 'Time', 'Notes'], rows.map((r) => {
      const tr = el('tr')
      tr.append(cell(r.date), cell(r.mission), cell(r.aircraft), cell(r.outcome), cell(formatPoints(r.points), 'num'), cell(String(r.kills), 'num'), cell(r.time), cell(r.flags))
      return tr
    })))
    return scroll
  }

  const ribbonRack = (ids: readonly string[], names: readonly string[], empty: string): HTMLElement => {
    if (ids.length === 0) return para(empty, true)
    const rack = el('div')
    rack.style.cssText = 'display:flex;flex-wrap:wrap;gap:12px 18px'
    ids.forEach((id, i) => {
      const c = el('div')
      c.dataset.ww2Ribbon = id
      c.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px'
      c.append(ribbonElement(id, names[i]!, 22), el('span', names[i]))
      rack.appendChild(c)
    })
    return rack
  }

  const pilotDossier = (c: Campaign, pilotId: string): void => {
    const p = c.pilots[pilotId]
    if (p === undefined) return
    const m = pilotDossierModel(c, p, deps.missionLabel, deps.badgeName, deps.aircraftName)
    openDossierPanel((s) => {
      s.appendChild(el('div', p.status === 'active' ? 'Pilot Dossier' : 'Closed Pilot File', 'letterhead-kicker'))
      s.appendChild(el('div', m.header.name, 'letterhead-title'))
      if (m.header.kanji !== null) s.appendChild(para(m.header.kanji, true))
      const line = el('p', `${m.header.rankLine} · ${m.header.status} · ${formatPoints(m.header.points)} points`)
      line.prepend(rankDevice(c.faction, m.header.tier, 28, m.header.rankLine))
      line.firstElementChild?.setAttribute('style', 'margin-right:10px;vertical-align:middle')
      s.append(line, bar(m.header.fraction), para(m.header.nextRank))
      if (m.closure !== null) s.appendChild(para(m.closure))
      s.append(sectionTitle('Service Record'), table(['', ''], m.record.map(([k, v]) => { const tr = el('tr'); tr.append(cell(k), cell(v)); return tr })))
      s.append(sectionTitle('Kills by Type'), table(['Type', 'Kills'], m.kills.map(([k, v]) => { const tr = el('tr'); tr.append(cell(k), cell(String(v), 'num')); return tr })))
      s.append(sectionTitle('Badges'), ribbonRack(p.badges, m.badges, m.badgesEmpty))
      s.append(sectionTitle('Mission Log'), logTable(m.log, m.logEmpty))
    }, `Dossier: ${m.header.name}`)
  }

  const commanderDossier = async (c: Campaign): Promise<void> => {
    const catalog = await deps.catalog()
    const m = commanderDossierModel(c, catalog, deps.missionLabel, deps.badgeName, deps.aircraftName)
    openDossierPanel((s) => {
      s.appendChild(el('div', "Commander's Dossier", 'letterhead-kicker'))
      s.appendChild(el('div', m.header.name, 'letterhead-title'))
      s.append(para(`${m.header.title} · ${m.header.service} · ${formatPoints(m.header.points)} points`), bar(m.header.fraction), para(m.header.nextTitle))
      s.append(sectionTitle('Record'), kv(m.record))
      s.append(sectionTitle('Destroyed, by type'), table(['Type', 'Destroyed'], m.kills.map(([k, v]) => { const tr = el('tr'); tr.append(cell(k), cell(String(v), 'num')); return tr })))
      s.append(sectionTitle('Campaign badges'), ribbonRack(c.human.ledger.badges, m.badges, m.badgesEmpty))
      s.append(sectionTitle('Log'), logTable(m.log, m.logEmpty))
    }, `Commander's Dossier: ${m.header.name}`)
  }

  // ------------------------------------------------------------ Personnel Files and new campaign

  const renderFiles = (): HTMLElement => {
    const m = sheet('Bureau of Naval Personnel', 'Personnel Files', 'Form HQ-0', { text: 'Confidential', color: 'stamp--violet' })
    const banner = saveBanner()
    if (banner !== null) m.sheet.appendChild(banner)
    m.sheet.appendChild(para('Each file is one campaign. Nothing crosses between campaigns.'))
    const listed = session.list()
    if (!listed.ok) {
      const bad = para(`The campaign list could not be read: ${listed.issues.join('; ')}. Nothing was changed.`)
      bad.style.color = 'var(--stamp-red)'
      m.sheet.appendChild(bad)
    } else if (listed.entries.length === 0) {
      m.sheet.appendChild(para('No campaigns yet. Start one below.', true))
    } else {
      const status = el('p')
      status.setAttribute('aria-live', 'polite')
      status.style.cssText = 'margin:8px 0 0;font-size:12px;color:var(--stamp-red)'
      const rows = listed.entries.map((e) => {
        const tr = el('tr')
        const actions = el('div')
        actions.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap'
        const open = inkButton('Open', true)
        open.setAttribute('aria-label', `Open ${e.playerName}, ${SERVICE_NAME[e.faction]}`)
        open.addEventListener('click', () => {
          const r = session.open(e.id)
          if (r.ok) { go({ kind: 'hq' }); return }
          status.replaceChildren(el('span', `This file did not pass its checks and was left untouched: ${r.issues.join('; ')} `))
          const raw = session.raw(e.id)
          if (raw !== null) {
            const x = inkButton('Export raw')
            x.addEventListener('click', () => deps.download(`ww2airsim-damaged-${e.id}-${deps.today()}.json`, raw))
            status.appendChild(x)
          }
        })
        const exp = inkButton('Export')
        exp.addEventListener('click', () => {
          const text = session.exportText(e.id)
          if (text === null) status.textContent = 'This file could not be exported.'
          else deps.download(`ww2airsim-${e.faction === 'us' ? 'american' : 'japanese'}-${e.id}-r${e.revision}-${deps.today()}.json`, text)
        })
        const del = inkButton('Delete')
        del.setAttribute('aria-label', `Delete ${e.playerName}, ${SERVICE_NAME[e.faction]}`)
        del.addEventListener('click', () => {
          const form = el('div')
          form.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:6px'
          const hint = el('span', 'Type DELETE to remove this campaign for good (export it first to keep a copy):')
          hint.style.fontSize = '11px'
          const input = el('input')
          input.type = 'text'
          input.className = 'typed-input'
          input.style.maxWidth = '110px'
          input.setAttribute('aria-label', 'Type DELETE to confirm')
          const go2 = inkButton('Delete for good')
          go2.addEventListener('click', () => {
            if (input.value.trim() !== 'DELETE') { status.textContent = 'Type DELETE exactly to confirm.'; return }
            const r = session.remove(e.id)
            if (r.ok) void render(); else status.textContent = `Could not delete: ${r.error}`
          })
          form.append(hint, input, go2)
          actions.after(form)
          del.disabled = true
        })
        actions.append(open, exp, del)
        const act = el('td')
        act.appendChild(actions)
        tr.append(cell(e.playerName), cell(SERVICE_NAME[e.faction]), cell(COMMAND_TITLES[commandTitleOf(e.points)]), cell(formatPoints(e.points), 'num'), cell(`r${e.revision}`), act)
        return tr
      })
      m.sheet.append(table(['Player', 'Service', 'Command rating', 'Points', 'Saves', ''], rows), status)
    }
    const newB = inkButton('New campaign', true)
    newB.addEventListener('click', () => go({ kind: 'new' }))
    const impB = inkButton('Import campaign')
    impB.addEventListener('click', () => void importFlow())
    m.sheet.appendChild(buttonRow(newB, impB))
    if (deps.dev.get()) {
      const dev = buttonRow()
      for (const f of ['us', 'ja'] as const) {
        const b = inkButton(`Create dev campaign (${f === 'us' ? 'U.S.' : 'Japanese'})`)
        b.addEventListener('click', () => {
          const r = session.createDev(f)
          if (r.ok) go({ kind: 'hq' })
          else { const e2 = el('p', r.error); e2.style.color = 'var(--stamp-red)'; m.sheet.appendChild(e2) }
        })
        dev.appendChild(b)
      }
      m.sheet.appendChild(dev)
    }
    m.sheet.appendChild(devRow())
    const fine = el('div', undefined, 'fine-print')
    fine.append(el('span', 'Importing a file whose campaign already exists asks: Replace or Cancel.'), el('span', 'FORM HQ-0'))
    m.sheet.appendChild(fine)
    return m.panel
  }

  const renderNew = (): HTMLElement => {
    const m = sheet('Bureau of Naval Personnel', 'New Campaign', 'Form HQ-0A')
    let faction: Faction | null = null
    const name = el('input')
    name.type = 'text'
    name.className = 'typed-input'
    name.placeholder = 'Player name'
    name.maxLength = PLAYER_NAME_MAX
    name.value = session.lastPlayerName() ?? ''
    name.setAttribute('aria-label', 'Player name')
    const fieldRow = el('div', undefined, 'field-row')
    fieldRow.append(el('span', 'Name', 'field-label'), name)
    const group = radioGroup('Service')
    const rows = new Map<Faction, HTMLDivElement>()
    const mark = (): void => { for (const [f, r] of rows) r.setAttribute('aria-checked', String(f === faction)) }
    for (const f of ['us', 'ja'] as const) {
      const r = ballotOption(SERVICE_NAME[f], f === 'us' ? 'American campaign' : 'Japanese campaign', () => { faction = f; mark() })
      rows.set(f, r)
      group.appendChild(r)
    }
    const err = el('p')
    err.setAttribute('aria-live', 'polite')
    err.style.cssText = 'margin:8px 0 0;font-size:12px;color:var(--stamp-red);min-height:1.2em'
    m.sheet.append(sectionTitle('Player'), fieldRow, sectionTitle('Service'), group,
      para('This choice is permanent for this campaign. You can start a separate campaign for the other side.', true), err)
    const cancel = back('Back', { kind: 'files' })
    const next = inkButton('Next', true)
    next.addEventListener('click', () => {
      if (!isValidPlayerName(name.value)) { err.textContent = `Enter a player name (1 to ${PLAYER_NAME_MAX} characters).`; name.focus(); return }
      if (faction === null) { err.textContent = 'Choose the American or the Japanese service. There is no default.'; return }
      const f = faction
      m.sheet.replaceChildren(letterhead('Bureau of Naval Personnel', 'Confirm Enlistment', 'Form HQ-0A'),
        para(`Enlist as ${name.value.trim()}, ${SERVICE_NAME[f]}? This cannot be changed.`))
      const e2 = el('p')
      e2.setAttribute('aria-live', 'polite')
      e2.style.cssText = 'margin:8px 0 0;font-size:12px;color:var(--stamp-red)'
      const enlist = inkButton('Enlist', true)
      enlist.addEventListener('click', () => {
        const r = session.create({ faction: f, playerName: name.value })
        if (r.ok) go({ kind: 'hq' }); else e2.textContent = r.error
      })
      m.sheet.append(e2, buttonRow(back('Back', { kind: 'new' }), enlist))
      enlist.focus()
    })
    m.sheet.appendChild(buttonRow(cancel, next))
    queueMicrotask(() => name.focus())
    return m.panel
  }

  // ------------------------------------------------------------ Headquarters (variant A)

  const renderHq = async (): Promise<HTMLElement> => {
    const c = current()
    const catalog = await deps.catalog()
    const h = hqModel(c, catalog)
    // The Japanese heading is a placeholder (Mark's mockup C labeled it so); the real office name is a content call.
    const m = sheet(c.faction === 'ja' ? 'Naval Aviation Bureau (placeholder heading)' : 'Bureau of Aeronautics', 'Air Group Headquarters', 'Form HQ-1', { text: c.faction === 'ja' ? 'Secret' : 'Confidential', color: 'stamp--violet' })
    const banner = saveBanner()
    if (banner !== null) m.sheet.appendChild(banner)
    m.sheet.appendChild(routing([['Service', h.service], ['Commander', h.commander], ['Current chapter', h.chapterText], ['Campaign file', h.revisionText]]))

    const left = el('div')
    left.appendChild(sectionTitle('Squadron: five living pilots'))
    left.firstElementChild!.setAttribute('style', 'margin-top:0')
    const rows = h.pilots.map((p) => {
      const tr = el('tr')
      const nameCell = el('td')
      nameCell.style.whiteSpace = 'nowrap'
      const dev = rankDevice(c.faction, p.tier, 18, p.rankName)
      dev.style.marginRight = '8px'
      const nm = el('span', p.name)
      nameCell.append(dev, nm)
      if (p.kanji !== null) { const k = el('div', p.kanji); k.style.cssText = 'font-size:11px;color:var(--ink-faint);margin-left:30px'; nameCell.appendChild(k) }
      const dossier = inkButton('Dossier')
      dossier.setAttribute('aria-label', `Dossier: ${p.name}`)
      dossier.style.cssText += ';padding:4px 8px;font-size:10.5px;margin:3px 0 0 30px;display:block'
      dossier.addEventListener('click', () => pilotDossier(c, p.id))
      nameCell.appendChild(dossier)
      const rankCell = el('td')
      rankCell.append(el('div', p.rankShort), (() => { const d = el('div', p.rankName === p.rankShort ? '' : p.rankName); d.style.cssText = 'font-size:11px;color:var(--ink-faint)'; return d })())
      const pts = el('td', undefined, 'num')
      pts.append(el('div', p.pointsText), (() => { const d = el('div', p.toNextText); d.style.cssText = 'font-size:11px;color:var(--ink-faint)'; return d })())
      const cl = el('td')
      for (const a of p.cleared) cl.appendChild(chip(a.label, a.on ? 'ok' : 'no'))
      const st = el('td', undefined, 'center')
      st.appendChild(chip(p.status, 'blk'))
      tr.append(nameCell, rankCell, pts, cell(String(p.sorties), 'num'), cl, st)
      return tr
    })
    left.appendChild(table(['Pilot', 'Rank', 'Points', 'Sorties', 'Cleared for', 'Status'], rows))
    left.appendChild(para('A pilot who is killed, captured or dishonorably discharged leaves for the archive; an entry-rank pilot takes the slot.', true))

    const right = el('div')
    const rt = sectionTitle("Commander's Dossier")
    rt.style.marginTop = '0'
    const d = h.dossier
    right.append(rt, (() => { const p = el('p'); p.style.cssText = 'margin:0 0 6px;font-size:13px'; const b = el('b', d.playerName); p.append(b, ` · ${d.service} campaign`); return p })(),
      (() => { const s = stat('Command rating', d.title, d.nextTitleText); s.insertBefore(bar(d.fraction), s.lastElementChild); return s })(),
      kv([['Cumulative score', d.pointsText], ['Adjusted score', `${d.adjustedText} per sortie`], ['Sorties launched', String(d.sorties)], ['Campaign badges', d.badgesText],
        ['Pilots lost', d.lossesText], ['Abandoned', String(d.abandoned)], ['Chapters', d.chaptersText]]))
    const full = inkButton('Full Dossier')
    full.addEventListener('click', () => void commanderDossier(c))
    right.appendChild(buttonRow(full))
    m.sheet.appendChild(cols(left, right))

    m.sheet.appendChild(sectionTitle('Operations'))
    const grid = el('div')
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:8px'
    const route: Record<string, () => void> = {
      choose: () => go({ kind: 'choose', focus: 'all' }), chapter: () => go({ kind: 'chapter' }), noncampaign: () => go({ kind: 'choose', focus: 'noncampaign' }),
      archive: () => go({ kind: 'archive', filter: 'all' }), exchange: () => go({ kind: 'exchange' }), training: () => go({ kind: 'choose', focus: 'training' }),
      switch: () => { session.close(); go({ kind: 'files' }) },
    }
    for (const dep of h.departments) {
      const b = inkButton('', dep.primary)
      b.textContent = ''
      b.style.cssText += ';text-align:left;padding:10px 14px;display:flex;flex-direction:column;gap:3px;text-transform:none;letter-spacing:.04em;width:100%'
      if (dep.primary) b.style.gridColumn = '1/-1'
      const t = el('b', dep.label)
      t.style.cssText = 'font-family:var(--font-display);text-transform:uppercase;letter-spacing:.1em;font-size:13px;font-weight:normal'
      const s = el('span', dep.sub)
      s.style.cssText = 'font-family:var(--font-body);font-size:11px;color:var(--ink-faint)'
      b.append(t, s)
      b.addEventListener('click', route[dep.id]!)
      grid.appendChild(b)
    }
    m.sheet.appendChild(grid)
    m.sheet.appendChild(devRow())
    const fine = el('div', undefined, 'fine-print')
    fine.append(el('span', 'Autosaved. Progress is kept in this browser only.'), el('span', 'FORM HQ-1'))
    m.sheet.appendChild(fine)
    return m.panel
  }

  // ------------------------------------------------------------ secondary views

  const renderChapter = (): HTMLElement => {
    const c = current()
    const m = sheet('Flight Operations', 'Chapter & Briefing', 'Form HQ-2')
    m.sheet.appendChild(para(`${SERVICE_NAME[c.faction]} campaign: six chapters, flown in order. A completed chapter is not flown again; a failed one may be retried with any eligible pilot.`))
    const rows = chaptersModel(c).map((r) => {
      const tr = el('tr')
      tr.className = r.state === 'current' ? 'row-selected' : ''
      const state = el('td')
      state.appendChild(chip(r.state === 'complete' ? 'COMPLETE' : r.state === 'current' ? 'CURRENT' : 'LOCKED', r.state === 'complete' ? 'ok' : r.state === 'current' ? 'blk' : 'no'))
      tr.append(cell(r.id), cell(r.title), cell(`${r.date} · ${r.label}`), cell(r.aircraft), cell(r.minRank), state, cell(r.attempts))
      return tr
    })
    m.sheet.append(table(['Ch.', 'Mission', 'Date / label', 'Aircraft', 'Rank', 'State', 'Attempts'], rows))
    m.sheet.append(sectionTitle('Briefing'), para('Orders for this chapter are not yet issued in this build. The cited briefing arrives with the chapter missions (plan F10).', true))
    m.sheet.appendChild(buttonRow(back('Back to headquarters', { kind: 'hq' })))
    return m.panel
  }

  const renderArchive = (filter: ArchiveFilter): HTMLElement => {
    const c = current()
    const a = archiveModel(c, filter, deps.missionLabel)
    const m = sheet('Bureau of Naval Personnel', 'Pilot Archive', 'Form HQ-4', { text: 'Closed files', color: 'stamp--red' })
    m.sheet.appendChild(para('Pilots who left the squadron stay on file for good: the points they banked are theirs, and nothing is ever carried to a replacement.'))
    const chips = el('div')
    chips.style.cssText = 'display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap'
    const defs: [ArchiveFilter, string][] = [['all', 'All'], ['kia', 'K.I.A.'], ['pow', 'P.O.W.'], ['discharged', 'Discharged']]
    for (const [f, label] of defs) {
      const b = inkButton(`${label} (${a.counts[f]})`, f === filter)
      b.style.cssText += ';padding:5px 12px;font-size:11px'
      b.addEventListener('click', () => go({ kind: 'archive', filter: f }))
      chips.appendChild(b)
    }
    m.sheet.appendChild(chips)
    if (a.empty !== null) m.sheet.appendChild(para(a.empty, true))
    else {
      m.sheet.appendChild(table(['Pilot', 'Rank held', 'Points', 'Sorties', 'Fate', 'Lost on', 'Date', ''], a.rows.map((r) => {
        const tr = el('tr')
        const n = el('td')
        n.style.whiteSpace = 'nowrap'
        const d = rankDevice(c.faction, r.tier, 18, r.rankName)
        d.style.marginRight = '8px'
        n.append(d, el('span', r.name))
        const fate = el('td', undefined, 'center')
        fate.appendChild(chip(r.fateText, r.fate === 'pow' ? 'blk' : 'red'))
        const b = inkButton('Dossier')
        b.style.cssText += ';padding:4px 8px;font-size:10.5px'
        b.setAttribute('aria-label', `Dossier: ${r.name}`)
        b.addEventListener('click', () => pilotDossier(c, r.id))
        const bc = el('td')
        bc.appendChild(b)
        tr.append(n, cell(r.rankName), cell(r.pointsText, 'num'), cell(String(r.sorties), 'num'), fate, cell(r.mission), cell(r.date), bc)
        return tr
      })))
    }
    m.sheet.appendChild(para('Closed files are never dropped; each keeps its last 50 sorties.', true))
    m.sheet.appendChild(buttonRow(back('Back to headquarters', { kind: 'hq' })))
    return m.panel
  }

  const importFlow = async (): Promise<void> => {
    const text = await deps.pickFile()
    if (text === null) return
    const r = session.importText(text)
    if (!r.ok) { go({ kind: 'exchange', issues: r.issues }); return }
    if (r.conflict === null) {
      const s = session.commitImport(r.campaign)
      if (s.ok) { go(session.current() === null ? { kind: 'files' } : { kind: 'exchange', message: `Imported ${r.campaign.human.playerName}.` }); return }
      go({ kind: 'exchange', issues: [s.error] })
      return
    }
    go({ kind: 'conflict', text, campaign: r.campaign, existing: { revision: r.conflict.existingRevision, points: session.list().ok ? ((session.list() as { entries: { id: string; points: number }[] }).entries.find((e) => e.id === r.campaign.id)?.points ?? 0) : 0 } })
  }

  const renderExchange = (v: Extract<View, { kind: 'exchange' }>): HTMLElement => {
    const c = session.current()
    const m = sheet('Bureau of Naval Personnel', 'Save · Export · Import', 'Form HQ-7')
    const banner = saveBanner()
    if (banner !== null) m.sheet.appendChild(banner)
    m.sheet.appendChild(para('Campaigns save by themselves after every sortie, in this browser only. Export a file to keep a copy or move a campaign to another browser.'))
    if (v.message !== undefined) { const p = para(v.message); p.setAttribute('role', 'status'); m.sheet.appendChild(p) }
    if (v.issues !== undefined) {
      const box = el('div')
      box.setAttribute('role', 'alert')
      box.style.cssText = 'border:2px solid var(--stamp-red);color:var(--stamp-red);padding:8px 12px;margin:0 0 12px;font-size:12px'
      box.appendChild(el('div', 'That file was not imported:'))
      const ul = el('ul')
      for (const i of v.issues) ul.appendChild(el('li', i))
      box.appendChild(ul)
      m.sheet.appendChild(box)
    }
    const exp = inkButton('Export this campaign', true)
    exp.addEventListener('click', () => {
      const t = c === null ? null : session.exportText()
      if (c !== null && t !== null) deps.download(`ww2airsim-${c.faction === 'us' ? 'american' : 'japanese'}-${c.id}-r${c.revision}-${deps.today()}.json`, t)
    })
    exp.disabled = c === null
    const imp = inkButton('Import a campaign file')
    imp.addEventListener('click', () => void importFlow())
    m.sheet.appendChild(buttonRow(exp, imp))
    m.sheet.appendChild(buttonRow(back(c === null ? 'Back' : 'Back to headquarters', c === null ? { kind: 'files' } : { kind: 'hq' })))
    return m.panel
  }

  const renderConflict = (v: Extract<View, { kind: 'conflict' }>): HTMLElement => {
    const cm = importConflictModel(v.existing, v.campaign)
    const m = sheet('Bureau of Naval Personnel', 'Campaign Already Saved', 'Form HQ-7A', { text: 'Hold', color: 'stamp--red' })
    m.sheet.append(para(cm.title), para(cm.existing), para(cm.incoming), para(cm.warning))
    m.sheet.appendChild(para('Replace overwrites the saved campaign with the file. Cancel leaves everything as it is.', true))
    const replace = inkButton('Replace', true)
    const err = el('p')
    err.style.cssText = 'margin:8px 0 0;font-size:12px;color:var(--stamp-red)'
    replace.addEventListener('click', () => {
      const s = session.commitImport(v.campaign)
      if (s.ok) go({ kind: 'exchange', message: `Replaced the saved campaign with ${v.campaign.human.playerName}'s file.` })
      else err.textContent = `Not replaced: ${s.error}`
    })
    m.sheet.append(err, buttonRow(back('Cancel', session.current() === null ? { kind: 'files' } : { kind: 'exchange' }), replace))
    return m.panel
  }

  // ------------------------------------------------------------ mission-first picker (steps 1 and 2)

  const renderChoose = async (v: Extract<View, { kind: 'choose' }>): Promise<HTMLElement> => {
    const c = current()
    const catalog = await deps.catalog()
    const rows = pickerRows(c, catalog, deps.options, deps.dev.get(), deps.aircraftName)
    const m = sheet('Flight Operations', 'Sortie Orders', 'Step 1 of 5')
    const steps = el('div')
    steps.style.cssText = 'display:flex;margin:0 0 14px;font-family:var(--font-display);font-size:11px;letter-spacing:.1em;text-transform:uppercase'
    ;['1 Mission', '2 Pilot', '3 Conditions', '4 Aircraft', '5 Ordnance'].forEach((t, i) => {
      const s = el('span', t)
      s.style.cssText = `flex:1;border:1px solid ${i === 0 ? 'var(--stamp-blue)' : 'var(--rule-heavy)'};padding:5px 8px;text-align:center;margin-left:-1px;color:${i === 0 ? 'var(--stamp-blue)' : 'var(--ink-faint)'}`
      steps.appendChild(s)
    })
    m.sheet.appendChild(steps)
    let selected: PickerRow | undefined = rows.find((r) => r.id === v.selected)
    const group = radioGroup('Mission')
    const optionEls = new Map<string, HTMLDivElement>()
    const briefHost = el('div')
    const request = deps.loadScenario === null ? null : briefingRequest(deps.loadScenario)
    const next = inkButton('Next: assign a pilot', true)
    next.disabled = true
    next.style.opacity = '.45'
    const showSelected = (): void => {
      for (const [k, e2] of optionEls) e2.setAttribute('aria-checked', String(selected !== undefined && k === `${selected.section}:${selected.id}`))
      next.disabled = selected === undefined
      next.style.opacity = selected === undefined ? '.45' : ''
      briefHost.replaceChildren()
      if (selected === undefined || request === null) return
      const id = selected.id
      renderBriefing(briefHost, 'loading')
      request(id, (s) => {
        if (selected?.id !== id) return
        renderBriefing(briefHost, briefingModel(s, c.human.ledger.badges))
      }, () => { if (selected?.id === id) renderBriefing(briefHost, 'unavailable') })
    }
    const sections: { key: PickerRow['section']; title: string; empty?: string }[] = [
      { key: 'campaign', title: 'Current chapter', empty: 'Orders for the current chapter are not yet issued in this build.' },
      { key: 'noncampaign', title: 'Non-campaign missions (repeatable, scored)' },
      { key: 'training', title: 'Training grounds (not scored)' },
      { key: 'single', title: 'Single missions (not scored, no rank gates)' },
    ]
    const sectionEls = new Map<string, HTMLElement>()
    for (const s of sections) {
      const mine = rows.filter((r) => r.section === s.key)
      const head = sectionTitle(s.title)
      sectionEls.set(s.key, head)
      group.appendChild(head)
      if (mine.length === 0 && s.empty !== undefined) { group.appendChild(para(s.empty, true)); continue }
      for (const r of mine) {
        const note = r.nobody ? `No pilot of the five can fly this yet${r.needText === null ? '' : ` (${r.needText})`}` : r.needText ?? ''
        const e2 = ballotOption(r.label, note, () => { selected = r; showSelected() })
        e2.dataset.section = r.section
        if (r.nobody) e2.style.opacity = '.55'
        e2.title = r.sub
        const sub = el('span', r.sub)
        sub.style.cssText = 'display:block;font-size:11px;color:var(--ink-faint)'
        e2.querySelector('.ballot-label')?.appendChild(sub)
        if (!r.scored) { const t = el('span', r.dev ? 'Dev' : 'Unscored', 'stamp-chip'); t.style.cssText = 'margin-left:8px;color:var(--ink-faint);border-color:var(--ink-faint)'; e2.appendChild(t) }
        else if (r.badgeId !== null) {
          const held = c.human.ledger.badges.includes(r.badgeId)
          const rib = ribbonElement(r.badgeId, deps.badgeName(r.badgeId), 14)
          rib.style.cssText += `;margin-left:10px;opacity:${held ? 1 : 0.3}`
          e2.appendChild(rib)
          if (held) e2.appendChild(awardedStamp())
        }
        optionEls.set(`${r.section}:${r.id}`, e2)
        group.appendChild(e2)
      }
    }
    next.addEventListener('click', () => { if (selected !== undefined) go({ kind: 'pilot', rowId: `${selected.section}:${selected.id}` }) })
    const right = el('div')
    right.append(briefHost)
    m.sheet.appendChild(buttonRow(back('Back', { kind: 'hq' }), next))
    m.sheet.appendChild(cols(group, right, '1.55fr 1fr'))
    queueMicrotask(() => {
      const focus = v.focus === 'training' ? sectionEls.get('training') : v.focus === 'noncampaign' ? sectionEls.get('noncampaign') : null
      focus?.scrollIntoView({ block: 'start' })
    })
    showSelected()
    return m.panel
  }

  const renderPilot = async (v: Extract<View, { kind: 'pilot' }>): Promise<HTMLElement> => {
    const c = current()
    const catalog = await deps.catalog()
    const [section, ...rest] = v.rowId.split(':')
    const id = rest.join(':')
    const row = pickerRows(c, catalog, deps.options, deps.dev.get(), deps.aircraftName).find((r) => r.section === section && r.id === id)
    if (row === undefined) { go({ kind: 'choose', focus: 'all' }); return el('div') }
    const m = sheet('Bureau of Naval Personnel', 'Squadron Roster', 'Step 2 of 5')
    const steps = el('div')
    steps.style.cssText = 'display:flex;margin:0 0 14px;font-family:var(--font-display);font-size:11px;letter-spacing:.1em;text-transform:uppercase'
    ;['1 Mission', '2 Pilot', '3 Conditions', '4 Aircraft', '5 Ordnance'].forEach((t, i) => {
      const s = el('span', t)
      s.style.cssText = `flex:1;border:1px solid ${i === 1 ? 'var(--stamp-blue)' : 'var(--rule-heavy)'};padding:5px 8px;text-align:center;margin-left:-1px;color:${i === 1 ? 'var(--stamp-blue)' : 'var(--ink-faint)'}`
      steps.appendChild(s)
    })
    m.sheet.append(steps, routing([['Mission', row.label], ['Kind', row.scored ? (row.section === 'campaign' ? 'Campaign chapter' : 'Non-campaign') : 'Not scored'], ['Needs', row.needText ?? 'Any pilot'], ['Pilots able', `${row.pilotsAble} of 5`]]))
    m.sheet.appendChild(sectionTitle('Assign one of the five living pilots'))
    const note = el('p')
    note.setAttribute('aria-live', 'polite')
    note.style.cssText = 'margin:8px 0 0;font-size:12px;color:var(--ink-faint)'
    const dev = deps.dev.get()
    const trs = pilotChoices(c, catalog, row.id).map((p) => {
      const tr = el('tr')
      const able = p.eligible || !row.scored
      if (!p.eligible && row.scored) tr.style.opacity = '.55'
      const n = el('td')
      n.style.whiteSpace = 'nowrap'
      const d = rankDevice(c.faction, p.tier, 18, p.rankShort)
      d.style.marginRight = '8px'
      n.append(d, el('span', p.name))
      const status = el('td')
      status.appendChild(p.eligible ? chip('ELIGIBLE', 'ok') : chip(row.scored ? (p.needText ?? 'INELIGIBLE') : 'NOT ENFORCED', 'no'))
      const assign = inkButton('Assign', true)
      assign.setAttribute('aria-label', `Assign ${p.name}`)
      const canAssign = able || dev
      assign.disabled = !canAssign
      if (!canAssign) assign.style.opacity = '.45'
      assign.addEventListener('click', () => {
        if (deps.onAssign === undefined) { note.textContent = `${p.name} assigned to ${row.label}. Flight Conditions, Aircraft and Ordnance are the next memos.`; return }
        deps.onAssign({ row, pilotId: p.id, pilotIneligible: !p.eligible })
      })
      const ac = el('td')
      ac.appendChild(assign)
      tr.append(n, cell(p.rankShort), cell(p.pointsText, 'num'), cell(String(p.sorties), 'num'), status, ac)
      return tr
    })
    m.sheet.append(table(['Pilot', 'Rank', 'Points', 'Sorties', 'For this mission', ''], trs), note)
    if (dev) m.sheet.appendChild(para('Dev is on: a pilot below the required rank may be assigned, and the sortie is then not recorded.', true))
    m.sheet.appendChild(buttonRow(back('Back', { kind: 'choose', focus: 'all', selected: row.id })))
    return m.panel
  }

  // ------------------------------------------------------------ render loop

  async function render(): Promise<void> {
    if (stage === null) return
    const token = ++renderToken
    dossierClose?.()
    let panel: HTMLElement
    try {
      switch (view.kind) {
        case 'files': panel = renderFiles(); break
        case 'new': panel = renderNew(); break
        case 'hq': panel = await renderHq(); break
        case 'chapter': panel = renderChapter(); break
        case 'archive': panel = renderArchive(view.filter); break
        case 'exchange': panel = renderExchange(view); break
        case 'conflict': panel = renderConflict(view); break
        case 'choose': panel = await renderChoose(view); break
        case 'pilot': panel = await renderPilot(view); break
      }
    } catch (e) {
      panel = el('div')
      panel.textContent = `Headquarters could not be drawn: ${e instanceof Error ? e.message : String(e)}`
      panel.style.color = '#fff'
    }
    if (token !== renderToken || stage === null) return
    stage.replaceChildren(panel)
    stage.scrollTop = 0
  }

  const hide = (): void => {
    if (overlay === null) return
    dossierClose?.()
    overlay.remove()
    overlay = null
    stage = null
    if (onKey !== null) window.removeEventListener('keydown', onKey)
    onKey = null
    deps.onHide?.()
  }

  return {
    up: () => overlay !== null,
    hide,
    show() {
      hide()
      ensureStampFilter()
      overlay = el('div')
      overlay.dataset.ww2Hq = ''
      overlay.setAttribute('role', 'dialog')
      overlay.setAttribute('aria-modal', 'true')
      overlay.setAttribute('aria-label', 'Headquarters')
      overlay.style.cssText = `position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;overflow:hidden;background:#0b0d10 url(${TITLE_ART_URL}) center/cover no-repeat;z-index:20`
      stage = el('div')
      stage.style.cssText = 'flex:1 1 auto;min-height:0;width:100%;overflow-y:auto;display:flex;flex-direction:column;align-items:center;padding:16px 0 4vh'
      overlay.appendChild(stage)
      root.appendChild(overlay)
      view = session.current() === null ? { kind: 'files' } : { kind: 'hq' }
      onKey = (e: KeyboardEvent): void => {
        if (e.code !== 'Escape' || dossierClose !== null) return
        if (view.kind === 'hq' || view.kind === 'files') return
        e.preventDefault()
        go(view.kind === 'new' ? { kind: 'files' } : view.kind === 'pilot' ? { kind: 'choose', focus: 'all' } : session.current() === null ? { kind: 'files' } : { kind: 'hq' })
      }
      window.addEventListener('keydown', onKey)
      void render()
    },
  }
}
