# Plan 13c: Rebuild the DEM Coast from ESA WorldCover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the shoreline in the DEM so the simulation and the picture agree on where the water is, and so the coast stops being a 390 m staircase of the Copernicus grid's zero-elevation cells.

**Architecture:** One new offline step. `tools/landcover/sea.ts` flood-fills WorldCover's water class inward from the box boundary at the tiles' 20 m overview, so open sea is distinguished from Lake Danao; `tools/terrain/coast.ts` applies a three-row rule per finest-grid sample; `tools/terrain/build.ts` calls it between `resample` and `buildPyramid`, so the change propagates into every mip with no other terrain code touched. Nothing in `src/` changes.

**Tech Stack:** TypeScript strict, vitest, `geotiff` (devDependency, already used by both builds), node `zlib`, Playwright Tier 2 on the Windows reference desktop.

**Spec:** `docs/superpowers/specs/2026-09-18-land-cover-design.md` §6 (the rule, the fallout table and what 13c explicitly does not do), with §2 for the class mapping. 13d (places) is a separate plan; do not start it here.

**Why now (measured 2026-09-18, not assumed):** `content/terrain/L4.bin` is 513×513 over the 200 km box — **390.6 m per sample** — and the terrain discards every fragment with `h <= 0` (`src/render/terrain/mesh.ts`). A probe of the committed L4 found contiguous exact-zero runs of **5–10 km** along the Leyte beaches, which is why the waterline reads as rectangular blocks with the ocean showing through them. A renderer-side fix was tried and reverted (`b861ffc`, reverted in `274a92f`) because rings 0–3 already read L4 — see that revert's message. The shoreline has to move in the data.

## Global Constraints

- **Served working copy, on `main`, in place.** No worktrees, no branches (`~/projects/CLAUDE.md`, "Served site repos"). Stage by explicit path; never `git add -A` or `git add .`. Re-run `git diff --stat` right before every commit.
- **Runtime uses only bundled data.** No network at runtime, no `src/` file importing from `tools/`. This plan changes **no file under `src/`**; if a task seems to need one, stop and report.
- **The rule**, per finest-grid sample (24.4 m), with `w` the sea fraction of its pixels and `h` the DEM height:

  | Condition | Result |
  | --- | --- |
  | `w >= 0.5` | 0 (sea) |
  | `w < 0.5` and `h > 0` | `h`, unchanged |
  | `w < 0.5` and `h <= 0` | `0.3 + 1.5 × (1 − w)` metres — about 1.05 m at the waterline, 1.8 m inland |

- **No negative height is ever written.** `tests/tools/terrainBuild.test.ts`'s anti-mirror argument rests on "L4 holds no negative values", and the ocean's `Math.min(0, …)` depth clamp assumes it.
- **Heights are stored in DECIMETRES** as `Int16Array` (`tools/terrain/resample.ts`). The third row is therefore `Math.round(10 * (0.3 + 1.5 * (1 - w)))` = 3 to 18 decimetres. `DECIMETRE_LIMIT` is 3276.7 m.
- **Sea connectivity, not water class.** Only WorldCover class `80` (water) and class `0` (no-data, open ocean beyond coverage) are floodable, and only pixels reached from the box boundary count as sea. Setting inland water to sea level would dig Lake Danao (~600 m) into a 600 m hole.
- **1944 correction unchanged:** class 50 (built-up) counts as cropland in the 13b raster. 13c alters no class mapping.
- **Grid conventions:** row 0 = north (z = −half), column 0 = west (x = −half); the world is right-handed with +x east, +y up, **+z south**. `GRID` is `{ samples: 8193, halfExtentM: 100000 }`.
- **Never widen a numeric tolerance to pass; re-measure and record.** GPU frame-time p95 must stay under 6.0 ms (13b measured 5.177 ms).
- `npm run verify` must exit 0 before every commit. **Check the exit code with `echo "rc=$?"`, never grep output** — a grep'd pipeline reports grep's status.
- **Commit messages** are an imperative sentence explaining why, in the style of `git log --oneline -15`.
- **US spelling in new prose.** Existing British-spelled identifiers and JSON keys (`centreLatDeg` and siblings) are deliberate — do not rename them.
- `git clean -fdx` destroys 275 MB of cached terrain and land-cover source data. Never run it.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `tools/landcover/sea.ts` (create) | Reads the tiles' 20 m overview over the box, flood-fills class 80 + no-data from the boundary, answers the sea fraction of a lat/lon rectangle. The only file that knows what "sea" means. |
| `tools/terrain/coast.ts` (create) | The three-row rule as a pure function over the finest grid. Knows nothing about GeoTIFFs. |
| `tools/terrain/build.ts` (modify) | Calls `reshapeCoast` between `resample` and `buildPyramid`. |
| `tests/tools/landcoverSea.test.ts` (create) | Flood fill on synthetic rasters: enclosed lake stays land, boundary ocean becomes sea. |
| `tests/tools/terrainCoast.test.ts` (create) | The rule on a synthetic grid, including the no-negative invariant. |
| `tests/tools/terrainBuild.test.ts` (modify) | Regenerated `COMMITTED_SHA256`; landmark sign assertions re-checked. |
| `tests/render/terrainLod.test.ts`, `tests/render/spawn.test.ts`, `tests/render/runway.test.ts`, `tests/render/ocean/mesh.test.ts` (modify) | Re-recorded numbers that read committed heights. |
| `tests/sim/testcards/*`, `tests/sim/landing.test.ts` (re-run) | Expected unchanged; they touch only the strip. |
| `docs/handoff/2026-09-18-plan13c-coast.md` (create) | Dated record with the Tier 2 numbers and the before/after screenshots. |
| `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (modify) | The 13c row of the §15 table. |

---

## Task 1: Sea connectivity from the boundary

**Files:**
- Create: `tools/landcover/sea.ts`
- Test: `tests/tools/landcoverSea.test.ts`

**Interfaces:**
- Consumes: `LatLonBox`, `COVER_BOX` from `tools/landcover/fetch.js`; `CLASS` from `tools/landcover/sample.js`.
- Produces: `floodSeaFromBoundary(classes: Uint8Array, width: number, height: number): Uint8Array` (1 = sea, 0 = not), `openSeaMask(paths: readonly string[], box: LatLonBox): Promise<SeaMask>`, `type SeaMask = { seaFraction(box: LatLonBox): number }`, `OVERVIEW_METRES = 20`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/tools/landcoverSea.test.ts
import { describe, expect, it } from 'vitest'
import { floodSeaFromBoundary } from '../../tools/landcover/sea.js'

const W = 80, C = 0, L = 30 // water, no-data, grass

/** Build a w x h class raster from rows of single-letter codes. */
const raster = (rows: readonly string[]): Uint8Array => {
  const out = new Uint8Array(rows.length * rows[0]!.length)
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    out[r * rows[0]!.length + c] = ch === 'w' ? W : ch === '.' ? C : L
  }))
  return out
}

describe('floodSeaFromBoundary', () => {
  it('marks water connected to the boundary as sea', () => {
    const rows = ['wwwww', 'wgggw', 'wgggw', 'wwwww']
    const sea = floodSeaFromBoundary(raster(rows), 5, 4)
    expect(sea[0]).toBe(1)              // corner ocean
    expect(sea[1 * 5 + 1]).toBe(0)      // land
  })

  it('leaves an enclosed lake as land, which is why Lake Danao survives', () => {
    // A water cell ringed by land, not reachable from the boundary.
    const rows = ['wwwww', 'wgggw', 'wgwgw', 'wgggw', 'wwwww']
    const sea = floodSeaFromBoundary(raster(rows), 5, 5)
    expect(sea[2 * 5 + 2]).toBe(0)      // the lake
    expect(sea[0]).toBe(1)              // the ocean
  })

  it('floods through no-data, which is open ocean beyond coverage', () => {
    const rows = ['..www', 'wgggw', 'wwwww']
    const sea = floodSeaFromBoundary(raster(rows), 5, 3)
    expect(sea[0]).toBe(1)
    expect(sea[2]).toBe(1)
  })

  it('does not leak through a land isthmus', () => {
    const rows = ['wwgww', 'wwgww', 'ggggg', 'wwgww']
    const sea = floodSeaFromBoundary(raster(rows), 5, 4)
    expect(sea[0]).toBe(1)              // north-west sea
    expect(sea[3 * 5 + 0]).toBe(1)      // south-west sea, reached round the edge
    expect(sea[2 * 5 + 2]).toBe(0)      // the isthmus itself
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/landcoverSea.test.ts`
Expected: FAIL on the missing module.

- [ ] **Step 3: Write the flood fill and the mask**

```ts
// tools/landcover/sea.ts
import { fromFile } from 'geotiff'
import { CLASS } from './sample.js'
import type { LatLonBox } from './fetch.js'

/** WorldCover ships COG overviews; 20 m is one level below the 10 m base.
 *  The box is 200 km square, so the stitched mask is about 10,000 square —
 *  100 MB as a Uint8Array, which node holds without complaint. */
export const OVERVIEW_METRES = 20

/** No-data. Beyond the tiles' coverage the product writes 0, and everything
 *  beyond coverage in this box is open ocean. */
const NO_DATA = 0

/** Sea is CONNECTED water, not the water class: WorldCover calls Lake Danao
 *  (about 600 m up) and every river `water`, and setting those to sea level
 *  would dig a 600 m hole and hand the simulation a lake it thinks is ocean.
 *  Design spec §6, "Sea-connectivity first". Four-connected, from every
 *  boundary pixel inward, over an explicit queue rather than recursion —
 *  10,000² would blow the stack. */
export function floodSeaFromBoundary(classes: Uint8Array, width: number, height: number): Uint8Array {
  const sea = new Uint8Array(width * height)
  const floodable = (i: number): boolean => classes[i] === CLASS.water || classes[i] === NO_DATA
  // Int32Array ring buffer: one slot per pixel is enough, since a pixel is
  // enqueued only on the transition 0 -> 1.
  const queue = new Int32Array(width * height)
  let head = 0, tail = 0
  const push = (i: number): void => {
    if (sea[i] === 1 || !floodable(i)) return
    sea[i] = 1
    queue[tail++] = i
  }
  for (let x = 0; x < width; x++) {
    push(x)
    push((height - 1) * width + x)
  }
  for (let y = 0; y < height; y++) {
    push(y * width)
    push(y * width + width - 1)
  }
  while (head < tail) {
    const i = queue[head++]!
    const x = i % width
    const y = (i - x) / width
    if (x > 0) push(i - 1)
    if (x < width - 1) push(i + 1)
    if (y > 0) push(i - width)
    if (y < height - 1) push(i + width)
  }
  return sea
}

export type SeaMask = {
  /** Fraction of the rectangle's pixels that are connected sea, 0..1. */
  seaFraction(box: LatLonBox): number
}

/** Pixels per degree at the overview resolution. WorldCover tiles are 3° of
 *  latitude at 12,000 px/deg at 10 m, so 6,000 px/deg at 20 m. */
const PIXELS_PER_DEGREE = 6_000

export async function openSeaMask(paths: readonly string[], box: LatLonBox): Promise<SeaMask> {
  const north = Math.ceil(box.latMax * PIXELS_PER_DEGREE) / PIXELS_PER_DEGREE
  const west = Math.floor(box.lonMin * PIXELS_PER_DEGREE) / PIXELS_PER_DEGREE
  const width = Math.ceil((box.lonMax - west) * PIXELS_PER_DEGREE)
  const height = Math.ceil((north - box.latMin) * PIXELS_PER_DEGREE)
  const classes = new Uint8Array(width * height)

  for (const path of paths) {
    const tiff = await fromFile(path)
    // Index 0 is the 10 m base; the first overview is 20 m. Assert rather
    // than assume: a product without overviews must fail loudly here, not
    // silently read the base and use four times the memory.
    const count = await tiff.getImageCount()
    if (count < 2) throw new Error(`${path} has ${count} image(s); expected a base plus overviews`)
    const image = await tiff.getImage(1)
    const [originLon, originLat] = image.getOrigin() as [number, number]
    const w = image.getWidth(), h = image.getHeight()
    const degreesPerPixel = 1 / PIXELS_PER_DEGREE
    const raster = await image.readRasters({ interleave: true })
    const data = raster as unknown as Uint8Array
    for (let r = 0; r < h; r++) {
      const lat = originLat - (r + 0.5) * degreesPerPixel
      const destRow = Math.floor((north - lat) * PIXELS_PER_DEGREE)
      if (destRow < 0 || destRow >= height) continue
      for (let c = 0; c < w; c++) {
        const lon = originLon + (c + 0.5) * degreesPerPixel
        const destCol = Math.floor((lon - west) * PIXELS_PER_DEGREE)
        if (destCol < 0 || destCol >= width) continue
        classes[destRow * width + destCol] = data[r * w + c]!
      }
    }
  }

  const sea = floodSeaFromBoundary(classes, width, height)

  return {
    seaFraction(rect: LatLonBox): number {
      const rowMin = Math.max(0, Math.floor((north - rect.latMax) * PIXELS_PER_DEGREE))
      const rowMax = Math.min(height - 1, Math.ceil((north - rect.latMin) * PIXELS_PER_DEGREE))
      const colMin = Math.max(0, Math.floor((rect.lonMin - west) * PIXELS_PER_DEGREE))
      const colMax = Math.min(width - 1, Math.ceil((rect.lonMax - west) * PIXELS_PER_DEGREE))
      if (rowMax < rowMin || colMax < colMin) return 1
      let total = 0, wet = 0
      for (let r = rowMin; r <= rowMax; r++) {
        for (let c = colMin; c <= colMax; c++) {
          total++
          wet += sea[r * width + c]!
        }
      }
      return total === 0 ? 1 : wet / total
    },
  }
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run tests/tools/landcoverSea.test.ts && npx tsc --noEmit && npm run lint`
Expected: 4 passed; exit 0 everywhere.

- [ ] **Step 5: Confirm the overview assumption against the real tiles**

Run:

```sh
npx tsx -e "
import { fromFile } from 'geotiff'
const t = await fromFile('tools/landcover/cache/ESA_WorldCover_10m_2021_v200_N09E123_Map.tif')
const n = await t.getImageCount()
console.log('images:', n)
for (let i = 0; i < n; i++) {
  const im = await t.getImage(i)
  console.log(i, im.getWidth(), 'x', im.getHeight())
}
"
```

Expected: at least 2 images, with image 1 about half the base's width and height. **If the product has no overviews, stop and report** — the fallback is to read the 10 m base and decimate by 2 while stitching, which is a different amount of memory and deserves a ruling rather than an improvisation.

- [ ] **Step 6: Commit**

```bash
git add tools/landcover/sea.ts tests/tools/landcoverSea.test.ts
git commit -m "Tell the open sea from a mountain lake before either can move the coast"
```

---

## Task 2: The coast rule

**Files:**
- Create: `tools/terrain/coast.ts`
- Test: `tests/tools/terrainCoast.test.ts`

**Interfaces:**
- Consumes: `GRID`, `GridSpec` from `tools/terrain/resample.js`.
- Produces: `reshapeCoast(finest: Int16Array, seaFractionAt: (col: number, row: number) => number, grid?: GridSpec): Int16Array`, `SHORE_BASE_DM = 3`, `SHORE_RISE_DM = 15`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/tools/terrainCoast.test.ts
import { describe, expect, it } from 'vitest'
import { reshapeCoast, SHORE_BASE_DM, SHORE_RISE_DM } from '../../tools/terrain/coast.js'

const grid = { samples: 3, halfExtentM: 100 }

describe('reshapeCoast', () => {
  it('flattens a majority-sea cell to zero whatever the DEM said', () => {
    const out = reshapeCoast(Int16Array.from([50, 0, 0, 0, 0, 0, 0, 0, 0]), () => 0.5, grid)
    expect(out[0]).toBe(0)
  })

  it('leaves land above sea level exactly alone', () => {
    const out = reshapeCoast(Int16Array.from([9150, 0, 0, 0, 0, 0, 0, 0, 0]), () => 0, grid)
    expect(out[0]).toBe(9150)
  })

  it('lifts the DEM zero-elevation land the ocean used to draw over', () => {
    // w = 0 is fully dry: 0.3 + 1.5 = 1.8 m = 18 dm.
    expect(reshapeCoast(new Int16Array(9), () => 0, grid)[0]).toBe(SHORE_BASE_DM + SHORE_RISE_DM)
    // w just under the half: 0.3 + 1.5*0.5 = 1.05 m -> 11 dm (rounded).
    expect(reshapeCoast(new Int16Array(9), () => 0.49, grid)[0]).toBe(11)
  })

  it('never writes a negative height, which the anti-mirror argument rests on', () => {
    const finest = Int16Array.from([-120, -5, 0, 40, 0, 0, 0, 0, 0])
    const out = reshapeCoast(finest, (col) => (col === 0 ? 0.9 : 0), grid)
    expect([...out].every((h) => h >= 0)).toBe(true)
  })

  it('passes the sea fraction its own column and row, not a flipped pair', () => {
    // Only (col 2, row 0) is sea. A transposed call would zero (0, 2).
    const finest = Int16Array.from([70, 70, 70, 70, 70, 70, 70, 70, 70])
    const out = reshapeCoast(finest, (col, row) => (col === 2 && row === 0 ? 1 : 0), grid)
    expect(out[2]).toBe(0)
    expect(out[2 * 3 + 0]).toBe(70)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/terrainCoast.test.ts`
Expected: FAIL on the missing module.

- [ ] **Step 3: Write the rule**

```ts
// tools/terrain/coast.ts
import { GRID, type GridSpec } from './resample.js'

/** The waterline itself, in decimetres: 0.3 m. */
export const SHORE_BASE_DM = 3
/** How much higher a fully dry cell sits than the waterline: 1.5 m. */
export const SHORE_RISE_DM = 15

/**
 * Move the shoreline into the DEM, per design spec §6.
 *
 * Copernicus quantises coastal land to exactly 0, and the renderer discards
 * `h <= 0` as sea (`src/render/terrain/mesh.ts`), so a 5-10 km run of real
 * beach is drawn as ocean — measured on the committed L4, 2026-09-18. This
 * rewrites those cells to a low shore INSIDE the existing 0.4-2.3 m beach
 * band in `terrainSurfaceNode`, so it still reads as sand rather than as a
 * new green step.
 *
 * Runs on the finest grid before `buildPyramid`, so every mip inherits it and
 * no other terrain code changes.
 *
 * `seaFractionAt` is a function of (col, row) rather than a mask object so
 * this stays a pure rule that a synthetic test can drive without a GeoTIFF.
 */
export function reshapeCoast(
  finest: Int16Array,
  seaFractionAt: (col: number, row: number) => number,
  grid: GridSpec = GRID,
): Int16Array {
  const out = new Int16Array(finest.length)
  for (let row = 0; row < grid.samples; row++) {
    for (let col = 0; col < grid.samples; col++) {
      const i = row * grid.samples + col
      const h = finest[i]!
      const w = seaFractionAt(col, row)
      if (w >= 0.5) {
        out[i] = 0
      } else if (h > 0) {
        out[i] = h
      } else {
        // 0.3 + 1.5 * (1 - w) metres. Never negative, by construction.
        out[i] = Math.round(SHORE_BASE_DM + SHORE_RISE_DM * (1 - w))
      }
    }
  }
  return out
}
```

- [ ] **Step 4: Run the tests and the type check**

Run: `npx vitest run tests/tools/terrainCoast.test.ts && npx tsc --noEmit && npm run lint`
Expected: 5 passed; exit 0 everywhere.

- [ ] **Step 5: Commit**

```bash
git add tools/terrain/coast.ts tests/tools/terrainCoast.test.ts
git commit -m "State the coast rule as a pure function so a synthetic grid can prove it"
```

---

## Task 3: Wire it into the build and regenerate the committed terrain

**Files:**
- Modify: `tools/terrain/build.ts` (the `const finest = resample(sample)` line, ~:172), `tests/tools/terrainBuild.test.ts` (`COMMITTED_SHA256` at :127)
- Regenerate: `content/terrain/L4.bin` … `L12.bin`, `content/terrain/header.json`

**Interfaces:**
- Consumes: `openSeaMask` (Task 1), `reshapeCoast` (Task 2), `COVER_BOX`/`ensureAllTiles` from `tools/landcover/fetch.js`, `gridToLocal` from `tools/terrain/resample.js`, `toGeodetic` from `src/sim/world/projection.js`.

- [ ] **Step 1: Wire the hook**

In `tools/terrain/build.ts`, add imports:

```ts
import { ensureAllTiles as ensureCoverTiles, COVER_BOX } from '../landcover/fetch.js'
import { openSeaMask } from '../landcover/sea.js'
import { reshapeCoast } from './coast.js'
import { toGeodetic } from '../../src/sim/world/projection.js'
```

Replace `const finest = resample(sample)` and the log line after it with:

```ts
  const resampleStarted = process.hrtime.bigint()
  const resampled = resample(sample)
  console.log(`resampled ${GRID.samples}x${GRID.samples} in ${secondsSince(resampleStarted)} s`)

  // Plan 13c. The coast moves here, once, offline: between the sampled grid
  // and the mips, so every level inherits one shoreline and no renderer code
  // has to agree with a second one. Design spec §6.
  const coastStarted = process.hrtime.bigint()
  const coverPaths = await ensureCoverTiles()
  const seaMask = await openSeaMask(coverPaths, COVER_BOX)
  const halfCellM = GRID.halfExtentM / (GRID.samples - 1)
  const finest = reshapeCoast(resampled, (col, row) => {
    const { x, z } = gridToLocal(col, row)
    const nw = toGeodetic(x - halfCellM, z - halfCellM)
    const se = toGeodetic(x + halfCellM, z + halfCellM)
    return seaMask.seaFraction({
      latMin: Math.min(nw.latDeg, se.latDeg), latMax: Math.max(nw.latDeg, se.latDeg),
      lonMin: Math.min(nw.lonDeg, se.lonDeg), lonMax: Math.max(nw.lonDeg, se.lonDeg),
    })
  })
  console.log(`coast reshaped in ${secondsSince(coastStarted)} s`)
```

Add `gridToLocal` to the existing `./resample.js` import.

- [ ] **Step 2: Rebuild the terrain**

Run: `npm run terrain:build`
Expected: exit 0, with a `coast reshaped in N s` line. This rebuilds `content/terrain/L4..L12.bin` and the 171 MB of gitignored `content/terrain/tiles/`. Expect minutes, not seconds.

If it exceeds ten minutes, the per-cell `seaFraction` call is the suspect — 67 M cells each scanning a handful of overview pixels. Report the timing rather than optimising speculatively.

- [ ] **Step 3: Check the coast moved, and moved the right way**

Run:

```sh
npx tsx -e "
import { readFileSync } from 'node:fs'
import { toLocal } from './src/sim/world/projection.ts'
const h = new Int16Array(readFileSync('content/terrain/L4.bin').buffer)
const n = Math.round(Math.sqrt(h.length)), half = 100000, step = 2*half/(n-1)
const at = (lat, lon) => { const p = toLocal(lat, lon)
  return h[Math.round((p.z+half)/step)*n + Math.round((p.x+half)/step)] / 10 }
console.log('Tacloban airfield 11.228,125.028 ->', at(11.228, 125.028), 'm (land, was 1.673)')
console.log('Leyte Gulf       10.75,125.25    ->', at(10.75, 125.25), 'm (sea, must be 0)')
console.log('Mt Nacolod       10.450846,125.096068 ->', at(10.450846, 125.096068), 'm (inland, ~915-1007)')
console.log('Surigao Strait   10.167,125.383  ->', at(10.167, 125.383), 'm (sea, must be 0)')
console.log('negatives:', [...h].filter(v => v < 0).length, '(must be 0)')
const zero = [...h].filter(v => v === 0).length
console.log('exact zeros:', zero, '=', (100*zero/h.length).toFixed(1) + '% (was 63.6%)')
"
```

Expected: both sea points exactly 0; Nacolod unchanged in the 915–1007 m band; **zero negatives**; the exact-zero share *falls*, because zero-elevation land became a low shore while open sea stayed 0. Record the numbers — they go in the handoff.

- [ ] **Step 4: Regenerate the committed digests**

Run: `sha256sum content/terrain/header.json content/terrain/L*.bin`
Paste each into `COMMITTED_SHA256` in `tests/tools/terrainBuild.test.ts:127`, replacing the old values. Change nothing else in that object's shape.

- [ ] **Step 5: Run the terrain build tests**

Run: `npx vitest run tests/tools/terrainBuild.test.ts && echo "rc=$?"`
Expected: PASS, including the four landmark sign assertions at :39–70, which are asserted to be unchanged by this plan. **If a sign assertion fails, stop and report** — that is the mirrored-grid alarm, not a number to re-record.

- [ ] **Step 6: Commit**

```bash
git add tools/terrain/build.ts tests/tools/terrainBuild.test.ts content/terrain/header.json content/terrain/L4.bin content/terrain/L5.bin content/terrain/L6.bin content/terrain/L7.bin content/terrain/L8.bin content/terrain/L9.bin content/terrain/L10.bin content/terrain/L11.bin content/terrain/L12.bin
git commit -m "Move the shoreline into the DEM so the sea stops drawing over the beach"
```

---

## Task 4: Re-record the renderer numbers that read committed heights

**Files:**
- Modify: `tests/render/terrainLod.test.ts`, `tests/render/spawn.test.ts`, `tests/render/runway.test.ts`, `tests/render/ocean/mesh.test.ts`

**Interfaces:** none new. This task only reconciles pinned numbers with the rebuilt data.

- [ ] **Step 1: Find what broke**

Run: `npx vitest run tests/render 2>&1 | tail -40; echo "rc=$?"`
Expected: a small number of failures, each a pinned height or LOD error that moved. Write down every failing expectation and its actual value before changing anything.

- [ ] **Step 2: Judge each failure before touching it**

For each failure, decide which of these it is, and record the decision in the commit message:

- **A height at the Tacloban strip moved.** The spec expects it NOT to: "the strip is land in both datasets" (§6 fallout table), and `w` there should be ~0 with `h > 0`, so the rule's second row applies and the height is unchanged. **If the strip's ground height moved at all, stop and report** — it means the sea mask is wet where it should be dry.
- **A per-ring LOD worst error moved.** Expected and fine: re-record the number. The spec's prediction is that a shore changing by under 2 m cannot move a ring's worst error by a quantisation step; if it did, record the new value and note that the prediction was wrong.
- **An ocean mesh land-weight expectation moved.** Expected: the ocean reads terrain height, so a shore that rose from 0 to ~1 m changes `landWeightFromTerrain` there from 1 to about 0.4. Re-record.

- [ ] **Step 3: Re-record, one file at a time**

Update only the numeric expectations that moved. **Do not widen a tolerance, and do not delete an assertion.** Each changed number gets a trailing comment in the form already used in these files: `// re-measured 2026-09-18, Plan 13c`.

- [ ] **Step 4: Run the full suite**

Run: `npm run verify; echo "rc=$?"`
Expected: rc=0.

- [ ] **Step 5: Commit**

```bash
git add tests/render/terrainLod.test.ts tests/render/spawn.test.ts tests/render/runway.test.ts tests/render/ocean/mesh.test.ts
git commit -m "Re-record the heights and LOD errors the rebuilt coast moved"
```

---

## Task 5: Re-run the flight cards against the new ground

**Files:**
- Re-run (modify only if a number genuinely moved): `tests/sim/testcards/*`, `tests/sim/landing.test.ts`

**Interfaces:** none new.

- [ ] **Step 1: Run the sim suite**

Run: `npx vitest run tests/sim; echo "rc=$?"`
Expected: rc=0 with nothing changed. The cards take off from and land on the Tacloban strip, which Task 4 Step 2 has already established is untouched by the rule.

- [ ] **Step 2: If anything failed, diagnose before editing**

A failing card means the ground under the strip or the approach moved. That contradicts the spec's fallout table, so it is a finding, not a number to re-record. **Report it** with the failing card, the expected and actual values, and the ground height at the point the card touches. Do not adjust a card to match new behaviour without a recorded ruling.

- [ ] **Step 3: Commit only if something changed**

If the suite passed untouched, skip the commit and say so in the task report — a commit that changes nothing is noise. If a number did move and was ruled on:

```bash
git add tests/sim
git commit -m "Re-record the one card the rebuilt coast moved, with the ruling in the message"
```

---

## Task 6: Look at it, measure it, hand off

**Files:**
- Create: `docs/handoff/2026-09-18-plan13c-coast.md`
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (the 13c row of the §15 table), `docs/superpowers/plans/2026-09-18-coast-rebuild.md` (tick every box)

**Interfaces:** none.

- [ ] **Step 1: Verify locally**

Run: `npm run verify && npm run build; echo "rc=$?"`
Expected: rc=0 for both.

- [ ] **Step 2: Tier 2 on the reference desktop**

The Windows Playwright server must be running in Mark's console session. On nexus, with `npm run dev:lan` serving this checkout and the control tunnel up (`ss -ltn | grep 39001`, else `ssh -N -L 39001:127.0.0.1:3000 ryzen &`):

```sh
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org npm run test:tier2 2>&1 | tee /tmp/tier2-13c.log
grep -E 'frame-time budget:|passed|failed' /tmp/tier2-13c.log
```

Expected: all passed, or one `net::ERR_QUIC_PROTOCOL_ERROR` at `page.goto` that passes on re-run. Record the `frame-time budget:` line. It must stay under 6.0 ms p95 — 13b measured p50 4.981 / p95 5.177 ms, and this plan adds no per-fragment work, so expect no change. If it moved, say why before accepting it.

- [ ] **Step 3: Look at the coast, at the place the report came from**

Write a throwaway spec (delete it after; never commit it):

```ts
// tests/e2e/zz-look.spec.ts
import { test } from '@playwright/test'
import { waitForTerrain } from './harness.js'
test('13c coast', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  for (const [name, url] of [
    ['shore-mid', '/?spawnX=-26000&spawnY=1800&spawnZ=-52000&sceneryView=1'],
    ['shore-low', '/?spawnX=-24317&spawnY=600&spawnZ=-54383&sceneryView=1'],
    ['coast-high', '/?spawnX=-30000&spawnY=3500&spawnZ=-50000&sceneryView=1'],
  ] as const) {
    await page.goto(url)
    await waitForTerrain(page)
    await page.waitForTimeout(5000)
    await page.screenshot({ path: `/tmp/ww2-13c-${name}.png` })
  }
})
```

Run it with the same `PW_REMOTE`/`PW_BASE_URL`, then **read each PNG with the Read tool and describe what you see**. The `shore-mid` view is the exact frame that produced the bug report: before 13c it shows large axis-aligned sand blocks with strips of open water between them. What to check, in order:

1. The rectangular water strips inside the beach are gone.
2. The waterline is a continuous line rather than a staircase of 390 m blocks.
3. No new green step appears at the shore — the lifted cells must land inside the 0.4–2.3 m beach band and read as sand.
4. Nothing floats: no sand rectangle sits detached in open water.

If a view is wrong, the fix is in Task 1's mask or Task 2's rule, **never** in a test threshold. Report rather than tuning.

Keep `/tmp/ww2-shore-before-shore-mid.png` (captured 2026-09-18, pre-13c) for the side-by-side; the handoff references both by path.

- [ ] **Step 4: Write the handoff**

Create `docs/handoff/2026-09-18-plan13c-coast.md` with: the commits; the `npm run verify` totals; the Tier 2 result and the verbatim budget line; the four landmark heights and the negative/zero counts from Task 3 Step 3; the before/after screenshot paths with one sentence each; every number re-recorded in Tasks 4 and 5 with why; and what is left for 13d (places must sit on this shore).

Also record, because it is the open question this plan inherits: **whether the waterline still crawls in flight.** 13c removes the hard 390 m step the flicker was crawling along, so the symptom may be gone or merely reduced. The remaining suspect is the ocean's camera-relative mesh (`positionLocal.xz.add(camera)` in `src/render/ocean/mesh.ts`) sampling terrain height for `landWeight` on vertices that move through the world every frame. State which it turned out to be, or that it needs a flight to tell.

- [ ] **Step 5: Close the roadmap row**

In `docs/superpowers/specs/2026-09-12-ww2airsim-design.md`, change the 13c row's status to `Complete 2026-09-18; [handoff](../../handoff/2026-09-18-plan13c-coast.md)`. Tick every box of every task in this plan file.

- [ ] **Step 6: Commit**

```bash
git add docs/handoff/2026-09-18-plan13c-coast.md docs/superpowers/specs/2026-09-12-ww2airsim-design.md docs/superpowers/plans/2026-09-18-coast-rebuild.md
git commit -m "Hand off Plan 13c: the coast the simulation and the picture now share"
```

**Do not push and do not deploy.** Both are Mark's call; the controller asks.

---

## Self-review

**Spec coverage (§6):** the hook between `resample` and `buildPyramid` → Task 3 Step 1. Sea-connectivity flood fill at the 20 m overview → Task 1. The three-row rule → Task 2. No negative height written → Task 2's fourth test and Task 3 Step 3's negative count. The fallout table: digests → Task 3 Step 4; landmark signs → Task 3 Step 5; Tacloban 1.673 m → Task 4 Step 2; LOD error tables → Task 4; cards and landing → Task 5; local tiles rebuilt → Task 3 Step 2. "What 13c does not do" → no task carves rivers, adds inshore bathymetry, or reshapes beyond WorldCover's line.

**Known gaps, stated rather than hidden:**
- The spec says the ocean needs no change because its land weight reads terrain height. This plan takes that on trust and verifies it visually in Task 6 Step 3 rather than by a test, since no headless TSL evaluator exists here.
- The flicker is not promised. Task 6 Step 4 requires recording what actually happened rather than claiming a fix.
- `tools/landcover/sample.ts` and `tools/landcover/sea.ts` both stitch tile windows over the box, at 10 m and 20 m respectively. That is duplication the 13b review already flagged in a different form; a third consumer would justify a shared helper. Not worth abstracting for the second.
