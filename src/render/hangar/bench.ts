// src/render/hangar/bench.ts
import type { PartPose, PartSpec } from './models.js'

/**
 * The articulation bench, behind `benchEnabled` (Hangar spec §8). H1 drives
 * the landing gear and the propeller; a part the model does not have reads
 * "not modeled", greyed, rather than offering a slider that moves nothing.
 * H2 adds stores, Cycle, gizmos, wireframe and the budget readout.
 */
export function mountBench(slot: HTMLElement, parts: readonly PartSpec[], onPose: (p: PartPose) => void): void {
  slot.replaceChildren()
  if (parts.length === 0) return
  const title = document.createElement('div')
  title.className = 'form-section-title'
  title.textContent = 'Test bench'
  slot.appendChild(title)
  for (const part of parts) {
    const row = document.createElement('label')
    row.style.cssText = 'display:flex;gap:8px;align-items:center;margin:4px 0'
    const name = document.createElement('span')
    name.textContent = part.label
    name.style.minWidth = '150px'
    row.appendChild(name)
    if (!part.modeled) {
      row.style.opacity = '.45'
      const note = document.createElement('span')
      note.textContent = 'not modeled'
      row.appendChild(note)
    } else {
      const input = document.createElement('input')
      input.type = 'range'
      input.min = String(part.range[0])
      input.max = String(part.range[1])
      input.step = '0.01'
      input.value = part.id === 'gear' ? '1' : '0'
      input.setAttribute('aria-label', part.label)
      input.addEventListener('input', () => {
        const v = Number(input.value)
        onPose(part.id === 'gear' ? { gearFraction: v } : part.id === 'flaps' ? { flapFraction: v } : { throttle: v })
      })
      row.appendChild(input)
    }
    slot.appendChild(row)
  }
}
