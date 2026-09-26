/**
 * Piecewise-linear lookup through `[x, y]` points, x strictly increasing,
 * clamped to the end values outside the table. The content schemas validate
 * the ordering; this does not re-check it (it is on the hot path).
 *
 * The expression is `powerFractionAt`'s, moved here unchanged so the power
 * curve and the control fade share one implementation and the power curve's
 * output is bit-identical.
 */
export function piecewiseLinear(points: readonly (readonly [number, number])[], x: number): number {
  if (x <= points[0]![0]) return points[0]![1]
  const last = points[points.length - 1]!
  if (x >= last[0]) return last[1]
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i]!
    const [x0, y0] = points[i - 1]!
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
  }
  return last[1]
}
