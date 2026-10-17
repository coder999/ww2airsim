import type { World } from '../sim/loop.js'
import { createMissionMap } from './missionMap.js'
import { ensureStampFilter, sectionTitle } from './ui/navalComms.js'

/**
 * F9 director mode's pause-style overlay (Mark, 2026-10-17): the flight pause dossier's paper sheet with two tabs, the
 * interactive Map (right click a point to put the camera over it, keeping its height) and Director controls. The bar at the
 * bottom of the screen keeps the most important controls inline; this lists them all and will grow with the tool.
 */

export const DIRECTOR_CONTROLS: readonly (readonly [string, string])[] = [
  ['Fly the camera forward / back', 'W / S'],
  ['Strafe left / right', 'A / D'],
  ['Move the camera down / up', 'Q / E'],
  ['Look around', 'Drag: the point you grab stays under the pointer, 1:1'],
  ['Move 500 ft along the view', 'Mouse wheel (scroll up is forward)'],
  ['Jump over a point on the map', 'Right click on the Map tab (height is kept)'],
  ['Open this sheet on Director controls / on the Map', 'Esc / M (either closes it)'],
  ['Drop a key at the bar time', 'Drop key (stores the view you see)'],
  ['Move a key in time', 'Drag its number on the timeline; it stops at the next key'],
  ['Select a key / play from a key', 'Click its number'],
  ['Record a flown path', 'Record path, fly, Stop recording'],
  ['Save the scene', 'Save timeline JSON (downloads and copies the keys and cues, not the frame)'],
  ['Share what is on screen for debugging', 'Save frame JSON (a link that reopens this time and camera, plus a snapshot)'],
]

export type DirectorSheetTab = 'map' | 'controls'
export type DirectorSheetHandle = {
  show(tab: DirectorSheetTab, world: World<undefined>): void
  hide(): void
  isOpen(): boolean
}

export function createDirectorSheet(root: HTMLElement, deps: {
  onJump: (x: number, z: number) => void
  camera: () => { readonly x: number; readonly z: number; readonly yawDeg: number } | null
}): DirectorSheetHandle {
  ensureStampFilter()
  const backdrop = document.createElement('div')
  backdrop.setAttribute('data-director-sheet', '')
  backdrop.setAttribute('data-replay-ui', '')
  backdrop.style.cssText = 'position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:20px 12px;background:rgba(8,10,14,.48);z-index:22'
  const folder = document.createElement('section')
  folder.className = 'naval-comms'
  folder.setAttribute('role', 'dialog')
  folder.setAttribute('aria-modal', 'true')
  folder.setAttribute('aria-label', 'Director menu')
  folder.style.cssText = 'display:block;padding:0;background:transparent;width:min(920px,96vw);max-height:92vh;overflow-y:auto'
  const tabStrip = document.createElement('div')
  tabStrip.setAttribute('role', 'tablist')
  tabStrip.style.cssText = 'display:flex;align-items:flex-end;gap:3px;padding:0 14px'
  const sheet = document.createElement('div')
  sheet.className = 'sheet'
  sheet.style.cssText = 'position:relative;background:#d9c69b;border-color:#9c8559;box-shadow:0 12px 34px rgba(0,0,0,.34)'
  const letterhead = document.createElement('div')
  letterhead.className = 'letterhead'
  const text = document.createElement('div')
  text.className = 'letterhead-text'
  const kicker = document.createElement('div')
  kicker.className = 'letterhead-kicker'
  kicker.textContent = 'Scene direction — world held'
  const title = document.createElement('div')
  title.className = 'letterhead-title'
  title.textContent = 'Director'
  text.append(kicker, title)
  letterhead.appendChild(text)
  sheet.appendChild(letterhead)
  const contents = document.createElement('div')
  contents.style.cssText = 'min-height:360px'
  sheet.appendChild(contents)

  const panels = new Map<DirectorSheetTab, HTMLElement>()
  const tabs = new Map<DirectorSheetTab, HTMLButtonElement>()
  let shownWorld: World<undefined> | null = null
  const defs: readonly { id: DirectorSheetTab; label: string }[] = [{ id: 'map', label: 'Map' }, { id: 'controls', label: 'Director controls' }]
  for (const def of defs) {
    const tab = document.createElement('button')
    tab.setAttribute('role', 'tab')
    tab.className = 'ink-button'
    tab.textContent = def.label
    tab.style.cssText = 'flex:0 0 auto;border-bottom:0;border-radius:5px 5px 0 0;background:#c8b17d;padding:9px 14px;transform:translateY(1px)'
    tab.addEventListener('click', () => activate(def.id))
    tabStrip.appendChild(tab)
    tabs.set(def.id, tab)
    const panel = document.createElement('section')
    panel.setAttribute('role', 'tabpanel')
    panel.style.display = 'none'
    contents.appendChild(panel)
    panels.set(def.id, panel)
  }

  const mapPanel = panels.get('map')!
  mapPanel.appendChild(sectionTitle('Mission Map'))
  const hint = document.createElement('p')
  hint.style.cssText = 'margin:0 0 6px;font-size:13px'
  hint.textContent = 'The red arrow is the camera. Right click a point to put the camera over it, at its current height. Wheel zooms, drag pans, double click resets.'
  mapPanel.appendChild(hint)
  const mapHost = document.createElement('div')
  mapPanel.appendChild(mapHost)
  const map = createMissionMap(mapHost, { embedded: true, onClose: () => undefined, onSelect: () => undefined, onJump: deps.onJump, cameraMarker: deps.camera })

  const controlsPanel = panels.get('controls')!
  controlsPanel.appendChild(sectionTitle('Director Controls'))
  const table = document.createElement('table')
  table.className = 'form-table'
  const body = document.createElement('tbody')
  for (const [what, keys] of DIRECTOR_CONTROLS) {
    const row = document.createElement('tr')
    const a = document.createElement('td')
    a.textContent = what
    const b = document.createElement('td')
    b.className = 'num'
    b.textContent = keys
    row.append(a, b)
    body.appendChild(row)
  }
  table.appendChild(body)
  controlsPanel.appendChild(table)

  const footer = document.createElement('div')
  footer.className = 'button-row'
  const resume = document.createElement('button')
  resume.className = 'ink-button'
  resume.textContent = 'Resume directing'
  resume.addEventListener('click', () => hide())
  footer.appendChild(resume)
  sheet.appendChild(footer)
  const finePrint = document.createElement('div')
  finePrint.className = 'fine-print'
  finePrint.textContent = 'Esc to resume'
  sheet.appendChild(finePrint)
  folder.append(tabStrip, sheet)
  backdrop.appendChild(folder)
  root.appendChild(backdrop)

  function activate(id: DirectorSheetTab): void {
    for (const def of defs) {
      const selected = def.id === id
      const tab = tabs.get(def.id)!
      tab.setAttribute('aria-selected', String(selected))
      tab.style.background = selected ? '#d9c69b' : '#c8b17d'
      tab.style.fontWeight = selected ? '700' : '400'
      panels.get(def.id)!.style.display = selected ? 'block' : 'none'
    }
    if (id === 'map' && shownWorld !== null) map.show(shownWorld, null)
    else map.hide()
  }
  function hide(): void {
    backdrop.style.display = 'none'
    map.hide()
  }
  return {
    show(tab, world) {
      shownWorld = world
      backdrop.style.display = 'flex'
      activate(tab)
    },
    hide,
    isOpen: () => backdrop.style.display !== 'none',
  }
}
