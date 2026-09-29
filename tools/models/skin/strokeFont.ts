// tools/models/skin/strokeFont.ts
/**
 * The stroke font for hull numbers (DP2). Original work, AGPL-3.0-or-later. Each glyph is
 * polylines in a box GLYPH_W wide and 1 tall, y up, as a reader outside the hull sees it. Block
 * numerals in the manner of 1944 stencils (ESTIMATE: no stencil drawing is cited). DP1 adds
 * letters for the B-29's tail codes. Distances are in text heights.
 */
export const GLYPH_W = 0.5
/** Glyph width plus the gap to the next, in heights. */
export const ADVANCE = 0.7

type Pt = readonly [number, number]
export const GLYPHS: Readonly<Record<string, readonly (readonly Pt[])[]>> = {
  ' ': [],
  '-': [[[0.1, 0.5], [0.4, 0.5]]],
  '0': [[[0, 0], [0.5, 0], [0.5, 1], [0, 1], [0, 0]]],
  '1': [[[0.1, 0.8], [0.25, 1], [0.25, 0]], [[0.05, 0], [0.45, 0]]],
  '2': [[[0, 1], [0.5, 1], [0.5, 0.5], [0, 0.5], [0, 0], [0.5, 0]]],
  '3': [[[0, 1], [0.5, 1], [0.5, 0], [0, 0]], [[0.1, 0.5], [0.5, 0.5]]],
  '4': [[[0, 1], [0, 0.5], [0.5, 0.5]], [[0.4, 1], [0.4, 0]]],
  '5': [[[0.5, 1], [0, 1], [0, 0.5], [0.5, 0.5], [0.5, 0], [0, 0]]],
  '6': [[[0.5, 1], [0, 1], [0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]]],
  '7': [[[0, 1], [0.5, 1], [0.2, 0]]],
  '8': [[[0, 0], [0.5, 0], [0.5, 1], [0, 1], [0, 0]], [[0, 0.5], [0.5, 0.5]]],
  '9': [[[0.5, 0.5], [0, 0.5], [0, 1], [0.5, 1], [0.5, 0], [0, 0]]],
}

/** Distance from p to segment ab, 2D (moved here from layers.ts, unchanged). */
export function segDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy
  const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / l2))
  const ex = px - ax - t * dx, ey = py - ay - t * dy
  return Math.sqrt(ex * ex + ey * ey)
}

/** Distance from (x, y), in heights from the text's lower-left, to its nearest stroke; Infinity if it has none. */
export function strokeDistance(text: string, x: number, y: number): number {
  let best = Infinity
  for (let k = 0; k < text.length; k++) {
    const gx = x - k * ADVANCE
    if (gx < -1 || gx > GLYPH_W + 1) continue // a stroke is at most half a height wide
    for (const line of GLYPHS[text[k]!] ?? []) for (let i = 1; i < line.length; i++) {
      best = Math.min(best, segDistance(gx, y, line[i - 1]![0], line[i - 1]![1], line[i]![0], line[i]![1]))
    }
  }
  return best
}

/** Total stroke length of `text`, in heights: its ink area is this x height x strokeM. */
export function strokeLength(text: string): number {
  let sum = 0
  for (const c of text) for (const line of GLYPHS[c] ?? []) for (let i = 1; i < line.length; i++) {
    sum += Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1])
  }
  return sum
}
