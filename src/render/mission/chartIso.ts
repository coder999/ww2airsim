export type Pt = readonly [x: number, z: number]
export type Polyline = { readonly points: readonly Pt[]; readonly closed: boolean }
export type Area = { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }
export type Grid = {
  readonly cols: number
  readonly rows: number
  readonly minX: number
  readonly minZ: number
  readonly dx: number
  readonly dz: number
  readonly values: Float32Array
}

export function sampleGrid(area: Area, cols: number, fn: (x: number, z: number) => number): Grid {
  const rows = Math.max(1, Math.round((cols * (area.maxZ - area.minZ)) / (area.maxX - area.minX)))
  const dx = (area.maxX - area.minX) / cols
  const dz = (area.maxZ - area.minZ) / rows
  const values = new Float32Array((cols + 1) * (rows + 1))
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) values[r * (cols + 1) + c] = fn(area.minX + c * dx, area.minZ + r * dz)
  }
  return { cols, rows, minX: area.minX, minZ: area.minZ, dx, dz, values }
}

/** Surround a grid with one ring of `outside`, so every region that touches
 *  the frame traces as a closed loop (needed for fills, not for lines). */
export function padGrid(grid: Grid, outside: number): Grid {
  const cols = grid.cols + 2
  const rows = grid.rows + 2
  const values = new Float32Array((cols + 1) * (rows + 1)).fill(outside)
  for (let r = 0; r <= grid.rows; r++) {
    for (let c = 0; c <= grid.cols; c++) values[(r + 1) * (cols + 1) + (c + 1)] = grid.values[r * (grid.cols + 1) + c]!
  }
  return { cols, rows, minX: grid.minX - grid.dx, minZ: grid.minZ - grid.dz, dx: grid.dx, dz: grid.dz, values }
}

/**
 * Marching squares at `level` ("inside" is `value > level`), chained into
 * polylines. Each crossing sits on a grid edge and is shared by at most two
 * cells, so every crossing has at most two neighbors and chaining is a walk;
 * the ambiguous saddle cells therefore need no tie-break to stay consistent.
 * Lines that reach the grid boundary are open; everything else is closed.
 */
export function traceLevel(grid: Grid, level: number): Polyline[] {
  const stride = grid.cols + 1
  const v = grid.values
  const adjacency = new Map<number, number[]>()
  const link = (a: number, b: number): void => {
    const na = adjacency.get(a)
    if (na === undefined) adjacency.set(a, [b])
    else na.push(b)
    const nb = adjacency.get(b)
    if (nb === undefined) adjacency.set(b, [a])
    else nb.push(a)
  }
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      const i = r * stride + c
      const index =
        (v[i]! > level ? 8 : 0) | (v[i + 1]! > level ? 4 : 0) |
        (v[i + stride + 1]! > level ? 2 : 0) | (v[i + stride]! > level ? 1 : 0)
      // Edge keys: 2*i is the edge from sample i to i+1; 2*i+1 is from i to i+stride.
      const top = 2 * i
      const bottom = 2 * (i + stride)
      const left = 2 * i + 1
      const right = 2 * (i + 1) + 1
      switch (index) {
        case 1: case 14: link(left, bottom); break
        case 2: case 13: link(bottom, right); break
        case 3: case 12: link(left, right); break
        case 4: case 11: link(top, right); break
        case 6: case 9: link(top, bottom); break
        case 7: case 8: link(left, top); break
        case 5: link(top, right); link(left, bottom); break
        case 10: link(left, top); link(bottom, right); break
        default: break
      }
    }
  }
  const pointOf = (key: number): Pt => {
    const vertical = key % 2 === 1
    const i = (key - (vertical ? 1 : 0)) / 2
    const c = i % stride
    const r = Math.floor(i / stride)
    const a = v[i]!
    const b = v[vertical ? i + stride : i + 1]!
    const t = (level - a) / (b - a)
    return vertical
      ? [grid.minX + c * grid.dx, grid.minZ + (r + t) * grid.dz]
      : [grid.minX + (c + t) * grid.dx, grid.minZ + r * grid.dz]
  }
  const visited = new Set<number>()
  const out: Polyline[] = []
  const walk = (start: number, closed: boolean): void => {
    const keys = [start]
    visited.add(start)
    let previous = -1
    let current = start
    for (;;) {
      const next = (adjacency.get(current) ?? []).find((k) => k !== previous && !visited.has(k))
      if (next === undefined) break
      keys.push(next)
      visited.add(next)
      previous = current
      current = next
    }
    out.push({ points: keys.map(pointOf), closed })
  }
  for (const [key, neighbors] of adjacency) if (neighbors.length === 1 && !visited.has(key)) walk(key, false)
  for (const key of adjacency.keys()) if (!visited.has(key)) walk(key, true)
  return out
}

/** Chaikin corner cutting. Two-point arcs are returned untouched. */
export function smoothPolyline(line: Polyline, iterations = 2): Polyline {
  if (line.points.length < 3) return line
  let points = line.points
  for (let n = 0; n < iterations; n++) {
    const next: Pt[] = []
    const last = line.closed ? points.length : points.length - 1
    if (!line.closed) next.push(points[0]!)
    for (let i = 0; i < last; i++) {
      const a = points[i]!
      const b = points[(i + 1) % points.length]!
      next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]])
      next.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]])
    }
    if (!line.closed) next.push(points[points.length - 1]!)
    points = next
  }
  return { points, closed: line.closed }
}

export function pathData(
  lines: readonly Polyline[],
  project: (x: number, z: number) => { readonly x: number; readonly y: number },
): string {
  let d = ''
  for (const line of lines) {
    line.points.forEach(([x, z], i) => {
      const p = project(x, z)
      d += `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`
    })
    if (line.closed) d += 'Z'
  }
  return d
}
