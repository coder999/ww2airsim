// src/render/hangar/panel.ts
import { ensureStampFilter } from '../ui/navalComms.js'
import { filterCatalog, FILTER_KINDS, FILTER_ORIGINS, FILTER_SIDES, listLabel, statusNote, type CatalogEntry, type CatalogFilter } from './catalog.js'
import { historyParagraphs } from './library.js'
import type { Figure } from './stats.js'
import { provenanceText, type ModelProvenance } from './provenance.js'

export interface HangarPanel {
  /** Shows the info card for `entry` with its computed figures. `source` is where its model came
   *  from: a manifest entry, `'code'` for one drawn in code with no model file, or null for none. */
  showCard(entry: CatalogEntry, figures: readonly Figure[], modelSize: { x: number; y: number; z: number } | null, source: ModelProvenance | 'code' | null): void
  /** The element the bench (bench.ts) mounts into, under the card. */
  readonly benchSlot: HTMLElement
  /** The detail panel holding the card and the bench: right-hand on desktop, a bottom sheet on
   *  mobile; hidden until the first pick, then collapsible to a thin strip. */
  readonly detail: HTMLElement
}

const KIND_LABEL: Readonly<Record<string, string>> = { all: 'All', aircraft: 'Aircraft', ship: 'Ships', building: 'Buildings', vehicle: 'Vehicles', ordnance: 'Ordnance' }
const SIDE_LABEL: Readonly<Record<string, string>> = { all: 'Both sides', allied: 'Allied', japanese: 'Japanese' }
const ORIGIN_LABEL: Readonly<Record<string, string>> = { all: 'All origins', internal: 'Internal', external: 'External' }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

/**
 * The list and its three filters on the left, and the info card with the bench in a matching panel
 * on the right that appears once something is picked (Hangar spec §2; split left/right by Mark,
 * 2026-10-08), in the Naval Communications style the title screen uses. `onSelect` is called with
 * a library id; main.ts loads the model and calls `showCard`.
 */
export function createPanel(root: HTMLElement, catalog: readonly CatalogEntry[], onSelect: (id: string) => void, showAssetId = false): HangarPanel {
  ensureStampFilter()
  const panel = el('div', 'naval-comms hangar-panel')
  panel.setAttribute('role', 'region')
  panel.setAttribute('aria-label', 'Hangar')
  const sheet = el('div', 'sheet')
  panel.appendChild(sheet)

  const header = el('div', 'letterhead')
  header.append(el('div', 'letterhead-kicker', 'Bureau of Aeronautics'), el('div', 'letterhead-title', 'Hangar'))
  const back = el('a', 'ink-button', 'Back to title')
  back.href = import.meta.env.BASE_URL
  sheet.append(header, back)

  let filter: CatalogFilter = { kind: 'all', side: 'all', origin: 'all' }
  const filters = el('div', 'hangar-filters')
  const select = (options: readonly string[], labels: Readonly<Record<string, string>>, name: string, onChange: (v: string) => void) => {
    const s = el('select')
    s.setAttribute('aria-label', name)
    for (const o of options) {
      const opt = el('option', undefined, labels[o] ?? o)
      opt.value = o
      s.appendChild(opt)
    }
    s.addEventListener('change', () => onChange(s.value))
    return s
  }
  filters.append(
    select(FILTER_KINDS, KIND_LABEL, 'Kind', (v) => { filter = { ...filter, kind: v as CatalogFilter['kind'] }; renderList() }),
    select(FILTER_SIDES, SIDE_LABEL, 'Side', (v) => { filter = { ...filter, side: v as CatalogFilter['side'] }; renderList() }),
    select(FILTER_ORIGINS, ORIGIN_LABEL, 'Origin', (v) => { filter = { ...filter, origin: v as CatalogFilter['origin'] }; renderList() }),
  )
  const list = el('ul')
  list.setAttribute('aria-label', 'Objects')
  const mobilePicker = el('label', 'hangar-mobile-picker')
  mobilePicker.appendChild(el('span', undefined, 'Asset'))
  const mobileSelect = el('select')
  mobileSelect.setAttribute('aria-label', 'Asset')
  mobilePicker.appendChild(mobileSelect)
  sheet.append(filters, mobilePicker, list)
  root.appendChild(panel)

  const detail = el('div', 'naval-comms hangar-detail')
  detail.setAttribute('role', 'region')
  detail.setAttribute('aria-label', 'Details')
  detail.style.display = 'none'
  const detailSheet = el('div', 'sheet')
  const toggle = el('button', 'ink-button')
  toggle.type = 'button'
  toggle.classList.add('hangar-detail-toggle')
  const card = el('div', 'hangar-card')
  const benchSlot = el('div', 'hangar-bench')
  detailSheet.append(card, benchSlot)
  detail.append(toggle, detailSheet)
  let collapsed = false
  const mobileLayout = window.matchMedia('(max-width: 820px)')
  const layout = (): void => {
    // Collapsed, the panel is a strip holding only its toggle. The model gets the freed width on
    // desktop and height on mobile; CSS owns both layouts so the breakpoint can change live.
    detail.classList.toggle('is-collapsed', collapsed)
    detailSheet.style.display = collapsed ? 'none' : ''
    toggle.textContent = mobileLayout.matches ? (collapsed ? '⌃' : '⌄') : (collapsed ? '‹' : '›')
    toggle.setAttribute('aria-label', collapsed ? 'Expand details' : 'Collapse details')
    toggle.setAttribute('aria-expanded', String(!collapsed))
  }
  toggle.addEventListener('click', () => { collapsed = !collapsed; layout() })
  mobileLayout.addEventListener('change', layout)
  layout()

  let selectedId = ''
  const choose = (id: string): void => {
    selectedId = id
    mobileSelect.value = id
    for (const button of list.querySelectorAll<HTMLButtonElement>('button[data-id]')) {
      if (button.dataset['id'] === id) button.setAttribute('aria-current', 'true')
      else button.removeAttribute('aria-current')
    }
    onSelect(id)
  }
  mobileSelect.addEventListener('change', () => { if (mobileSelect.value) choose(mobileSelect.value) })

  function renderList(): void {
    const entries = filterCatalog(catalog, filter)
    const prompt = el('option', undefined, `Choose an asset (${entries.length})`)
    prompt.value = ''
    prompt.disabled = true
    mobileSelect.replaceChildren(prompt, ...entries.map((e) => {
      const option = el('option', undefined, listLabel(e))
      option.value = e.library.id
      return option
    }))
    mobileSelect.value = entries.some((e) => e.library.id === selectedId) ? selectedId : ''
    list.replaceChildren(...entries.map((e) => {
      const li = el('li')
      const b = el('button', 'ink-button', listLabel(e))
      b.dataset['id'] = e.library.id
      if (e.library.id === selectedId) b.setAttribute('aria-current', 'true')
      b.addEventListener('click', () => choose(e.library.id))
      li.appendChild(b)
      return li
    }))
  }
  renderList()

  return {
    benchSlot,
    detail,
    showCard(entry, figures, modelSize, source): void {
      detail.style.display = ''
      const l = entry.library
      const rows: HTMLElement[] = [
        el('div', 'form-section-title', l.name),
        el('div', 'fine-print', `${l.side === 'allied' ? 'Allied' : 'Japanese'} ${l.kind}${statusNote(entry) === null ? '' : ` · ${statusNote(entry)}`}`),
        el('p', undefined, l.blurb),
      ]
      if (figures.length > 0 || modelSize || source || showAssetId) {
        const table = el('table', 'form-table')
        table.setAttribute('aria-label', 'Figures')
        if (showAssetId) {
          const tr = el('tr')
          tr.append(el('th', undefined, 'Asset ID'), el('td', undefined, l.id))
          table.appendChild(tr)
        }
        for (const f of figures) {
          const tr = el('tr')
          tr.append(el('th', undefined, f.label), el('td', undefined, f.note ? `${f.value} (${f.note})` : f.value))
          table.appendChild(tr)
        }
        if (modelSize) {
          const tr = el('tr')
          tr.append(el('th', undefined, 'Model size'), el('td', undefined, `${(modelSize.x / 0.3048).toFixed(1)} × ${(modelSize.z / 0.3048).toFixed(1)} × ${(modelSize.y / 0.3048).toFixed(1)} ft (length × width × height)`))
          table.appendChild(tr)
        }
        if (source) {
          const td = el('td')
          if (source === 'code') td.textContent = 'Drawn in code (no model file)'
          else if (source.kind === 'sketchfab') {
            // The author links to the download, as CC BY asks (the legend credits them in one line).
            const a = el('a', undefined, source.author)
            a.href = source.url
            a.target = '_blank'
            a.rel = 'noopener'
            a.style.color = 'inherit'
            const [before, after] = provenanceText(source).split(source.author) as [string, string]
            td.append(before, a, after)
          } else td.textContent = provenanceText(source)
          const tr = el('tr')
          tr.append(el('th', undefined, 'Model'), td)
          table.appendChild(tr)
        }
        rows.push(table)
      }
      for (const para of historyParagraphs(l.history)) rows.push(el('p', undefined, para))
      const sources = el('div', 'fine-print')
      for (const s of l.sources) {
        const a = el('a', undefined, s.title)
        a.href = s.url
        a.target = '_blank'
        a.rel = 'noopener'
        a.style.color = 'inherit'
        sources.append(a, ` (read ${s.read}) `)
      }
      rows.push(sources)
      card.replaceChildren(...rows)
    },
  }
}
