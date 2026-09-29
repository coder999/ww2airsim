import type { ChartBounds } from '../missionMap.js'

/** Zoom relative to the fitted chart, and the world point at the chart center. */
export type ChartView = { readonly zoom: number; readonly cx: number; readonly cz: number }

export const MAX_ZOOM = 16
const WORLD_HALF_EXTENT_M = 100_000

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

export function fitView(base: ChartBounds): ChartView {
  return { zoom: 1, cx: (base.minX + base.maxX) / 2, cz: (base.minZ + base.maxZ) / 2 }
}

/** The fitted bounds narrowed by `zoom` and recentered; feeds projectPoint as usual. */
export function viewBounds(base: ChartBounds, view: ChartView): ChartBounds {
  const halfX = (base.maxX - base.minX) / view.zoom / 2
  const halfZ = (base.maxZ - base.minZ) / view.zoom / 2
  return { minX: view.cx - halfX, maxX: view.cx + halfX, minZ: view.cz - halfZ, maxZ: view.cz + halfZ }
}

const scaleOf = (b: ChartBounds, width: number, height: number): number =>
  Math.min(width / (b.maxX - b.minX), height / (b.maxZ - b.minZ))

/** Scale `view` by `factor` keeping the world point under the cursor fixed;
 * `fx`/`fz` are the cursor's fractions across and down the chart. */
export function zoomView(
  base: ChartBounds,
  view: ChartView,
  factor: number,
  fx: number,
  fz: number,
  width: number,
  height: number,
): ChartView {
  const zoom = clamp(view.zoom * factor, 1, MAX_ZOOM)
  const s = scaleOf(viewBounds(base, view), width, height)
  const sNext = s * (zoom / view.zoom)
  const px = view.cx + (fx - 0.5) * (width / s)
  const pz = view.cz + (fz - 0.5) * (height / s)
  return {
    zoom,
    cx: clamp(px - (fx - 0.5) * (width / sNext), -WORLD_HALF_EXTENT_M, WORLD_HALF_EXTENT_M),
    cz: clamp(pz - (fz - 0.5) * (height / sNext), -WORLD_HALF_EXTENT_M, WORLD_HALF_EXTENT_M),
  }
}

/** Drag by (dxPx, dyPx) chart pixels; the map follows the pointer. */
export function panView(view: ChartView, dxPx: number, dyPx: number, pixelsPerMeter: number): ChartView {
  return {
    zoom: view.zoom,
    cx: clamp(view.cx - dxPx / pixelsPerMeter, -WORLD_HALF_EXTENT_M, WORLD_HALF_EXTENT_M),
    cz: clamp(view.cz - dyPx / pixelsPerMeter, -WORLD_HALF_EXTENT_M, WORLD_HALF_EXTENT_M),
  }
}
