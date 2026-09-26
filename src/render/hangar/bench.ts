// src/render/hangar/bench.ts
import type { PartPose, PartSpec } from './models.js'
import type { BenchState, CyclePart } from './benchController.js'
import { countsText, type CountsReport } from './budgets.js'

/**
 * The articulation bench, behind `benchEnabled` (Hangar spec §8). One row per
 * part the spec lists; a part the model does not have reads "not modeled",
 * greyed, rather than offering a control that moves nothing. Then the debug
 * toggles and the counts against the model's manifest budget, for every
 * model. The logic lives in benchController.ts and budgets.ts, which Node
 * tests; this file only draws it. H2 complete; H3 adds turret rows.
 */
export type DebugToggle = 'wireframe' | 'gizmos' | 'turntable'

export interface BenchHandlers {
  onPose(p: PartPose): void
  onCycle(part: CyclePart): void
  onDebug(which: DebugToggle, on: boolean): void
}

export interface BenchHandle {
  /** Moves the controls to `s` without firing their handlers. */
  sync(s: BenchState): void
  setCounts(r: CountsReport): void
}

const OVER_COLOR = '#c0392b'

function checkbox(label: string, checked: boolean, onChange: (on: boolean) => void): { row: HTMLLabelElement; input: HTMLInputElement } {
  const row = document.createElement('label')
  row.style.cssText = 'display:inline-flex;gap:4px;align-items:center;margin-right:12px'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.checked = checked
  input.setAttribute('aria-label', label)
  input.addEventListener('change', () => onChange(input.checked))
  row.append(input, label)
  return { row, input }
}

export function mountBench(
  slot: HTMLElement,
  parts: readonly PartSpec[],
  cycleable: boolean,
  debug: Readonly<Record<DebugToggle, boolean>>,
  h: BenchHandlers,
): BenchHandle {
  slot.replaceChildren()
  const title = document.createElement('div')
  title.className = 'form-section-title'
  title.textContent = 'Test bench'
  slot.appendChild(title)

  const sliders = new Map<'gear' | 'flaps' | 'prop', HTMLInputElement>()
  const stores = new Map<'bombs' | 'rockets', HTMLInputElement>()
  for (const part of parts) {
    const row = document.createElement('div')
    // Wraps: the panel is 380 px, and a slider plus Cycle, or two store boxes, overflowed it (2026-09-26).
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px 8px;align-items:center;margin:4px 0'
    const name = document.createElement('span')
    name.textContent = part.label
    name.style.minWidth = '120px'
    row.appendChild(name)
    if (!part.modeled) {
      row.style.opacity = '.45'
      const note = document.createElement('span')
      note.textContent = 'not modeled'
      row.appendChild(note)
    } else if (part.id === 'stores') {
      for (const which of ['bombs', 'rockets'] as const) {
        const { row: box, input } = checkbox(which === 'bombs' ? 'Bombs' : 'Rockets', true, (on) => h.onPose(which === 'bombs' ? { bombs: on } : { rockets: on }))
        stores.set(which, input)
        row.appendChild(box)
      }
    } else {
      const id = part.id
      const input = document.createElement('input')
      input.type = 'range'
      input.min = String(part.range[0])
      input.max = String(part.range[1])
      input.step = '0.01'
      input.value = id === 'gear' ? '1' : '0'
      input.setAttribute('aria-label', part.label)
      input.style.cssText = 'flex:1 1 90px;min-width:80px'
      input.addEventListener('input', () => {
        const v = Number(input.value)
        h.onPose(id === 'gear' ? { gearFraction: v } : id === 'flaps' ? { flapFraction: v } : { throttle: v })
      })
      sliders.set(id, input)
      row.appendChild(input)
      if (cycleable && part.kind === 'fraction' && (id === 'gear' || id === 'flaps')) {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = 'Cycle'
        button.setAttribute('aria-label', `Cycle ${part.label.toLowerCase()}`)
        button.addEventListener('click', () => h.onCycle(id))
        row.appendChild(button)
      }
    }
    slot.appendChild(row)
  }

  const debugRow = document.createElement('div')
  debugRow.style.cssText = 'margin:8px 0 4px'
  const toggles: readonly [DebugToggle, string][] = [['gizmos', 'Pivot gizmos'], ['wireframe', 'Wireframe'], ['turntable', 'Turntable']]
  for (const [which, label] of toggles) debugRow.appendChild(checkbox(label, debug[which], (on) => h.onDebug(which, on)).row)
  slot.appendChild(debugRow)

  const counts = document.createElement('div')
  counts.className = 'hangar-counts'
  counts.style.cssText = 'font-size:12px;margin-top:4px'
  counts.dataset.over = 'false'
  slot.appendChild(counts)

  return {
    sync(s): void {
      const set = (id: 'gear' | 'flaps' | 'prop', v: number): void => { const el = sliders.get(id); if (el) el.value = String(v) }
      set('gear', s.gearFraction)
      set('flaps', s.flapFraction)
      set('prop', s.throttle)
      const b = stores.get('bombs'), r = stores.get('rockets')
      if (b) b.checked = s.bombs
      if (r) r.checked = s.rockets
    },
    setCounts(report): void {
      const t = countsText(report)
      counts.dataset.over = String(t.over)
      counts.style.color = t.over ? OVER_COLOR : ''
      counts.replaceChildren(...t.lines.map((line) => {
        const d = document.createElement('div')
        d.textContent = line
        return d
      }))
    },
  }
}
