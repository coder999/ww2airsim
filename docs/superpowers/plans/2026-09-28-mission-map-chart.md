# Mission Map Topographic Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the mission navigation chart as a WWII Army Map Service-style topographic sheet: coastline, feet contours, green woodland / cultivation / swamp patches, faint lat/long grid, ink icons, inside the Naval Communications paper style.

**Architecture:** Pure, unit-tested modules under `src/render/mission/` sample the loaded terrain and land-cover raster onto a grid over the visible rectangle, trace iso-levels with marching squares into chained polylines, and build graticule / scale / label models. `src/render/missionMap.ts` stays the thin DOM half that turns those models into one SVG per chart open. Terrain layers are cached per (terrain object, visible area).

**Tech Stack:** TypeScript, SVG DOM, vitest (node environment — no DOM tests exist in this repo; the DOM half is verified by screenshot).

**Spec:** `docs/superpowers/specs/2026-09-28-mission-map-chart-design.md`

**Viewing checkpoints (Mark, 2026-09-28):** final product only; run unattended. Screenshots go in the handoff.

## Global Constraints

- All distances shown to the player are imperial: contours and elevation labels in feet; scale bar in nautical miles (`CLAUDE.md`).
- US spelling in prose and identifiers.
- Never push `main`, merge to `main`, or deploy. Work on branch `worktree-mission-map-icons` in `~/projects/ww2airsim-worktrees/mission-map-icons`; pushing this branch is fine.
- `src/sim/` may not import `render/`; the new files live in `src/render/` and may import `src/sim/world/*`.
- Contour interval: 50 / 100 / 200 / 500 ft by visible span; index line every 5th; never more than 40 contour levels (double the interval until it fits).
- Woodland = `tree + mangrove` fraction >= 0.5; cultivation = `crop` >= 0.5; swamp = `mangrove` >= 0.5; all masked to land (height > 0.15 m).
- Existing behavior stays: `role="dialog"`, `aria-label`, focus-on-open, Close button, Enter/Space selection on targetable markers, `labelPlacements`, `mapPoints`, `chartBounds`, `projectPoint`, `selectedPoint`, `courseLabel`.
- Run only the touched test files on nexus (`npx vitest run <files>`); the final full `npm run verify` goes through `remote-run` (`CLAUDE.md`). Capture `rc=$?` directly; never gate on a grepped pipeline.
- The worktree has a symlinked `node_modules` -> `../../ww2airsim/node_modules` (untracked; do not `git add` it).
- Commit trailer: `Co-Authored-By: Claude Code <noreply@anthropic.com>`.

## Review Focus

Inputs the spec implies but no happy-path test exercises; each has a test in the owning task.

1. **Chart with all markers at one point** (span floors at 2 km): interval and graticule must not throw or explode; graticule may legitimately show 0-2 lines. (Task 3)
2. **No terrain yet / no cover yet** (chart opened in the first seconds): paper chart with grid and markers, no land layers, no exception. (Task 4)
3. **Visible area entirely sea or entirely land:** no empty `d=""` paths; all-land yields a closed frame polygon and no coast. (Tasks 1, 4)
4. **Tall terrain / small span** would emit hundreds of contour levels: capped at 40. (Task 2)
5. **Saddle cells** (opposite corners inside) must trace as two separate arcs; the coastline code on this branch (`152fd55`) has cases 5 and 10 swapped. (Task 1)
6. **Chart hanging off the 200 km world edge:** `heightAt` reads sea outside; cover indexing clamps. Must draw blank, not garbage. (Task 4)
7. **Degenerate polylines** (2-point arcs) through smoothing and labeling. (Tasks 1, 5)

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/render/mission/chartIso.ts` (new) | `Grid`, `sampleGrid`, `padGrid`, `traceLevel` (marching squares, chained), `smoothPolyline`, `pathData` |
| `src/render/mission/chartScale.ts` (new) | feet/nautical-mile constants, `contourIntervalFt`, `contourLevels`, `scaleBar` |
| `src/render/mission/graticule.ts` (new) | `graticuleStepArcmin`, `formatLatLon`, `buildGraticule` |
| `src/render/mission/chartLayers.ts` (new) | `buildChartLayers(terrain, area)` -> land / coast / contours / woodland / crop / mangrove polylines |
| `src/render/mission/chartLabels.ts` (new) | `contourLabelSites` |
| `src/render/mission/chartStyle.ts` (new) | chart palette, SVG pattern defs, compass-rose and scale-bar SVG builders |
| `src/render/missionMap.ts` (modify) | sheet DOM, layer rendering, markers in ink; drop `coastSegments` |
| `tests/render/mission/*.test.ts` (new) | one test file per pure module |
| `tests/render/missionMap.test.ts` (modify) | remove `coastSegments` test, keep the rest |

---

### Task 1: Iso-line tracing (`chartIso.ts`)

**Files:**
- Create: `src/render/mission/chartIso.ts`
- Test: `tests/render/mission/chartIso.test.ts`

**Interfaces:**
- Produces:
  - `type Pt = readonly [x: number, z: number]`
  - `type Polyline = { readonly points: readonly Pt[]; readonly closed: boolean }`
  - `type Area = { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number }`
  - `type Grid = { cols; rows; minX; minZ; dx; dz: number; values: Float32Array }` — `(cols+1)*(rows+1)` samples, row-major, row 0 = `minZ`
  - `sampleGrid(area: Area, cols: number, fn: (x: number, z: number) => number): Grid`
  - `padGrid(grid: Grid, outside: number): Grid` — one ring of `outside` samples around the grid, extents grown by one cell each side
  - `traceLevel(grid: Grid, level: number): Polyline[]` — "inside" is `value > level`
  - `smoothPolyline(line: Polyline, iterations?: number): Polyline` — Chaikin, default 2
  - `pathData(lines: readonly Polyline[], project: (x: number, z: number) => { x: number; y: number }): string` — `''` for no lines

- [ ] **Step 1: Write the failing tests**

```ts
// tests/render/mission/chartIso.test.ts
import { describe, expect, it } from 'vitest'
import { padGrid, pathData, sampleGrid, smoothPolyline, traceLevel, type Grid } from '../../../src/render/mission/chartIso.js'

const area = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }

describe('traceLevel', () => {
  it('traces a cone as one closed loop at the right radius', () => {
    const grid = sampleGrid(area, 40, (x, z) => 10 - Math.hypot(x, z))
    const lines = traceLevel(grid, 5)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.closed).toBe(true)
    for (const [x, z] of lines[0]!.points) expect(Math.hypot(x, z)).toBeCloseTo(5, 1)
  })

  it('traces a ramp as one open line', () => {
    const grid = sampleGrid(area, 40, (x) => x)
    const lines = traceLevel(grid, 0.5)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.closed).toBe(false)
    for (const [x] of lines[0]!.points) expect(x).toBeCloseTo(0.5, 6)
  })

  it('keeps two separate blobs separate', () => {
    const grid = sampleGrid(area, 40, (x, z) => Math.max(3 - Math.hypot(x - 5, z), 3 - Math.hypot(x + 5, z)))
    expect(traceLevel(grid, 1)).toHaveLength(2)
  })

  it('traces a saddle as two arcs around the two inside corners', () => {
    const grid: Grid = { cols: 1, rows: 1, minX: 0, minZ: 0, dx: 1, dz: 1, values: Float32Array.from([1, 0, 0, 1]) }
    const lines = traceLevel(grid, 0.5)
    expect(lines).toHaveLength(2)
    const centres = lines.map((l) => [
      l.points.reduce((s, p) => s + p[0], 0) / l.points.length,
      l.points.reduce((s, p) => s + p[1], 0) / l.points.length,
    ])
    centres.sort((a, b) => a[0]! - b[0]!)
    expect(centres[0]![0]).toBeCloseTo(0.25, 6)
    expect(centres[0]![1]).toBeCloseTo(0.25, 6)
    expect(centres[1]![0]).toBeCloseTo(0.75, 6)
    expect(centres[1]![1]).toBeCloseTo(0.75, 6)
  })

  it('returns nothing for a grid that never crosses the level', () => {
    expect(traceLevel(sampleGrid(area, 10, () => -5), 0)).toEqual([])
    expect(traceLevel(sampleGrid(area, 10, () => 5), 0)).toEqual([])
  })
})

describe('padGrid', () => {
  it('closes a region that touches the frame', () => {
    const allLand = sampleGrid(area, 10, () => 5)
    const lines = traceLevel(padGrid(allLand, -1), 0)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.closed).toBe(true)
    const xs = lines[0]!.points.map((p) => p[0])
    expect(Math.min(...xs)).toBeLessThan(area.minX)
    expect(Math.max(...xs)).toBeGreaterThan(area.maxX)
  })

  it('leaves an all-sea grid empty', () => {
    expect(traceLevel(padGrid(sampleGrid(area, 10, () => -5), -1), 0)).toEqual([])
  })
})

describe('smoothPolyline', () => {
  const square: [number, number][] = [[0, 0], [4, 0], [4, 4], [0, 4]]
  it('doubles a closed loop each pass and stays closed', () => {
    const out = smoothPolyline({ points: square, closed: true }, 2)
    expect(out.points).toHaveLength(16)
    expect(out.closed).toBe(true)
  })
  it('keeps the endpoints of an open line', () => {
    const out = smoothPolyline({ points: [[0, 0], [2, 2], [4, 0]], closed: false }, 2)
    expect(out.points[0]).toEqual([0, 0])
    expect(out.points[out.points.length - 1]).toEqual([4, 0])
  })
  it('leaves a two-point arc alone', () => {
    const line = { points: [[0, 0], [1, 1]] as [number, number][], closed: false }
    expect(smoothPolyline(line, 2)).toEqual(line)
  })
})

describe('pathData', () => {
  const project = (x: number, z: number) => ({ x, y: z })
  it('writes M/L commands and Z for closed loops', () => {
    expect(pathData([{ points: [[0, 0], [1, 0], [1, 1]], closed: true }], project)).toBe('M0.0 0.0L1.0 0.0L1.0 1.0Z')
    expect(pathData([{ points: [[0, 0], [1, 0]], closed: false }], project)).toBe('M0.0 0.0L1.0 0.0')
  })
  it('is empty for no lines so callers can skip the element', () => {
    expect(pathData([], project)).toBe('')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/render/mission/chartIso.test.ts`
Expected: FAIL, cannot resolve `chartIso.js`.

- [ ] **Step 3: Implement**

```ts
// src/render/mission/chartIso.ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/render/mission/chartIso.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/render/mission/chartIso.ts tests/render/mission/chartIso.test.ts
git commit -m "Chart: marching-squares tracing into chained polylines

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 2: Scale and contour intervals (`chartScale.ts`)

**Files:**
- Create: `src/render/mission/chartScale.ts`
- Test: `tests/render/mission/chartScale.test.ts`

**Interfaces:**
- Produces:
  - `M_PER_FT = 0.3048`, `M_PER_NMI = 1852`
  - `contourIntervalFt(spanM: number): number`
  - `type ContourLevel = { levelM: number; levelFt: number; index: boolean }`
  - `contourLevels(maxHeightM: number, wantedIntervalFt: number): { intervalFt: number; levels: ContourLevel[] }` (at most 40 levels; interval doubles until it fits; `index` when `levelFt / intervalFt` is a multiple of 5)
  - `scaleBar(metersPerPixel: number, targetPx?: number): { nmi: number; px: number; label: string }`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/render/mission/chartScale.test.ts
import { describe, expect, it } from 'vitest'
import { contourIntervalFt, contourLevels, M_PER_FT, scaleBar } from '../../../src/render/mission/chartScale.js'

describe('contourIntervalFt', () => {
  it('coarsens as the chart span grows', () => {
    const spans = [2_000, 10_000, 30_000, 80_000, 200_000]
    const intervals = spans.map(contourIntervalFt)
    expect(intervals).toEqual([50, 50, 100, 200, 500])
  })
})

describe('contourLevels', () => {
  it('marks every fifth level as an index contour', () => {
    const { intervalFt, levels } = contourLevels(1_000 * M_PER_FT, 100)
    expect(intervalFt).toBe(100)
    expect(levels.map((l) => l.levelFt)).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000])
    expect(levels.filter((l) => l.index).map((l) => l.levelFt)).toEqual([500, 1000])
    expect(levels[0]!.levelM).toBeCloseTo(100 * M_PER_FT, 9)
  })

  it('has no levels when the terrain never reaches the first one', () => {
    expect(contourLevels(10, 100).levels).toEqual([])
  })

  it('caps the count by doubling the interval', () => {
    const { intervalFt, levels } = contourLevels(3_000, 50)
    expect(levels.length).toBeLessThanOrEqual(40)
    expect(intervalFt).toBe(400)
  })
})

describe('scaleBar', () => {
  it('picks a round nautical-mile length near the target width', () => {
    for (const mPerPx of [10, 25, 60, 100, 250]) {
      const bar = scaleBar(mPerPx)
      expect(bar.px).toBeGreaterThan(40)
      expect(bar.px).toBeLessThan(210)
      expect([0.25, 0.5, 1, 2, 5, 10, 20, 50]).toContain(bar.nmi)
      expect(bar.label).toContain(String(bar.nmi))
    }
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/render/mission/chartScale.test.ts` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// src/render/mission/chartScale.ts
export const M_PER_FT = 0.3048
export const M_PER_NMI = 1852

const MAX_CONTOUR_LEVELS = 40
const INDEX_EVERY = 5
const NMI_CHOICES = [0.25, 0.5, 1, 2, 5, 10, 20, 50] as const

/** Contour interval, in feet, for a chart whose visible width is `spanM`. */
export function contourIntervalFt(spanM: number): number {
  if (spanM < 12_000) return 50
  if (spanM < 40_000) return 100
  if (spanM < 90_000) return 200
  return 500
}

export type ContourLevel = { readonly levelM: number; readonly levelFt: number; readonly index: boolean }

export function contourLevels(
  maxHeightM: number,
  wantedIntervalFt: number,
): { readonly intervalFt: number; readonly levels: readonly ContourLevel[] } {
  const maxFt = maxHeightM / M_PER_FT
  let intervalFt = wantedIntervalFt
  while (Math.floor(maxFt / intervalFt) > MAX_CONTOUR_LEVELS) intervalFt *= 2
  const levels: ContourLevel[] = []
  for (let n = 1; n * intervalFt <= maxFt; n++) {
    const levelFt = n * intervalFt
    levels.push({ levelM: levelFt * M_PER_FT, levelFt, index: n % INDEX_EVERY === 0 })
  }
  return { intervalFt, levels }
}

/** The longest round nautical-mile bar that stays within 1.4x the target width. */
export function scaleBar(metersPerPixel: number, targetPx = 140): { nmi: number; px: number; label: string } {
  const px = (nmi: number): number => (nmi * M_PER_NMI) / metersPerPixel
  let chosen: number = NMI_CHOICES[0]
  for (const nmi of NMI_CHOICES) if (px(nmi) <= targetPx * 1.4) chosen = nmi
  return { nmi: chosen, px: px(chosen), label: `${chosen} NAUTICAL ${chosen === 1 ? 'MILE' : 'MILES'}` }
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/render/mission/chartScale.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/mission/chartScale.ts tests/render/mission/chartScale.test.ts
git commit -m "Chart: contour interval, level cap and scale bar

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 3: Graticule (`graticule.ts`)

**Files:**
- Create: `src/render/mission/graticule.ts`
- Test: `tests/render/mission/graticule.test.ts`

**Interfaces:**
- Consumes: `toLocal`, `toGeodetic` from `src/sim/world/projection.ts`; `Area` from `chartIso.ts`
- Produces:
  - `graticuleStepArcmin(spanM: number): number` — largest of `[1, 2, 5, 10, 30, 60]` giving >= 4 lines across, else 1
  - `formatLatLon(deg: number, axis: 'lat' | 'lon'): string` — `10°45′N`
  - `type ScreenPt = { x: number; y: number }`
  - `type GraticuleLabel = { text: string; x: number; y: number; anchor: 'end' | 'middle' }`
  - `buildGraticule(area: Area, project: (x: number, z: number) => ScreenPt, width: number, height: number): { lines: ScreenPt[][]; labels: GraticuleLabel[] }` — `area` is the visible world rectangle; lat labels sit at `x = -6` (left margin) and lon labels at `y = height + 16` (bottom margin)

- [ ] **Step 1: Write the failing tests**

```ts
// tests/render/mission/graticule.test.ts
import { describe, expect, it } from 'vitest'
import { buildGraticule, formatLatLon, graticuleStepArcmin } from '../../../src/render/mission/graticule.js'

const W = 800
const H = 520
const boxAround = (half: number) => ({ minX: -half, maxX: half, minZ: -half, maxZ: half })
const projectFor = (half: number) => (x: number, z: number) => ({
  x: ((x + half) / (2 * half)) * W,
  y: ((z + half) / (2 * half)) * H,
})

describe('formatLatLon', () => {
  it('writes degrees, minutes and hemisphere', () => {
    expect(formatLatLon(10.75, 'lat')).toBe('10°45′N')
    expect(formatLatLon(-10.75, 'lat')).toBe('10°45′S')
    expect(formatLatLon(125 + 20 / 60, 'lon')).toBe('125°20′E')
  })
})

describe('graticuleStepArcmin', () => {
  it('uses the coarsest step that still gives four lines across', () => {
    expect(graticuleStepArcmin(100_000)).toBe(10)
    expect(graticuleStepArcmin(20_000)).toBe(2)
    expect(graticuleStepArcmin(400_000)).toBe(30)
  })
  it('falls back to one minute for a tiny chart', () => {
    expect(graticuleStepArcmin(2_000)).toBe(1)
  })
})

describe('buildGraticule', () => {
  it('draws several lat and lon lines with margin labels', () => {
    const g = buildGraticule(boxAround(10_000), projectFor(10_000), W, H)
    expect(g.lines.length).toBeGreaterThanOrEqual(6)
    const lat = g.labels.filter((l) => l.text.endsWith('N'))
    const lon = g.labels.filter((l) => l.text.endsWith('E'))
    expect(lat.length).toBeGreaterThanOrEqual(3)
    expect(lon.length).toBeGreaterThanOrEqual(3)
    for (const l of lat) {
      expect(l.x).toBe(-6)
      expect(l.anchor).toBe('end')
      expect(l.y).toBeGreaterThanOrEqual(0)
      expect(l.y).toBeLessThanOrEqual(H + 4)
    }
    for (const l of lon) {
      expect(l.y).toBe(H + 16)
      expect(l.anchor).toBe('middle')
      expect(l.x).toBeGreaterThanOrEqual(0)
      expect(l.x).toBeLessThanOrEqual(W)
    }
  })

  it('survives the minimum 2 km chart without throwing', () => {
    const g = buildGraticule(boxAround(1_000), projectFor(1_000), W, H)
    expect(g.lines.length).toBeLessThanOrEqual(8)
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/render/mission/graticule.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// src/render/mission/graticule.ts
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
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/render/mission/graticule.test.ts` — Expected: PASS. If the 20 km box gives fewer than 3 lat/lon labels, print `g.labels` and check `graticuleStepArcmin` first (20 km = 10.8 nmi, so step 2' gives 5.4 lines across); do not weaken the assertion without understanding why.

- [ ] **Step 5: Commit**

```bash
git add src/render/mission/graticule.ts tests/render/mission/graticule.test.ts
git commit -m "Chart: lat/long graticule with margin labels

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 4: Terrain layers (`chartLayers.ts`)

**Files:**
- Create: `src/render/mission/chartLayers.ts`
- Test: `tests/render/mission/chartLayers.test.ts`

**Interfaces:**
- Consumes: `Area`, `Polyline`, `sampleGrid`, `padGrid`, `traceLevel`, `smoothPolyline` (Task 1); `contourIntervalFt`, `contourLevels` (Task 2); `heightAt`, `TerrainField` (`src/sim/world/terrain.ts`); `coverFractionsAt` (`src/sim/world/cover.ts`)
- Produces:
  - `LAND_THRESHOLD_M = 0.15`
  - `type ContourLayer = { levelFt: number; index: boolean; lines: readonly Polyline[] }`
  - `type ChartLayers = { land, coast, woodland, crop, mangrove: readonly Polyline[]; contours: readonly ContourLayer[]; intervalFt: number }`
  - `buildChartLayers(terrain: TerrainField | null | undefined, area: Area): ChartLayers`
  - `land` is closed loops for fill (padded grid, `fill-rule: evenodd`); `coast` is the same shoreline unpadded, so the chart frame is not drawn as coast

- [ ] **Step 1: Write the failing tests**

```ts
// tests/render/mission/chartLayers.test.ts
import { describe, expect, it } from 'vitest'
import { buildChartLayers, LAND_THRESHOLD_M } from '../../../src/render/mission/chartLayers.js'
import { parseCoverHeader } from '../../../src/sim/world/cover.js'
import { parseTerrainHeader } from '../../../src/sim/world/schema.js'
import { createTerrainField, type TerrainField } from '../../../src/sim/world/terrain.js'

const header = parseTerrainHeader({
  centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000,
  finestSamples: 8193, levels: 13, encoding: 'int16-decimetres',
})

/** Level 9 is a 17x17 grid, 12.5 km apart: a 1000 m cone of radius 5 samples in the middle. */
const cone = (): TerrainField => {
  const heights = new Int16Array(17 * 17)
  for (let r = 0; r < 17; r++) {
    for (let c = 0; c < 17; c++) heights[r * 17 + c] = Math.round(10 * 1000 * Math.max(0, 1 - Math.hypot(c - 8, r - 8) / 5))
  }
  return createTerrainField(header, 9, heights)
}

const withEastForest = (terrain: TerrainField): TerrainField => {
  const coverHeader = parseCoverHeader({
    centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000, samples: 1025,
    channels: ['tree', 'crop', 'mangrove', 'open'], encoding: 'rgba8-sixteenths',
  })
  const data = new Uint8Array(1025 * 1025 * 4)
  for (let r = 0; r < 1025; r++) for (let c = 512; c < 1025; c++) data[(r * 1025 + c) * 4] = 255
  return { ...terrain, cover: { header: coverHeader, data, firm: [] } }
}

const wide = { minX: -80_000, maxX: 80_000, minZ: -80_000, maxZ: 80_000 }

describe('buildChartLayers', () => {
  it('draws no land layers without terrain but still picks an interval', () => {
    const layers = buildChartLayers(null, wide)
    expect(layers.land).toEqual([])
    expect(layers.coast).toEqual([])
    expect(layers.contours).toEqual([])
    expect(layers.woodland).toEqual([])
    expect(layers.intervalFt).toBe(500)
  })

  it('traces an island as one land loop, a coast and nested contours', () => {
    const layers = buildChartLayers(cone(), wide)
    expect(layers.land).toHaveLength(1)
    expect(layers.land[0]!.closed).toBe(true)
    expect(layers.coast.length).toBeGreaterThanOrEqual(1)
    expect(layers.intervalFt).toBe(500)
    expect(layers.contours.map((c) => c.levelFt)).toEqual([500, 1000, 1500, 2000, 2500, 3000])
    expect(layers.contours.filter((c) => c.index).map((c) => c.levelFt)).toEqual([2500])
    for (const c of layers.contours) expect(c.lines.length).toBeGreaterThanOrEqual(1)
    expect(layers.woodland).toEqual([])
  })

  it('has no land in an all-sea view', () => {
    const away = { minX: 85_000, maxX: 99_000, minZ: 85_000, maxZ: 96_000 }
    const layers = buildChartLayers(cone(), away)
    expect(layers.land).toEqual([])
    expect(layers.coast).toEqual([])
    expect(layers.contours).toEqual([])
  })

  it('fills an inland view with one frame-sized land loop and no coast', () => {
    const inland = { minX: -3_000, maxX: 3_000, minZ: -2_000, maxZ: 2_000 }
    const layers = buildChartLayers(cone(), inland)
    expect(layers.land).toHaveLength(1)
    expect(layers.coast).toEqual([])
  })

  it('keeps woodland on land and only where the cover says trees', () => {
    const layers = buildChartLayers(withEastForest(cone()), wide)
    expect(layers.woodland.length).toBeGreaterThanOrEqual(1)
    for (const loop of layers.woodland) {
      for (const [x, z] of loop.points) {
        expect(x).toBeGreaterThan(-2_000)
        expect(Math.hypot(x, z)).toBeLessThan(65_000)
      }
    }
    expect(layers.crop).toEqual([])
    expect(layers.mangrove).toEqual([])
  })

  it('never emits more than 40 contour levels on a small chart of tall land', () => {
    const tiny = { minX: -5_000, maxX: 5_000, minZ: -3_000, maxZ: 3_000 }
    const layers = buildChartLayers(cone(), tiny)
    expect(layers.contours.length).toBeLessThanOrEqual(40)
  })

  it('reads sea for the part of a view outside the 200 km world', () => {
    const edge = { minX: 90_000, maxX: 140_000, minZ: -20_000, maxZ: 10_000 }
    const layers = buildChartLayers(cone(), edge)
    expect(layers.land).toEqual([])
  })

  it('exports the land threshold the cover threshold masks with', () => {
    expect(LAND_THRESHOLD_M).toBeGreaterThan(0)
    expect(LAND_THRESHOLD_M).toBeLessThan(0.3)
  })
})
```

Note on the cone at the inland view: the peak is exactly 1000 m and falls off with slope 200 m per 12.5 km, so ±3 km of the peak is at least 900 m, all land. The "small chart" view at ±5 km has interval 50 ft and a max near 3281 ft: 65 levels > 40 so the interval doubles to 100 (32 levels).

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/render/mission/chartLayers.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// src/render/mission/chartLayers.ts
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
```

The `- 1e-6` keeps a raster value of exactly 0.5 (not exactly representable in sixteenths: 8/15 = 0.533) inside the patch, matching the spec's "at or above".

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/render/mission/chartLayers.test.ts` — Expected: PASS. If the "tall land" test finds contour count over 40, `contourLevels` is not doubling; fix there, not here.

- [ ] **Step 5: Commit**

```bash
git add src/render/mission/chartLayers.ts tests/render/mission/chartLayers.test.ts
git commit -m "Chart: land, coast, contour and cover layers from terrain

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 5: Contour label sites (`chartLabels.ts`)

**Files:**
- Create: `src/render/mission/chartLabels.ts`
- Test: `tests/render/mission/chartLabels.test.ts`

**Interfaces:**
- Produces:
  - `type LabelLine = { text: string; points: readonly (readonly [number, number])[] }` — already in chart pixels
  - `type LabelSite = { text: string; x: number; y: number }`
  - `contourLabelSites(lines: readonly LabelLine[], minLengthPx?: number, minSpacingPx?: number): LabelSite[]` — defaults 120 and 90; the site is the point halfway along each line that is long enough and not within `minSpacingPx` of an earlier site

- [ ] **Step 1: Write the failing tests**

```ts
// tests/render/mission/chartLabels.test.ts
import { describe, expect, it } from 'vitest'
import { contourLabelSites } from '../../../src/render/mission/chartLabels.js'

const horizontal = (y: number, length: number) => ({
  text: '500',
  points: [[0, y], [length / 2, y], [length, y]] as [number, number][],
})

describe('contourLabelSites', () => {
  it('labels the middle of a long line', () => {
    const sites = contourLabelSites([horizontal(50, 400)])
    expect(sites).toHaveLength(1)
    expect(sites[0]!.x).toBeCloseTo(200, 6)
    expect(sites[0]!.y).toBe(50)
  })

  it('skips short lines and two-point arcs shorter than the minimum', () => {
    expect(contourLabelSites([horizontal(50, 30)])).toEqual([])
    expect(contourLabelSites([{ text: '500', points: [[0, 0], [10, 0]] }])).toEqual([])
  })

  it('drops a label that would sit on top of an earlier one', () => {
    const sites = contourLabelSites([horizontal(50, 400), horizontal(60, 400)])
    expect(sites).toHaveLength(1)
  })

  it('keeps labels that are far enough apart', () => {
    expect(contourLabelSites([horizontal(50, 400), horizontal(200, 400)])).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/render/mission/chartLabels.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement**

```ts
// src/render/mission/chartLabels.ts
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
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/render/mission/chartLabels.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/mission/chartLabels.ts tests/render/mission/chartLabels.test.ts
git commit -m "Chart: contour elevation label placement

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 6: Sheet, layers and ink markers in `missionMap.ts`

**Files:**
- Create: `src/render/mission/chartStyle.ts`
- Modify: `src/render/missionMap.ts` (imports, remove `CoastSegment`/`LAND_THRESHOLD_M`/`COAST_GRID_COLUMNS`/`coastSegments`, rebuild the DOM in `createMissionMap`, restyle `drawMarker`, draw layers in `draw`)
- Modify: `tests/render/missionMap.test.ts` (drop `coastSegments` import and the "traces a north-south shoreline" test; keep `visibleBounds`, `MARKER_ICONS` tests)

**Interfaces:**
- Consumes: everything from Tasks 1-5; `ensureStampFilter` not needed; existing `sectionTitle`, `figureRow` from `./ui/navalComms.js`
- Produces (`chartStyle.ts`):
  - `CHART` palette object: `{ water, waterLining, wash, woodland, woodlandEdge, cropHatch, swamp, contour }` (hex strings)
  - `PATTERN_CROP = 'chart-pat-crop'`, `PATTERN_SWAMP = 'chart-pat-swamp'`
  - `ensurePatternDefs(): void` — appends one hidden `<svg>` with both patterns to `document.body`, once (idempotent by id `chart-pattern-defs`)
  - `paint(el: SVGElement, css: Record<string, string>): void` — sets each entry via `el.style.setProperty`
- Ink/paper colors come from `naval-comms.css` variables (`var(--ink)`, `var(--paper)`, `var(--stamp-red)`, ...), set through `paint`, because `var()` is not valid in SVG presentation attributes.

This task is DOM work and has no unit tests (the repo's vitest runs in node). It is verified by typecheck, lint, the existing tests, and a screenshot (Task 8).

- [ ] **Step 1: Create `chartStyle.ts`**

```ts
// src/render/mission/chartStyle.ts
const SVG_NS = 'http://www.w3.org/2000/svg'

/** Chart-only colors. Paper, ink and stamp colors come from `naval-comms.css`. */
export const CHART = {
  water: '#cdd8d4',
  waterLining: '#9fbac4',
  wash: '#f0e8cb',
  woodland: '#7f9a5b',
  woodlandEdge: '#5b7a3f',
  cropHatch: '#8a9a5a',
  swamp: '#4f7a6a',
  contour: '#9a6a3a',
} as const

export const PATTERN_CROP = 'chart-pat-crop'
export const PATTERN_SWAMP = 'chart-pat-swamp'
const DEFS_ID = 'chart-pattern-defs'

export function paint(el: SVGElement, css: Record<string, string>): void {
  for (const [property, value] of Object.entries(css)) el.style.setProperty(property, value)
}

/**
 * The hatch and tuft fills live in one hidden document-level SVG so the chart
 * and its legend swatches (separate <svg> elements) can both reference them;
 * `url(#id)` resolves against the whole document. Idempotent.
 */
export function ensurePatternDefs(): void {
  if (document.getElementById(DEFS_ID) !== null) return
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.id = DEFS_ID
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.setAttribute('aria-hidden', 'true')
  svg.style.cssText = 'position:absolute'
  svg.innerHTML =
    `<defs>` +
    `<pattern id="${PATTERN_CROP}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<line x1="0" y1="0" x2="0" y2="6" stroke="${CHART.cropHatch}" stroke-width="1.1"/></pattern>` +
    `<pattern id="${PATTERN_SWAMP}" width="10" height="8" patternUnits="userSpaceOnUse">` +
    `<path d="M2 6V3M4 6V2M6 6V3M1 6.5H7" stroke="${CHART.swamp}" stroke-width="1" fill="none"/></pattern>` +
    `</defs>`
  document.body.appendChild(svg)
}
```

- [ ] **Step 2: Remove the old coastline from `missionMap.ts`**

Delete `CoastSegment`, `LAND_THRESHOLD_M`, `COAST_GRID_COLUMNS` and `coastSegments`, and the `heightAt`/`TerrainField` import (nothing else in the file uses them). Keep `visibleBounds` and `MARKER_ICONS`. Add imports:

```ts
import { pathData } from './mission/chartIso.js'
import { buildChartLayers, type ChartLayers } from './mission/chartLayers.js'
import { ensurePatternDefs, paint, CHART, PATTERN_CROP, PATTERN_SWAMP } from './mission/chartStyle.js'
import type { TerrainField } from '../sim/world/terrain.js'
```

(`TerrainField` is used only for the cache type below.)

In `tests/render/missionMap.test.ts` remove `coastSegments` from the import list and delete the test `'traces a north-south shoreline where land meets sea'` and the `'draws nothing without terrain or over open sea'` test (both covered, better, by `chartLayers.test.ts`). Rename the `describe` from `'the chart coastline'` to `'the chart frame'`; the `visibleBounds` and `MARKER_ICONS` tests stay. Remove now-unused imports (`createTerrainField`, `parseTerrainHeader`, and the `header`/`westLand`/`area` locals) — lint runs at zero warnings.

- [ ] **Step 3: Rebuild the sheet DOM in `createMissionMap`**

Replace the `backdrop`/`panel`/`heading`/`close`/`detail`/`svg`/`instruction` construction (everything from `const backdrop = ...` through `panel.appendChild(instruction)`, keeping `objectivesList`) with:

```ts
  ensurePatternDefs()
  const backdrop = document.createElement('div')
  backdrop.style.cssText =
    'position:fixed;inset:0;display:none;overflow-y:auto;background:rgba(8,10,14,.58);z-index:11'
  const frame = document.createElement('div')
  frame.className = 'naval-comms'
  frame.style.cssText = 'padding:24px 16px 40px'
  const panel = document.createElement('section')
  panel.className = 'sheet'
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-modal', 'true')
  panel.setAttribute('aria-label', 'Navigation chart')
  frame.appendChild(panel)
  backdrop.appendChild(frame)
  root.appendChild(backdrop)

  const letterhead = document.createElement('div')
  letterhead.className = 'letterhead'
  const letterheadText = document.createElement('div')
  letterheadText.className = 'letterhead-text'
  const kicker = document.createElement('div')
  kicker.className = 'letterhead-kicker'
  kicker.textContent = 'Theater chart — Leyte Gulf'
  const heading = document.createElement('h2')
  heading.className = 'letterhead-title'
  heading.textContent = 'Navigation Chart'
  heading.style.fontWeight = 'normal'
  letterheadText.append(kicker, heading)
  const formNumber = document.createElement('div')
  formNumber.className = 'form-number'
  formNumber.textContent = 'FORM NAV-1'
  const close = document.createElement('button')
  close.className = 'ink-button'
  close.textContent = `Close (${keyLabel(BINDINGS.toggleMissionMap[0])})`
  close.setAttribute('aria-label', 'Close navigation chart')
  close.addEventListener('click', () => options.onClose())
  letterhead.append(letterheadText, formNumber, close)
  panel.appendChild(letterhead)

  const detail = document.createElement('div')
  detail.setAttribute('aria-live', 'polite')
  detail.style.cssText = 'min-height:22px;margin:0 0 8px;color:var(--ink);font-size:14px'
  panel.appendChild(detail)

  const svg = svgElement('svg')
  svg.setAttribute('viewBox', `0 0 ${CHART_WIDTH + MARGIN_L + MARGIN_R} ${CHART_HEIGHT + MARGIN_T + MARGIN_B}`)
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', 'Navigation chart, north at the top')
  svg.setAttribute('width', '100%')
  svg.style.cssText = 'display:block;background:var(--paper-deep);border:1px solid var(--paper-edge);max-height:66vh'
  panel.appendChild(svg)

  const legend = document.createElement('div')
  legend.style.cssText =
    'display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:8px;font-size:11.5px;color:var(--ink-faint)'
  panel.appendChild(legend)

  const instruction = document.createElement('p')
  instruction.style.cssText = 'margin:8px 0 0;color:var(--ink-faint);font-size:12px'
  instruction.textContent = 'Select an airfield or carrier for course and range. North is up.'
  panel.appendChild(instruction)

  const objectivesList = document.createElement('div')
  objectivesList.setAttribute('aria-label', 'Objectives')
  objectivesList.style.cssText = 'margin-top:10px'
  panel.appendChild(objectivesList)
```

Add near the other chart constants: `const MARGIN_L = 52`, `const MARGIN_T = 14`, `const MARGIN_R = 14`, `const MARGIN_B = 30`.

In `show()`, change `backdrop.style.display = 'flex'` to `'block'`.

- [ ] **Step 4: Draw layers in `draw`**

`drawMarker` currently appends to `svg`; give it a `layer: SVGElement` parameter and append `marker`/`label` to that instead. Recolor with ink variables: replace the `color` expression and the `dot`/`body` strokes/fills so every SVG paint goes through `paint()`:

```ts
    const color =
      point.objective === 'destroy' ? 'var(--stamp-red)' :
      point.objective === 'protect' ? 'var(--stamp-violet)' :
      point.kind === 'player' ? 'var(--stamp-red)' :
      point.kind === 'airfield' ? 'var(--ink)' :
      point.kind === 'carrier' ? 'var(--stamp-blue)' : 'var(--ink-faint)'
```

Marker shapes: use `paint(body, { fill: color, stroke: selected ? 'var(--stamp-red)' : 'var(--paper)', 'stroke-width': selected ? '3' : '1.5' })` for the icon body, `paint(detailPath, { fill: 'none', stroke: 'var(--paper)', 'stroke-width': '1.5' })` for the relief, and the same for the circle dot (`stroke: var(--paper)`; selected = `var(--stamp-red)`). Remove the corresponding `setAttribute('fill'|'stroke'|'stroke-width'…)` lines so nothing is set twice. The station ring uses `paint(ring, { fill: 'none', stroke: color, 'stroke-width': ..., 'stroke-dasharray': '6 5' })`. The label:

```ts
    paint(label, {
      fill: 'var(--ink)',
      stroke: 'var(--paper)',
      'stroke-width': '3',
      'paint-order': 'stroke',
      'font-family': 'var(--font-body)',
    })
```
(drop the old `fill` attribute; keep `x`, `y`, `font-size`, `font-weight`, `pointer-events`).

Replace the head of `draw` up to the marker loop with:

```ts
  let layerCache: { terrain: TerrainField | null | undefined; key: string; layers: ChartLayers } | null = null

  const draw = <M>(world: World<M>, selectedId: string | null): void => {
    svg.replaceChildren()
    const points = mapPoints(world)
    const bounds = chartBounds(points)
    const player = points.find((point) => point.kind === 'player')!
    const selected = selectedPoint(points, selectedId)
    const project = (x: number, z: number): ChartProjection => projectPoint({ x, z }, bounds, CHART_WIDTH, CHART_HEIGHT)
    const area = visibleBounds(bounds, CHART_WIDTH, CHART_HEIGHT)
    const key = `${area.minX}|${area.maxX}|${area.minZ}|${area.maxZ}`
    if (layerCache === null || layerCache.terrain !== world.terrain || layerCache.key !== key) {
      layerCache = { terrain: world.terrain, key, layers: buildChartLayers(world.terrain, area) }
    }
    const layers = layerCache.layers

    const clip = svgElement('clipPath')
    clip.id = 'chart-clip'
    const clipRect = svgElement('rect')
    clipRect.setAttribute('width', String(CHART_WIDTH))
    clipRect.setAttribute('height', String(CHART_HEIGHT))
    clip.appendChild(clipRect)
    svg.appendChild(clip)

    const sheet = svgElement('g')
    sheet.setAttribute('transform', `translate(${MARGIN_L} ${MARGIN_T})`)
    svg.appendChild(sheet)
    const water = svgElement('rect')
    water.setAttribute('width', String(CHART_WIDTH))
    water.setAttribute('height', String(CHART_HEIGHT))
    water.setAttribute('fill', CHART.water)
    sheet.appendChild(water)
    const content = svgElement('g')
    content.setAttribute('clip-path', 'url(#chart-clip)')
    sheet.appendChild(content)

    const addPath = (lines: ChartLayers['land'], css: Record<string, string>): void => {
      const d = pathData(lines, project)
      if (d === '') return
      const path = svgElement('path')
      path.setAttribute('d', d)
      paint(path, { 'pointer-events': 'none', ...css })
      content.appendChild(path)
    }
    // Water-lining first: the land wash then covers its inland half.
    addPath(layers.coast, { fill: 'none', stroke: CHART.waterLining, 'stroke-width': '7', opacity: '0.55', 'stroke-linejoin': 'round' })
    addPath(layers.land, { fill: CHART.wash, 'fill-rule': 'evenodd' })
    addPath(layers.crop, { fill: `url(#${PATTERN_CROP})`, 'fill-rule': 'evenodd' })
    addPath(layers.woodland, { fill: CHART.woodland, 'fill-opacity': '0.5', stroke: CHART.woodlandEdge, 'stroke-width': '0.7', 'fill-rule': 'evenodd' })
    addPath(layers.mangrove, { fill: `url(#${PATTERN_SWAMP})`, 'fill-rule': 'evenodd' })
    for (const contour of layers.contours) {
      addPath(contour.lines, { fill: 'none', stroke: CHART.contour, 'stroke-width': contour.index ? '1.1' : '0.5', 'stroke-linejoin': 'round' })
    }
    addPath(layers.coast, { fill: 'none', stroke: 'var(--ink)', 'stroke-width': '1.3', 'stroke-linejoin': 'round' })
```

Then the selected-course line (existing code, appended to `content`; stroke via `paint(line, { stroke: 'var(--stamp-red)', 'stroke-width': '2.5', 'stroke-dasharray': '8 6' })`), then the markers loop passing `content` as the new `layer` argument. Remove the old `north` text element (the compass rose replaces it in Task 7). Keep the `objectivesList` code at the end unchanged.

- [ ] **Step 5: Verify**

Run:
```bash
npx tsc --noEmit
npx eslint src/render/missionMap.ts src/render/mission tests/render/missionMap.test.ts tests/render/mission --max-warnings 0
npx vitest run tests/render/missionMap.test.ts tests/render/mission
```
Expected: all clean/pass. (`grep -rn coastSegments src tests` must find nothing.)

- [ ] **Step 6: Commit**

```bash
git add src/render/mission/chartStyle.ts src/render/missionMap.ts tests/render/missionMap.test.ts
git commit -m "Mission map: paper sheet with land, contours and cover patches

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 7: Chart furniture: graticule, neatline, compass rose, scale bar, contour labels, legend

**Files:**
- Modify: `src/render/mission/chartStyle.ts` (add `compassRose`, `scaleBarGroup`)
- Modify: `src/render/missionMap.ts` (`draw`)

**Interfaces:**
- Consumes: `buildGraticule` (Task 3), `scaleBar`, `M_PER_NMI` (Task 2), `contourLabelSites` (Task 5), `layers.intervalFt`, `layers.contours`
- Produces (`chartStyle.ts`):
  - `compassRose(cx: number, cy: number): SVGElement` — four-point star with an `N` above, in ink
  - `scaleBarGroup(x: number, y: number, bar: { nmi: number; px: number; label: string }): SVGElement` — two-segment bar (ink / paper) with `0`, half and full labels and the title, on a translucent paper plate

- [ ] **Step 1: Add the builders to `chartStyle.ts`**

```ts
const el = (name: string, attrs: Record<string, string> = {}): SVGElement => {
  const node = document.createElementNS(SVG_NS, name)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
  return node
}
const text = (content: string, x: number, y: number, size: number, anchor: string): SVGElement => {
  const t = el('text', { x: String(x), y: String(y), 'font-size': String(size), 'text-anchor': anchor })
  paint(t, { fill: 'var(--ink)', 'font-family': 'var(--font-body)', 'pointer-events': 'none' })
  t.textContent = content
  return t
}

export function compassRose(cx: number, cy: number): SVGElement {
  const g = el('g', { transform: `translate(${cx} ${cy})` })
  const ring = el('circle', { r: '20', fill: 'none' })
  paint(ring, { stroke: 'var(--ink)', 'stroke-width': '1' })
  const star = el('path', { d: 'M0,-26 L4,-4 L26,0 L4,4 L0,26 L-4,4 L-26,0 L-4,-4 Z' })
  paint(star, { fill: 'var(--ink)', 'fill-opacity': '0.85' })
  const north = el('path', { d: 'M0,-26 L4,-4 L0,0 L-4,-4 Z' })
  paint(north, { fill: 'var(--paper)' })
  g.append(ring, star, north, text('N', 0, -32, 14, 'middle'))
  return g
}

export function scaleBarGroup(x: number, y: number, bar: { nmi: number; px: number; label: string }): SVGElement {
  const g = el('g', { transform: `translate(${x} ${y})` })
  const plate = el('rect', { x: '-8', y: '-16', width: String(bar.px + 16), height: '46' })
  paint(plate, { fill: 'var(--paper)', 'fill-opacity': '0.75' })
  const half = bar.px / 2
  const a = el('rect', { x: '0', y: '0', width: String(half), height: '5' })
  paint(a, { fill: 'var(--ink)', stroke: 'var(--ink)', 'stroke-width': '1' })
  const b = el('rect', { x: String(half), y: '0', width: String(half), height: '5' })
  paint(b, { fill: 'var(--paper)', stroke: 'var(--ink)', 'stroke-width': '1' })
  g.append(
    plate, a, b,
    text('0', 0, 18, 11, 'middle'),
    text(String(bar.nmi / 2), half, 18, 11, 'middle'),
    text(String(bar.nmi), bar.px, 18, 11, 'middle'),
    text(bar.label, 0, -4, 10, 'start'),
  )
  return g
}
```

- [ ] **Step 2: Wire the furniture into `draw`**

Import `buildGraticule` (from `./mission/graticule.js`), `scaleBar`, `M_PER_NMI` (from `./mission/chartScale.js`), `contourLabelSites` (from `./mission/chartLabels.js`), and `compassRose`, `scaleBarGroup` (from `./mission/chartStyle.js`).

Insert, in `draw`, after the contours and before the coast ink line (grid under coast, over land):

```ts
    const graticule = buildGraticule(area, project, CHART_WIDTH, CHART_HEIGHT)
    for (const line of graticule.lines) {
      const path = svgElement('path')
      path.setAttribute('d', line.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(''))
      paint(path, { fill: 'none', stroke: 'var(--ink)', 'stroke-width': '0.6', opacity: '0.22', 'pointer-events': 'none' })
      content.appendChild(path)
    }
```

After the markers loop (so numbers sit above the linework but below nothing important), add contour labels:

```ts
    const indexLines = layers.contours
      .filter((c) => c.index)
      .flatMap((c) => c.lines.map((line) => ({
        text: String(c.levelFt),
        points: line.points.map(([x, z]) => { const p = project(x, z); return [p.x, p.y] as [number, number] }),
      })))
    for (const site of contourLabelSites(indexLines)) {
      const t = svgElement('text')
      t.setAttribute('x', String(site.x))
      t.setAttribute('y', String(site.y))
      t.setAttribute('font-size', '10')
      t.setAttribute('text-anchor', 'middle')
      paint(t, { fill: CHART.contour, stroke: CHART.wash, 'stroke-width': '3', 'paint-order': 'stroke', 'font-family': 'var(--font-body)', 'pointer-events': 'none' })
      t.textContent = site.text
      content.appendChild(t)
    }
```

After `content` (still inside `sheet`, i.e. outside the clip so it reaches the margins): neatlines, graticule labels, compass rose and scale bar:

```ts
    const outer = svgElement('rect')
    for (const [name, value] of Object.entries({ x: '-4', y: '-4', width: String(CHART_WIDTH + 8), height: String(CHART_HEIGHT + 8) })) outer.setAttribute(name, value)
    paint(outer, { fill: 'none', stroke: 'var(--ink)', 'stroke-width': '2.2' })
    const inner = svgElement('rect')
    for (const [name, value] of Object.entries({ x: '0', y: '0', width: String(CHART_WIDTH), height: String(CHART_HEIGHT) })) inner.setAttribute(name, value)
    paint(inner, { fill: 'none', stroke: 'var(--ink)', 'stroke-width': '0.8' })
    sheet.append(outer, inner)
    for (const label of graticule.labels) {
      const t = svgElement('text')
      t.setAttribute('x', String(label.x))
      t.setAttribute('y', String(label.y))
      t.setAttribute('font-size', '10')
      t.setAttribute('text-anchor', label.anchor)
      paint(t, { fill: 'var(--ink-faint)', 'font-family': 'var(--font-body)', 'pointer-events': 'none' })
      t.textContent = label.text
      sheet.appendChild(t)
    }
    sheet.appendChild(compassRose(CHART_WIDTH - 52, 58))
    const scale = Math.min(CHART_WIDTH / (bounds.maxX - bounds.minX), CHART_HEIGHT / (bounds.maxZ - bounds.minZ))
    sheet.appendChild(scaleBarGroup(24, CHART_HEIGHT - 40, scaleBar(1 / scale)))
```

(`M_PER_NMI` import is not needed here; drop it if unused so lint stays at zero.)

Legend, rebuilt each `draw` (after the marker loop):

```ts
    legend.replaceChildren()
    const swatch = (inner: string): string =>
      `<svg width="26" height="16" viewBox="-13 -8 26 16" style="vertical-align:middle;margin-right:5px">${inner}</svg>`
    const icon = (kind: 'airfield' | 'carrier' | 'ship', fill: string): string =>
      `<g transform="scale(.6)"><path d="${MARKER_ICONS[kind].body}" fill="${fill}" stroke="#e9dfc2" stroke-width="1.5"/>` +
      `<path d="${MARKER_ICONS[kind].detail}" fill="none" stroke="#e9dfc2" stroke-width="1.5"/></g>`
    const entries: [string, string][] = [
      [swatch(icon('airfield', '#2a2620')), 'Airfield'],
      [swatch(icon('carrier', '#1f3d63')), 'Carrier'],
      [swatch(icon('ship', '#6b6252')), 'Ship'],
      [swatch(`<rect x="-11" y="-6" width="22" height="12" fill="${CHART.woodland}" fill-opacity=".5" stroke="${CHART.woodlandEdge}"/>`), 'Woodland'],
      [swatch(`<rect x="-11" y="-6" width="22" height="12" fill="url(#${PATTERN_CROP})" stroke="${CHART.cropHatch}" stroke-width=".6"/>`), 'Cultivation'],
      [swatch(`<rect x="-11" y="-6" width="22" height="12" fill="url(#${PATTERN_SWAMP})" stroke="${CHART.swamp}" stroke-width=".6"/>`), 'Swamp'],
      [swatch(`<path d="M-11 0H11" stroke="${CHART.contour}" stroke-width="1.1"/>`), `Contours ${layers.intervalFt} ft, index every ${layers.intervalFt * 5} ft`],
    ]
    for (const [glyph, name] of entries) {
      const item = document.createElement('span')
      item.innerHTML = `${glyph}${name}`
      legend.appendChild(item)
    }
```
The interpolated strings are constants and numbers we produce, not user input, so `innerHTML` is safe here.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint src/render/missionMap.ts src/render/mission --max-warnings 0 && npx vitest run tests/render/missionMap.test.ts tests/render/mission`
Expected: clean and passing.

- [ ] **Step 4: Commit**

```bash
git add src/render/mission/chartStyle.ts src/render/missionMap.ts
git commit -m "Mission map: graticule, neatline, compass rose, scale bar, legend

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Task 8: Measure, look at it, document, verify

**Files:**
- Modify: `docs/superpowers/specs/2026-09-28-mission-map-chart-design.md` (amendments, measured results)
- Verify only otherwise

- [ ] **Step 1: Measure the layer build on the real terrain**

The real level files are gitignored in the main checkout (`~/projects/ww2airsim/content/terrain/`), so run from there through a throwaway script (not committed), from the main checkout root so `loadTerrainLevel` finds the data:

```bash
cd ~/projects/ww2airsim && cat > /tmp/chart-cost.ts <<'EOF'
import { loadTerrainHeader, loadTerrainLevel } from '/home/mark/projects/ww2airsim/tools/terrain/load.js'
import { createTerrainField } from '/home/mark/projects/ww2airsim/src/sim/world/terrain.js'
import { buildChartLayers } from '/home/mark/projects/ww2airsim-worktrees/mission-map-icons/src/render/mission/chartLayers.js'
const header = loadTerrainHeader()
for (const level of [4, 2, 0]) {
  const terrain = createTerrainField(header, level, loadTerrainLevel(level, header))
  for (const half of [8_000, 30_000, 90_000]) {
    const area = { minX: -half, maxX: half, minZ: -half * 0.65, maxZ: half * 0.65 }
    const t0 = performance.now()
    const layers = buildChartLayers(terrain, area)
    const ms = performance.now() - t0
    console.log(`L${level} span ${2 * half / 1000} km: ${ms.toFixed(0)} ms, contours ${layers.contours.length}, interval ${layers.intervalFt} ft`)
  }
}
EOF
npx tsx /tmp/chart-cost.ts; echo rc=$?
```
Expected: each build under ~50 ms (the budget is "no more than one dropped frame" on chart open). If a case exceeds it, first cut contour levels or `HEIGHT_COLUMNS` for wide spans, never the coastline density; record the numbers. Delete `/tmp/chart-cost.ts` after.

- [ ] **Step 2: See it in a browser**

Serve the worktree: `npm run dev:lan` is the main checkout's slot, so use a separate dev server from the worktree on a free port (`npx vite --port 5199`; content and terrain are read from the worktree, so symlink the gitignored data if the terrain does not load: `ln -s ~/projects/ww2airsim/content/terrain/tiles content/terrain/tiles` — untracked, do not add). Open the free-flight scenario, press `P`, and screenshot with Playwright (reach the dev server by the nexus proxy-network IP, not `localhost`; see the Playwright-container memory). Check by eye and record in the spec's "Measured" section:
  - coastline, contours (index labels legible, not crowded), woodland green, cultivation hatch and swamp tufts appear where Leyte has them;
  - graticule faint, labels in the margins, compass rose and scale bar not covering markers;
  - carrier / ship / airfield icons legible on the paper; selected target reads; the course line reads;
  - Close, Enter-to-select on a marker, and focus-on-open still work;
  - which terrain level the chart got on Low and High asset quality, and whether contours look faceted on Low; whether `terrain.cover` was present at open.
Fix what looks wrong before continuing (small style tweaks are in scope; anything structural is a spec amendment and a note to Mark).

- [ ] **Step 3: Spec amendments**

In the spec, under §3 replace "and ratio" with the reason it was dropped ("no scale ratio: the chart is scaled to the viewport, so a printed ratio would be false"), and add a "Measured (2026-09-28)" section under §9 with the Step 1 numbers and the Step 2 observations. Commit:

```bash
git add docs/superpowers/specs/2026-09-28-mission-map-chart-design.md
git commit -m "Spec: record chart measurements and dropped scale ratio

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

- [ ] **Step 4: Full verification on ryzen**

From the worktree: `remote-run npm run verify; echo rc=$?` — Expected `rc=0`. A named skip for data-backed tests that need `.remote-run-data` files is expected; a failure is not. If a slow sky-noise Node test times out under shared load, re-run it alone and report it, but do not treat it as an open item.

- [ ] **Step 5: Push the branch and report**

```bash
git push -q origin worktree-mission-map-icons
git log --oneline origin/main..HEAD
```
Report to Mark: the branch, the screenshots, the measured numbers, and that merging to `main` is his call. Do not push `main`, merge, or deploy.
