import { coverFractionsAt } from '../../sim/world/cover.js'
import { heightAt, type TerrainField } from '../../sim/world/terrain.js'
import { padGrid, sampleGrid, smoothPolyline, traceLevel, type Area, type Polyline } from './chartIso.js'
import { contourIntervalFt, contourLevels } from './chartScale.js'

/** Any sample above this is land; the coast pass writes the shoreline at 0.3 m or more. */
export const LAND_THRESHOLD_M = 0.15
const HEIGHT_COLUMNS = 240
const COVER_LEVEL = 0.5
const COVER_SMOOTHING = 2
const COAST_SMOOTHING = 1

export type ContourLayer = { readonly levelFt: number; readonly index: boolean; readonly lines: readonly Polyline[] }

export type ChartLayers = {
  /** Closed loops for the land wash; fill with `evenodd`. */
  readonly land: readonly Polyline[]
  /** The shoreline, open where it leaves the frame. */
  readonly coast: readonly Polyline[]
  readonly woodland: readonly Polyline[]
  readonly crop: readonly Polyline[]
  readonly mangrove: readonly Polyline[]
  readonly contours: readonly ContourLayer[]
  readonly intervalFt: number
}

const smooth = (lines: readonly Polyline[], iterations: number): Polyline[] =>
  lines.map((line) => smoothPolyline(line, iterations))

/**
 * Everything the chart draws from the ground: land, coast, contours and the
 * cover patches, over the visible world rectangle `area`. Pure and
 * deterministic; the caller caches it per (terrain, area).
 */
export function buildChartLayers(terrain: TerrainField | null | undefined, area: Area): ChartLayers {
  const wantedFt = contourIntervalFt(area.maxX - area.minX)
  if (terrain === null || terrain === undefined) {
    return { land: [], coast: [], woodland: [], crop: [], mangrove: [], contours: [], intervalFt: wantedFt }
  }
  const heights = sampleGrid(area, HEIGHT_COLUMNS, (x, z) => heightAt(terrain, x, z))
  const land = smooth(traceLevel(padGrid(heights, -1), LAND_THRESHOLD_M), COAST_SMOOTHING)
  const coast = smooth(traceLevel(heights, LAND_THRESHOLD_M), COAST_SMOOTHING)

  let maxHeightM = 0
  for (const h of heights.values) if (h > maxHeightM) maxHeightM = h
  const { intervalFt, levels } = contourLevels(maxHeightM, wantedFt)
  const contours = levels
    .map((level) => ({
      levelFt: level.levelFt,
      index: level.index,
      lines: smooth(traceLevel(heights, level.levelM), COAST_SMOOTHING),
    }))
    .filter((layer) => layer.lines.length > 0)

  const cover = terrain.cover
  const patches = (fraction: (t: { tree: number; crop: number; mangrove: number }) => number): Polyline[] => {
    if (cover === null || cover === undefined) return []
    const grid = sampleGrid(area, HEIGHT_COLUMNS, (x, z) =>
      heightAt(terrain, x, z) > LAND_THRESHOLD_M ? fraction(coverFractionsAt(cover.data, cover.header, x, z)) : 0,
    )
    return smooth(traceLevel(padGrid(grid, 0), COVER_LEVEL - 1e-6), COVER_SMOOTHING)
  }
  return {
    land,
    coast,
    woodland: patches((f) => Math.min(1, f.tree + f.mangrove)),
    crop: patches((f) => f.crop),
    mangrove: patches((f) => f.mangrove),
    contours,
    intervalFt,
  }
}
