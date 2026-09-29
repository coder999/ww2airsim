export type LabelLine = { readonly text: string; readonly points: readonly (readonly [number, number])[] }
export type LabelSite = { readonly text: string; readonly x: number; readonly y: number }

const MIN_LENGTH_PX = 120
const MIN_SPACING_PX = 90
const CELL_PX = 260

const lengthOf = (points: readonly (readonly [number, number])[]): number => {
  let total = 0
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1])
  return total
}

/**
 * Where to print elevation numbers. Lines are in world meters and each label
 * snaps to the vertex nearest the center of a world-anchored lattice cell, so
 * panning the chart never moves a label; only zooming (a new lattice) does.
 */
export function contourLabelSites(
  lines: readonly LabelLine[],
  metersPerPixel = 1,
  minLengthPx = MIN_LENGTH_PX,
  minSpacingPx = MIN_SPACING_PX,
): LabelSite[] {
  const cell = CELL_PX * metersPerPixel
  const best = new Map<string, { i: number; j: number; d: number; site: LabelSite }>()
  for (const line of lines) {
    if (line.points.length < 2 || lengthOf(line.points) < minLengthPx * metersPerPixel) continue
    for (const [x, z] of line.points) {
      const i = Math.floor(x / cell)
      const j = Math.floor(z / cell)
      const d = Math.hypot(x - (i + 0.5) * cell, z - (j + 0.5) * cell)
      const key = `${line.text}|${i}|${j}`
      const prev = best.get(key)
      if (prev === undefined || d < prev.d) best.set(key, { i, j, d, site: { text: line.text, x, y: z } })
    }
  }
  const ordered = [...best.values()].sort((a, b) => a.j - b.j || a.i - b.i || Number(a.site.text) - Number(b.site.text))
  const sites: LabelSite[] = []
  for (const { site } of ordered) {
    if (sites.some((s) => Math.hypot(s.x - site.x, s.y - site.y) < minSpacingPx * metersPerPixel)) continue
    sites.push(site)
  }
  return sites
}
