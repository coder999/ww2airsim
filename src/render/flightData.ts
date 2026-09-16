import type { AircraftSpec } from '../sim/flight/schema.js'
import type { AircraftState, Controls } from '../sim/flight/state.js'
import type { CameraMode } from './camera.js'
import { attitudeAngles, COCKPIT_GAUGES, fuelFraction, gaugeValue } from './gauges.js'
import { BINDINGS } from '../input/bindings.js'
import { keyLabel } from './legend.js'

export type FlightDataItem = { readonly label: string; readonly value: string }

/** Full numeric values: unlike a dial, the strip has no end stop to peg at. */
export function flightDataItems(spec: AircraftSpec, state: AircraftState, controls: Controls): FlightDataItem[] {
  const number = (value: number, signed = false): string => {
    if (!Number.isFinite(value)) return '--'
    const rounded = Math.round(value)
    return `${signed && rounded >= 0 ? '+' : ''}${rounded}`
  }
  const items = COCKPIT_GAUGES.map(g => {
    const value = gaugeValue(g.id, spec, state, controls)
    if (g.id === 'heading') return { label: 'HDG', value: Number.isFinite(value) ? `${((Math.round(value) % 360 + 360) % 360).toString().padStart(3, '0')}°` : '--' }
    if (g.id === 'fuel') return { label: 'FUEL', value: `${number(fuelFraction(spec, state) * 100)}% (${number(value)} gal)` }
    return {
      label: g.id === 'airspeed' ? 'SPD' : g.id === 'altimeter' ? 'ALT' : g.id === 'verticalSpeed' ? 'V/S' : 'THR',
      value: `${number(value, g.id === 'verticalSpeed')} ${g.unit}`,
    }
  })
  const attitude = attitudeAngles(state)
  items.push({ label: 'PITCH', value: `${number(attitude.pitchRad * 180 / Math.PI, true)}°` })
  items.push({ label: 'BANK', value: `${number(attitude.rollRad * 180 / Math.PI, true)}°` })
  return items
}

export function createFlightData(root: HTMLElement): {
  toggle(): void
  update(mode: CameraMode, spec: AircraftSpec, state: AircraftState, controls: Controls): void
} {
  const strip = document.createElement('div')
  strip.setAttribute('aria-label', 'Flight data')
  strip.style.cssText = 'position:fixed;bottom:0;left:0;right:0;display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:4px 18px;padding:6px 10px;box-sizing:border-box;background:#f5f5ef;color:#172027;font:12px/1.3 ui-monospace,monospace;border-top:1px solid #aeb6b6;'
  const fields = document.createElement('div')
  fields.style.cssText = 'display:flex;flex:1;align-items:center;justify-content:space-evenly;flex-wrap:wrap;gap:4px 14px'
  strip.appendChild(fields)
  const toggle = document.createElement('button')
  const key = BINDINGS.toggleFlightData.map(keyLabel).join(' / ')
  toggle.style.cssText = 'border:0;background:#f5f5ef;color:#172027;font:11px ui-monospace,monospace;padding:5px 8px;cursor:pointer'
  root.append(strip, toggle)
  let enabled = true
  let cameraMode: CameraMode = 'chase'
  const values = new Map<string, HTMLElement>()
  const show = (): void => {
    strip.style.display = cameraMode === 'chase' && enabled ? 'flex' : 'none'
    toggle.style.display = cameraMode === 'chase' ? 'block' : 'none'
    toggle.style.position = enabled ? 'static' : 'fixed'
    toggle.style.right = '8px'
    toggle.style.bottom = '8px'
    toggle.textContent = enabled ? `${key} · Hide` : `${key} · Flight data`
    toggle.setAttribute('aria-label', enabled ? 'Hide flight data' : 'Show flight data')
    toggle.setAttribute('aria-pressed', String(enabled))
    if (enabled) strip.appendChild(toggle)
    else root.appendChild(toggle)
  }
  const flip = (): void => { enabled = !enabled; show() }
  toggle.addEventListener('click', () => { flip(); toggle.blur() })
  show()
  return {
    toggle: flip,
    update(mode, spec, state, controls) {
      if (mode !== cameraMode) { cameraMode = mode; show() }
      if (mode !== 'chase' || !enabled) return
      const items = flightDataItems(spec, state, controls)
      for (const item of items) {
        const existing = values.get(item.label)
        if (existing) {
          if (existing.textContent !== item.value) existing.textContent = item.value
          continue
        }
        const field = document.createElement('span')
        field.style.whiteSpace = 'nowrap'
        const label = document.createElement('span')
        label.style.color = '#59666b'
        label.textContent = `${item.label} `
        const value = document.createElement('strong')
        value.textContent = item.value
        field.append(label, value)
        fields.appendChild(field)
        values.set(item.label, value)
      }
    },
  }
}
