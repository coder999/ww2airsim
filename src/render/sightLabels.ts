import { Vector3, type Camera } from 'three'
import type { Vec3 } from '../sim/math/vec3.js'

/**
 * Short text beside the torpedosight's drawn elements (Mark 2026-10-15: "what is this green cross?"): ENTRY beside the ring. They are for sighted players only (`aria-hidden`): the verdict is announced
 * from the badge's own live region, once, on a change.
 */
export const FEET_PER_METRE = 3.28084

/** CSS pixel of a world point (the scene is shifted by `worldOffset`, as in the marker); null when behind the eye. */
export function projectToScreen(p: Vec3, camera: Camera, worldOffset: Vec3, width: number, height: number): { readonly x: number; readonly y: number } | null {
  camera.updateMatrixWorld()
  const v = new Vector3(p.x + worldOffset.x, p.y + worldOffset.y, p.z + worldOffset.z).project(camera)
  if (v.z > 1 || !Number.isFinite(v.x) || !Number.isFinite(v.y)) return null
  return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height }
}

export type SightLabelsHandle = {
  /** `entry` null (or `tone` null) hides the label. */
  update(entry: { x: number; y: number } | null, tone: 'ok' | 'bad' | null): void
}

export function createSightLabels(root: HTMLElement): SightLabelsHandle {
  const make = (text: string): HTMLDivElement => {
    const el = document.createElement('div')
    el.setAttribute('aria-hidden', 'true')
    el.textContent = text
    el.style.cssText = 'position:fixed;left:0;top:0;padding:1px 6px;border-radius:3px;background:rgba(12,14,18,.82);font:13px/1.3 ui-monospace,Menlo,monospace;letter-spacing:.06em;pointer-events:none;display:none;white-space:nowrap'
    root.appendChild(el)
    return el
  }
  const entryEl = make('ENTRY')
  const place = (el: HTMLDivElement, at: { x: number; y: number } | null, dx: number, color: string): void => {
    if (at === null) { el.style.display = 'none'; return }
    el.style.display = 'block'
    el.style.color = color
    el.style.transform = `translate(${Math.round(at.x + dx)}px, ${Math.round(at.y - 9)}px)`
  }
  return {
    update(entry, tone) {
      const color = tone === 'bad' ? '#ff9e97' : '#7ee787'
      place(entryEl, tone === null ? null : entry, 26, color)
    },
  }
}
