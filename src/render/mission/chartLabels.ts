export type LabelLine = { readonly text: string; readonly points: readonly (readonly [number, number])[] }
export type LabelSite = { readonly text: string; readonly x: number; readonly y: number }

const MIN_LENGTH_PX = 120
const MIN_SPACING_PX = 90

function midpoint(points: readonly (readonly [number, number])[]): { x: number; y: number; length: number } {
  const lengths: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    lengths.push(lengths[i - 1]! + Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]))
  }
  const total = lengths[lengths.length - 1]!
  const half = total / 2
  let i = 1
  while (i < points.length - 1 && lengths[i]! < half) i++
  const seg = lengths[i]! - lengths[i - 1]!
  const t = seg === 0 ? 0 : (half - lengths[i - 1]!) / seg
  const a = points[i - 1]!
  const b = points[i]!
  return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t, length: total }
}

/** Where to print elevation numbers: one per sufficiently long index line, spaced apart. */
export function contourLabelSites(
  lines: readonly LabelLine[],
  minLengthPx = MIN_LENGTH_PX,
  minSpacingPx = MIN_SPACING_PX,
): LabelSite[] {
  const sites: LabelSite[] = []
  for (const line of lines) {
    if (line.points.length < 2) continue
    const m = midpoint(line.points)
    if (m.length < minLengthPx) continue
    if (sites.some((s) => Math.hypot(s.x - m.x, s.y - m.y) < minSpacingPx)) continue
    sites.push({ text: line.text, x: m.x, y: m.y })
  }
  return sites
}
