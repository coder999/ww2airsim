import { toGeodetic, toLocal } from '../../sim/world/projection.js'
import type { Area } from './chartIso.js'
import { M_PER_NMI } from './chartScale.js'

export type ScreenPt = { readonly x: number; readonly y: number }
export type GraticuleLabel = {
  readonly text: string
  readonly x: number
  readonly y: number
  readonly anchor: 'end' | 'middle'
}

const STEPS_ARCMIN = [1, 2, 5, 10, 30, 60] as const
const MIN_LINES_ACROSS = 4
const SAMPLES_PER_LINE = 16
const LAT_LABEL_X = -6
const LON_LABEL_DY = 16

export function graticuleStepArcmin(spanM: number): number {
  let chosen: number = STEPS_ARCMIN[0]
  for (const step of STEPS_ARCMIN) if (spanM / (step * M_PER_NMI) >= MIN_LINES_ACROSS) chosen = step
  return chosen
}

export function formatLatLon(deg: number, axis: 'lat' | 'lon'): string {
  const hemisphere = axis === 'lat' ? (deg >= 0 ? 'N' : 'S') : deg >= 0 ? 'E' : 'W'
  const total = Math.round(Math.abs(deg) * 60)
  return `${Math.floor(total / 60)}°${String(total % 60).padStart(2, '0')}′${hemisphere}`
}

/** First point where the polyline crosses the given axis-aligned line, or null. */
function crossing(points: readonly ScreenPt[], axis: 'x' | 'y', value: number): ScreenPt | null {
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const da = a[axis] - value
    const db = b[axis] - value
    if (da === db || da * db > 0) continue
    const t = da / (da - db)
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
  }
  return null
}

/**
 * Lat/long lines over the visible world rectangle `area`, already projected
 * to chart pixels, with degree-minute labels for the left and bottom margins.
 * Lines are sampled along the true parallel or meridian (the world projection
 * is azimuthal, so they are very slightly curved).
 */
export function buildGraticule(
  area: Area,
  project: (x: number, z: number) => ScreenPt,
  width: number,
  height: number,
): { readonly lines: ScreenPt[][]; readonly labels: GraticuleLabel[] } {
  const corners = [
    toGeodetic(area.minX, area.minZ), toGeodetic(area.maxX, area.minZ),
    toGeodetic(area.minX, area.maxZ), toGeodetic(area.maxX, area.maxZ),
  ]
  const lats = corners.map((c) => c.latDeg)
  const lons = corners.map((c) => c.lonDeg)
  const latMin = Math.min(...lats)
  const latMax = Math.max(...lats)
  const lonMin = Math.min(...lons)
  const lonMax = Math.max(...lons)
  const step = graticuleStepArcmin(area.maxX - area.minX)
  const lines: ScreenPt[][] = []
  const labels: GraticuleLabel[] = []
  const sample = (from: number, to: number, at: (t: number) => ScreenPt): ScreenPt[] =>
    Array.from({ length: SAMPLES_PER_LINE + 1 }, (_, i) => at(from + ((to - from) * i) / SAMPLES_PER_LINE))

  for (let m = Math.ceil((latMin * 60) / step) * step; m <= latMax * 60; m += step) {
    const lat = m / 60
    const points = sample(lonMin, lonMax, (lon) => {
      const p = toLocal(lat, lon)
      return project(p.x, p.z)
    })
    lines.push(points)
    const edge = crossing(points, 'x', 0)
    if (edge !== null && edge.y >= 0 && edge.y <= height) {
      labels.push({ text: formatLatLon(lat, 'lat'), x: LAT_LABEL_X, y: edge.y + 4, anchor: 'end' })
    }
  }
  for (let m = Math.ceil((lonMin * 60) / step) * step; m <= lonMax * 60; m += step) {
    const lon = m / 60
    const points = sample(latMin, latMax, (lat) => {
      const p = toLocal(lat, lon)
      return project(p.x, p.z)
    })
    lines.push(points)
    const edge = crossing(points, 'y', height)
    if (edge !== null && edge.x >= 0 && edge.x <= width) {
      labels.push({ text: formatLatLon(lon, 'lon'), x: edge.x, y: height + LON_LABEL_DY, anchor: 'middle' })
    }
  }
  return { lines, labels }
}
