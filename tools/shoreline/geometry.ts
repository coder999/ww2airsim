import { LAND_THRESHOLD_M } from '../../src/render/mission/chartLayers.js'
import { smoothPolyline, traceLevel, type Grid, type Polyline, type Pt } from '../../src/render/mission/chartIso.js'
import type { TerrainHeader } from '../../src/sim/world/schema.js'

export const SHORE_SOURCE_LEVEL = 1
export const SHORE_SMOOTHING_ITERATIONS = 1
export const SHORE_POINT_SPACING_M = 35
export const MIN_SHORE_PERIMETER_M = 250

export const SHORE_LANES = {
  // The source L1 cells are 48.8 m wide.  The opaque ribbon must overlap
  // more than a cell diagonal on both sides of the zero contour; otherwise
  // the old terrain triangles can still poke through as a square silhouette.
  inlandM: 96,
  dryM: 24,
  waterlineM: -64,
  submergedM: -120,
  waterlineHeightM: 0.08,
  submergedHeightM: -0.8,
} as const

export type ShorePoint = {
  readonly x: number
  readonly z: number
  /** Unit normal pointing toward land. */
  readonly nx: number
  readonly nz: number
  /** Terrain height at the inland and dry-sand lanes. */
  readonly inlandY: number
  readonly dryY: number
}

export type ShoreLine = {
  readonly closed: boolean
  readonly points: readonly ShorePoint[]
  readonly perimeterM: number
}

export type ShoreGeometry = {
  readonly version: 1
  readonly sourceLevel: number
  readonly sourceStepM: number
  readonly halfExtentM: number
  readonly lanes: typeof SHORE_LANES
  readonly lines: readonly ShoreLine[]
}

export type TerrainGrid = {
  readonly header: TerrainHeader
  readonly level: number
  readonly samples: number
  readonly stepM: number
  readonly heightsM: Float32Array
  readonly grid: Grid
}

export function terrainGrid(header: TerrainHeader, level: number, heightsDm: Int16Array): TerrainGrid {
  if (!Number.isInteger(level) || level < 0 || level >= header.levels) throw new Error(`shoreline: invalid terrain level ${level}`)
  const samples = (header.finestSamples - 1) / 2 ** level + 1
  if (!Number.isInteger(samples) || heightsDm.length !== samples * samples) {
    throw new Error(`shoreline: terrain level ${level} has ${heightsDm.length} values, expected ${samples}x${samples}`)
  }
  const stepM = (2 * header.halfExtentM) / (samples - 1)
  const heightsM = Float32Array.from(heightsDm, (v) => v / 10)
  return {
    header, level, samples, stepM, heightsM,
    grid: {
      cols: samples - 1,
      rows: samples - 1,
      minX: -header.halfExtentM,
      minZ: -header.halfExtentM,
      dx: stepM,
      dz: stepM,
      values: heightsM,
    },
  }
}

export function sampleTerrain(g: TerrainGrid, x: number, z: number): number {
  const h = g.header.halfExtentM
  const col = Math.min(g.samples - 1, Math.max(0, (x + h) / g.stepM))
  const row = Math.min(g.samples - 1, Math.max(0, (z + h) / g.stepM))
  const c0 = Math.floor(col), r0 = Math.floor(row)
  const c1 = Math.min(c0 + 1, g.samples - 1), r1 = Math.min(r0 + 1, g.samples - 1)
  const fx = col - c0, fz = row - r0
  const at = (c: number, r: number): number => g.heightsM[r * g.samples + c]!
  const north = at(c0, r0) + (at(c1, r0) - at(c0, r0)) * fx
  const south = at(c0, r1) + (at(c1, r1) - at(c0, r1)) * fx
  return north + (south - north) * fz
}

const distance = (a: Pt, b: Pt): number => Math.hypot(b[0] - a[0], b[1] - a[1])

export function polylineLength(line: Polyline): number {
  let total = 0
  for (let i = 1; i < line.points.length; i++) total += distance(line.points[i - 1]!, line.points[i]!)
  if (line.closed && line.points.length > 1) total += distance(line.points[line.points.length - 1]!, line.points[0]!)
  return total
}

/** Evenly samples a polyline without duplicating a closed line's first point. */
export function resamplePolyline(line: Polyline, spacingM: number): Polyline {
  if (!(spacingM > 0) || line.points.length < 2) return line
  const source = line.closed ? [...line.points, line.points[0]!] : [...line.points]
  const cumulative = [0]
  for (let i = 1; i < source.length; i++) cumulative.push(cumulative[i - 1]! + distance(source[i - 1]!, source[i]!))
  const total = cumulative[cumulative.length - 1]!
  if (!(total > spacingM)) return line
  const segments = Math.max(line.closed ? 3 : 1, Math.round(total / spacingM))
  const count = line.closed ? segments : segments + 1
  const out: Pt[] = []
  let edge = 1
  for (let i = 0; i < count; i++) {
    const d = line.closed ? (i * total) / segments : (i * total) / (count - 1)
    while (edge < cumulative.length - 1 && cumulative[edge]! < d) edge++
    const a = source[edge - 1]!, b = source[edge]!
    const d0 = cumulative[edge - 1]!, d1 = cumulative[edge]!
    const t = d1 === d0 ? 0 : (d - d0) / (d1 - d0)
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
  }
  return { points: out, closed: line.closed }
}

function tangentAt(points: readonly Pt[], closed: boolean, i: number): Pt {
  const prev = points[i === 0 ? (closed ? points.length - 1 : 0) : i - 1]!
  const next = points[i === points.length - 1 ? (closed ? 0 : points.length - 1) : i + 1]!
  const dx = next[0] - prev[0], dz = next[1] - prev[1]
  const length = Math.hypot(dx, dz)
  return length > 1e-6 ? [dx / length, dz / length] : [1, 0]
}

/** Picks one side for the whole curve, preventing point-to-point normal flips at flat samples. */
export function landSideSign(g: TerrainGrid, line: Polyline): 1 | -1 {
  let score = 0
  const offset = g.stepM * 0.7
  const stride = Math.max(1, Math.floor(line.points.length / 256))
  for (let i = 0; i < line.points.length; i += stride) {
    const p = line.points[i]!
    const [tx, tz] = tangentAt(line.points, line.closed, i)
    const nx = -tz, nz = tx
    const left = sampleTerrain(g, p[0] + nx * offset, p[1] + nz * offset)
    const right = sampleTerrain(g, p[0] - nx * offset, p[1] - nz * offset)
    score += left - right
  }
  return score >= 0 ? 1 : -1
}

export function buildShoreGeometry(g: TerrainGrid, bounds?: { minX: number; maxX: number; minZ: number; maxZ: number }): ShoreGeometry {
  let traced = traceLevel(g.grid, LAND_THRESHOLD_M)
  if (bounds) {
    traced = traced.filter((line) => line.points.some(([x, z]) => x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ))
  }
  const lines: ShoreLine[] = []
  for (const raw of traced) {
    const perimeterM = polylineLength(raw)
    if (raw.points.length < 3 || perimeterM < MIN_SHORE_PERIMETER_M) continue
    const line = resamplePolyline(smoothPolyline(raw, SHORE_SMOOTHING_ITERATIONS), SHORE_POINT_SPACING_M)
    if (line.points.length < 3) continue
    const sign = landSideSign(g, line)
    const points = line.points.map((p, i): ShorePoint => {
      const [tx, tz] = tangentAt(line.points, line.closed, i)
      const nx = -tz * sign, nz = tx * sign
      const inlandY = Math.max(SHORE_LANES.waterlineHeightM, sampleTerrain(g, p[0] + nx * SHORE_LANES.inlandM, p[1] + nz * SHORE_LANES.inlandM))
      const dryY = Math.max(SHORE_LANES.waterlineHeightM, sampleTerrain(g, p[0] + nx * SHORE_LANES.dryM, p[1] + nz * SHORE_LANES.dryM))
      return { x: p[0], z: p[1], nx, nz, inlandY, dryY }
    })
    lines.push({ closed: line.closed, points, perimeterM })
  }
  return {
    version: 1,
    sourceLevel: g.level,
    sourceStepM: g.stepM,
    halfExtentM: g.header.halfExtentM,
    lanes: SHORE_LANES,
    lines,
  }
}
