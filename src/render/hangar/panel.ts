// src/render/hangar/panel.ts
import { ensureStampFilter } from '../ui/navalComms.js'
import { filterCatalog, FILTER_KINDS, FILTER_SIDES, type CatalogEntry, type CatalogFilter } from './catalog.js'
import { historyParagraphs } from './library.js'
import type { Figure } from './stats.js'

export interface HangarPanel {
  /** Shows the info card for `entry` with its computed figures. */
  showCard(entry: CatalogEntry, figures: readonly Figure[], modelSize: { x: number; y: number; z: number } | null): void
  /** The element the bench (bench.ts) mounts into, under the card. */
  readonly benchSlot: HTMLElement
}

const KIND_LABEL: Readonly<Record<string, string>> = { all: 'All', aircraft: 'Aircraft', ship: 'Ships', building: 'Buildings' }
const SIDE_LABEL: Readonly<Record<string, string>> = { all: 'Both sides', allied: 'Allied', japanese: 'Japanese' }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

/**
 * The list, its two filters and the info card (Hangar spec §2), in the
 * Naval Communications style the title screen uses. `onSelect` is called with
 * a library id; main.ts loads the model and calls `showCard`.
 */
export function createPanel(root: HTMLElement, catalog: readonly CatalogEntry[], onSelect: (id: string) => void): HangarPanel {
  ensureStampFilter()
  const panel = el('div', 'naval-comms hangar-panel')
  panel.setAttribute('role', 'region')
  panel.setAttribute('aria-label', 'Library')
  // The panel fills its grid cell and the sheet scrolls inside it, rather
  // than the page growing to the list's height.
  panel.style.cssText = 'min-height:0;overflow:hidden;padding:16px'
  const sheet = el('div', 'sheet')
  sheet.style.cssText = 'flex:1 1 0;min-height:0;width:100%;box-sizing:border-box;overflow-y:auto;padding:14px 16px'
  panel.appendChild(sheet)

  const header = el('div', 'letterhead')
  header.append(el('div', 'letterhead-kicker', 'Bureau of Aeronautics'), el('div', 'letterhead-title', 'Library'))
  const back = el('a', 'ink-button', 'Back to title')
  back.href = import.meta.env.BASE_URL
  sheet.append(header, back)

  let filter: CatalogFilter = { kind: 'all', side: 'all' }
  const filters = el('div')
  filters.style.cssText = 'display:flex;gap:8px;margin:10px 0'
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
  )
  const list = el('ul')
  list.setAttribute('aria-label', 'Objects')
  list.style.cssText = 'list-style:none;margin:0;padding:0'
  const card = el('div', 'hangar-card')
  const benchSlot = el('div', 'hangar-bench')
  sheet.append(filters, list, card, benchSlot)
  root.appendChild(panel)

  function renderList(): void {
    list.replaceChildren(...filterCatalog(catalog, filter).map((e) => {
      const li = el('li')
      const b = el('button', 'ink-button', e.subject === null ? `${e.library.name} (not yet in service)` : e.library.name)
      b.dataset['id'] = e.library.id
      b.style.cssText = 'width:100%;text-align:left;margin:2px 0'
      b.addEventListener('click', () => onSelect(e.library.id))
      li.appendChild(b)
      return li
    }))
  }
  renderList()

  return {
    benchSlot,
    showCard(entry, figures, modelSize): void {
      const l = entry.library
      const rows: HTMLElement[] = [
        el('div', 'form-section-title', l.name),
        el('div', 'fine-print', `${l.side === 'allied' ? 'Allied' : 'Japanese'} ${l.kind}${entry.subject === null ? ' · Not yet in service' : ''}`),
        el('p', undefined, l.blurb),
      ]
      if (figures.length > 0) {
        const table = el('table', 'form-table')
        table.setAttribute('aria-label', 'Figures')
        for (const f of figures) {
          const tr = el('tr')
          tr.append(el('th', undefined, f.label), el('td', undefined, f.note ? `${f.value} (${f.note})` : f.value))
          table.appendChild(tr)
        }
        if (modelSize) {
          const tr = el('tr')
          tr.append(el('th', undefined, 'Model size'), el('td', undefined, `${modelSize.x.toFixed(1)} × ${modelSize.z.toFixed(1)} × ${modelSize.y.toFixed(1)} m (length × width × height)`))
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
