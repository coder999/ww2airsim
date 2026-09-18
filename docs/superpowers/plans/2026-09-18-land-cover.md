# Plan 13b: Land Cover from ESA WorldCover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Codex's noise-and-height land classes with ESA WorldCover data so Leyte is recognisable from the air: forest, paddies, mangrove and open ground where they really are, with tree density to match.

**Architecture:** An offline tool (`tools/landcover/`) fetches and pins two WorldCover tiles, reads them at 10 m, and writes a 1025×1025 four-channel coverage-fraction raster (`content/landcover/cover.bin.gz`) on the terrain's tangent-plane grid. The browser inflates it with `DecompressionStream`, uploads it as one RGBA8 texture that the terrain fragment shader samples for class weights (falling back to today's procedural rule until it arrives), and keeps the same bytes on the CPU so tree placement can read the tree fraction.

**Tech Stack:** TypeScript strict, vitest, `geotiff` (devDependency, already used by the terrain build), node `zlib`, three r186 WebGPU/TSL, Playwright Tier 2 on the Windows reference desktop.

**Spec:** `docs/superpowers/specs/2026-09-18-land-cover-design.md` §2–5, §8–9. 13c (coast rebuild) and 13d (places) are separate plans; do not start them here.

## Global Constraints

- **Served working copy, on `main`, in place.** No worktrees, no branches: `~/projects/ww2airsim` is what the LAN dev server serves (`~/projects/CLAUDE.md`, "Served site repos"). Stage by explicit path; never `git add -A` or `git add .`. Re-run `git diff --stat` right before every commit.
- **Runtime uses only bundled data.** No network, no tile reads, no `tools/` import from anything under `src/` (`src/render/content.ts` explains why; `.dependency-cruiser.cjs` enforces `src/sim` never importing `src/render`).
- **Nothing on the play screen.** Attribution lives in the `/` controls panel credits line and in NOTICE files (Mark's rule, 2026-09-17; `tests/build/dist.test.ts` refuses a `map-credit` element).
- **Raster:** 1025 × 1025 samples, 195.3 m each, channels `tree, crop, mangrove, open` as 8-bit fractions quantised to 16 levels (`round(15·f)·17`), row 0 north, column 0 west, gzip level 9, shipped as `content/landcover/cover.bin.gz` + `content/landcover/header.json`.
- **1944 correction:** WorldCover class 50 (built-up) counts as cropland. No other class is altered.
- **Every claim about the Earth cites an independent coordinate.** Values verified 2026-09-17 against the 10 m tiles (200 m windows): Tacloban airfield 11.228 N 125.028 E = grass 64 % built 33 % crop 3 %; Mt Nacolod 10.450846 N 125.096068 E = tree 100 %; Leyte Gulf 10.75 N 125.25 E = water 100 %; Dagami plain 11.06 N 124.90 E = crop 86 %; mangrove shore 11.289 N 125.077 E = mangrove 100 %.
- **Never widen a numeric tolerance to pass; re-measure and record.** `npm run verify` (typecheck, lint, depcruise, unit) must exit 0 before every commit; check the exit code, not grep output.
- **Commit messages** are an imperative sentence explaining why, in the style of `git log --oneline -15`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `tools/landcover/fetch.ts` (create) | Tile ids for the box, URLs, cache dir, fetch-into-cache with `.part` rename. Mirrors `tools/terrain/fetch.ts`. |
| `tools/landcover/sample.ts` (create) | Opens cached tiles with `geotiff`, holds the 10 m window over the box, answers class fractions for a lat/lon rectangle. Only file that knows WorldCover class numbers. |
| `tools/landcover/build.ts` (create) | Walks the 1025² grid, quantises, gzips, writes `cover.bin.gz` and `header.json`. `npm run landcover:build`. |
| `tools/landcover/load.ts` (create) | Node-side reader of the committed raster for tests (gunzip + header). |
| `src/render/landcover/cover.ts` (create) | Browser-safe pure code: header schema, sample index for world x/z, fraction lookups. Used by tests, tools and the renderer. |
| `src/render/landcover/load.ts` (create) | Fetch + `DecompressionStream('gzip')` + length check. |
| `src/render/content.ts` (modify) | `COVER_PATH`, `COVER_URL`, `COVER_HEADER_PATH`. |
| `src/render/terrain/surface.ts` (modify) | `terrainSurfaceNode` takes the cover texture and a ready uniform; class weights from the raster with procedural fallback. |
| `src/render/terrain/mesh.ts` (modify) | Owns the cover `DataTexture` and `ready` uniform; `TerrainMesh.setCover(data)`. |
| `src/render/scene/vegetation.ts` (modify) | `treeSites` takes an optional cover lookup; `setCover` on the vegetation object. |
| `src/render/main.ts` (modify) | Loads the cover, hands it to terrain and vegetation in either order. |
| `src/render/legend.ts` (modify) | Credits line gains ESA WorldCover. |
| `content/landcover/NOTICE.md`, `ASSETS.md` (create/modify) | CC BY 4.0 attribution and provenance. |
| `tests/tools/landcoverFetch.test.ts`, `tests/tools/landcoverSample.test.ts`, `tests/tools/landcoverBuild.test.ts`, `tests/render/landcover.test.ts`, `tests/render/scenery.test.ts`, `tests/render/legend.test.ts`, `tests/build/dist.test.ts` | Tests, one file per unit. |
| `docs/handoff/2026-09-18-plan13b-land-cover.md` (create) | Dated record with the Tier 2 numbers. |

---

### Task 1: Tile ids, URLs and the cache

**Files:**
- Create: `tools/landcover/fetch.ts`
- Test: `tests/tools/landcoverFetch.test.ts`

**Interfaces:**
- Produces: `type TileId = { readonly lat: number; readonly lon: number }` (south-west corner, multiples of 3), `tileFileName(id): string`, `tileUrl(id): string`, `tileIdsFor(box: LatLonBox): TileId[]`, `type LatLonBox = { latMin, latMax, lonMin, lonMax }`, `COVER_BOX: LatLonBox`, `CACHE_DIR: string`, `type TileFetcher = (url: string) => Promise<Uint8Array>`, `ensureTileInto(id, dir, fetch): Promise<string>`, `ensureAllTilesInto(box, dir, fetch): Promise<readonly string[]>`, `ensureAllTiles(): Promise<readonly string[]>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/tools/landcoverFetch.test.ts
import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { COVER_BOX, ensureAllTilesInto, ensureTileInto, tileFileName, tileIdsFor, tileUrl } from '../../tools/landcover/fetch.js'

describe('WorldCover tile ids', () => {
  it('names and addresses a tile the way ESA publishes it', () => {
    expect(tileFileName({ lat: 9, lon: 123 })).toBe('ESA_WorldCover_10m_2021_v200_N09E123_Map.tif')
    expect(tileUrl({ lat: 9, lon: 126 })).toBe(
      'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N09E126_Map.tif',
    )
  })

  it('covers the 200 km box with exactly the two tiles measured on 2026-09-17', () => {
    // The box is 9.9-11.7 N, 124.4-126.2 E; WorldCover tiles are 3 degrees
    // on a side named by their south-west corner. Both were fetched by hand
    // that day (30.9 MB and 2.5 MB) with an anonymous HEAD request.
    expect(COVER_BOX.latMin).toBeCloseTo(9.89, 1)
    expect(COVER_BOX.lonMax).toBeCloseTo(126.22, 1)
    expect(tileIdsFor(COVER_BOX)).toEqual([{ lat: 9, lon: 123 }, { lat: 9, lon: 126 }])
  })

  it('fetches into a .part file and renames only on success', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ww2-landcover-'))
    try {
      const calls: string[] = []
      const fake = async (url: string) => { calls.push(url); return new Uint8Array([1, 2, 3]) }
      const path = await ensureTileInto({ lat: 9, lon: 123 }, dir, fake)
      expect(readFileSync(path)).toEqual(Buffer.from([1, 2, 3]))
      expect(existsSync(`${path}.part`)).toBe(false)
      // A second call is a cache hit: no fetch.
      await ensureTileInto({ lat: 9, lon: 123 }, dir, fake)
      expect(calls).toHaveLength(1)
      const failing = async () => { throw new Error('offline') }
      await expect(ensureTileInto({ lat: 9, lon: 126 }, dir, failing)).rejects.toThrow('offline')
      expect(existsSync(join(dir, tileFileName({ lat: 9, lon: 126 }) + '.part'))).toBe(false)
      const all = await ensureAllTilesInto(COVER_BOX, dir, fake)
      expect(all.map(p => p.split('/').pop())).toEqual([tileFileName({ lat: 9, lon: 123 }), tileFileName({ lat: 9, lon: 126 })])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/landcoverFetch.test.ts`
Expected: FAIL, "Cannot find module '../../tools/landcover/fetch.js'".

- [ ] **Step 3: Write the implementation**

```ts
// tools/landcover/fetch.ts
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toGeodetic } from '../../src/sim/world/projection.js'
import { GRID } from '../terrain/resample.js'

/**
 * ESA WorldCover 2021 v200, 10 m, CC BY 4.0, on a public S3 bucket that
 * needs no account (verified 2026-09-17 with a HEAD request). Tiles are
 * 3 x 3 degrees, named by their south-west corner. Design:
 * docs/superpowers/specs/2026-09-18-land-cover-design.md section 2.
 */
export type TileId = { readonly lat: number; readonly lon: number }
export type LatLonBox = { readonly latMin: number; readonly latMax: number; readonly lonMin: number; readonly lonMax: number }
export type TileFetcher = (url: string) => Promise<Uint8Array>

const BASE_URL = 'https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/'

// tools/landcover/cache, resolved relative to this file (not process.cwd()),
// the same rule as tools/terrain/fetch.ts. .gitignore's /tools/**/cache/ covers it.
export const CACHE_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'cache')

const pad = (n: number, width: number): string => String(Math.abs(n)).padStart(width, '0')

export function tileFileName(id: TileId): string {
  const ns = id.lat >= 0 ? 'N' : 'S', ew = id.lon >= 0 ? 'E' : 'W'
  return `ESA_WorldCover_10m_2021_v200_${ns}${pad(id.lat, 2)}${ew}${pad(id.lon, 3)}_Map.tif`
}

export function tileUrl(id: TileId): string {
  return BASE_URL + tileFileName(id)
}

/** The lat/lon rectangle enclosing the tangent-plane box, with a 0.01
 *  degree margin so a cell straddling the edge still has pixels. */
function boxFor(halfExtentM: number): LatLonBox {
  const corners = [
    toGeodetic(-halfExtentM, -halfExtentM), toGeodetic(halfExtentM, -halfExtentM),
    toGeodetic(-halfExtentM, halfExtentM), toGeodetic(halfExtentM, halfExtentM),
  ]
  const lats = corners.map(c => c.latDeg), lons = corners.map(c => c.lonDeg)
  return {
    latMin: Math.min(...lats) - 0.01, latMax: Math.max(...lats) + 0.01,
    lonMin: Math.min(...lons) - 0.01, lonMax: Math.max(...lons) + 0.01,
  }
}
export const COVER_BOX: LatLonBox = boxFor(GRID.halfExtentM)

export function tileIdsFor(box: LatLonBox): TileId[] {
  const ids: TileId[] = []
  const floor3 = (v: number): number => Math.floor(v / 3) * 3
  for (let lat = floor3(box.latMin); lat <= floor3(box.latMax); lat += 3) {
    for (let lon = floor3(box.lonMin); lon <= floor3(box.lonMax); lon += 3) ids.push({ lat, lon })
  }
  return ids
}

/** The testable core: everything is an argument, nothing is ambient. */
export async function ensureTileInto(id: TileId, dir: string, fetch: TileFetcher): Promise<string> {
  mkdirSync(dir, { recursive: true })
  const path = join(dir, tileFileName(id))
  if (existsSync(path)) return path
  const part = `${path}.part`
  try {
    writeFileSync(part, await fetch(tileUrl(id)))
    renameSync(part, path)
  } catch (err) {
    rmSync(part, { force: true })
    throw err
  }
  return path
}

export async function ensureAllTilesInto(box: LatLonBox, dir: string, fetch: TileFetcher): Promise<readonly string[]> {
  const paths: string[] = []
  for (const id of tileIdsFor(box)) paths.push(await ensureTileInto(id, dir, fetch))
  return paths
}

const realFetch: TileFetcher = async (url) => {
  const res = await globalThis.fetch(url)
  if (!res.ok) throw new Error(`fetch ${url}: HTTP ${res.status} ${res.statusText}`)
  return new Uint8Array(await res.arrayBuffer())
}

export async function ensureAllTiles(): Promise<readonly string[]> {
  return ensureAllTilesInto(COVER_BOX, CACHE_DIR, realFetch)
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  ensureAllTiles().then(paths => { for (const p of paths) console.log(p) }).catch((err: unknown) => {
    console.error(err)
    process.exit(1)
  })
}
```

- [ ] **Step 4: Run the test and the type check**

Run: `npx vitest run tests/tools/landcoverFetch.test.ts && npx tsc --noEmit`
Expected: 3 passed; tsc exit 0. If the `COVER_BOX` assertions fail by more than 0.02 degrees, print `COVER_BOX` and check `toGeodetic` was called with (x, z) in that order; do not loosen the test.

- [ ] **Step 5: Commit**

```bash
git add tools/landcover/fetch.ts tests/tools/landcoverFetch.test.ts
git commit -m "Name, address and cache the two ESA WorldCover tiles that cover the box"
```

---

### Task 2: The 10 m sampler

**Files:**
- Create: `tools/landcover/sample.ts`
- Test: `tests/tools/landcoverSample.test.ts`

**Interfaces:**
- Consumes: `tileFileName`, `LatLonBox`, `CACHE_DIR`, `COVER_BOX` from Task 1.
- Produces: `CLASS` (WorldCover class numbers), `type Fractions = { tree: number; crop: number; mangrove: number; open: number; water: number }`, `channelOf(cls: number): keyof Fractions`, `type CoverSource = { fractions(box: LatLonBox): Fractions }`, `openCoverSource(paths: readonly string[], box: LatLonBox): Promise<CoverSource>`, `haveCoverSource(): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/tools/landcoverSample.test.ts
import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { CACHE_DIR, COVER_BOX, tileFileName, tileIdsFor } from '../../tools/landcover/fetch.js'
import { CLASS, channelOf, openCoverSource } from '../../tools/landcover/sample.js'

describe('WorldCover classes map to the four shipped channels', () => {
  it('applies the one 1944 correction and nothing else', () => {
    expect(channelOf(CLASS.tree)).toBe('tree')
    expect(channelOf(CLASS.mangrove)).toBe('mangrove')
    expect(channelOf(CLASS.crop)).toBe('crop')
    // Master spec section 4's known compromise: towns sat in paddy country.
    expect(channelOf(CLASS.built)).toBe('crop')
    for (const cls of [CLASS.grass, CLASS.shrub, CLASS.bare]) expect(channelOf(cls)).toBe('open')
    for (const cls of [CLASS.water, CLASS.wetland, CLASS.snow, CLASS.moss, 0]) expect(channelOf(cls)).toBe('water')
  })
})

const paths = tileIdsFor(COVER_BOX).map(id => join(CACHE_DIR, tileFileName(id)))
const haveSource = paths.every(p => existsSync(p))
if (!haveSource) {
  console.warn(`[landcoverSample.test.ts] ${CACHE_DIR} lacks the WorldCover tiles -- the source checks are SKIPPED. Run \`npx tsx tools/landcover/fetch.ts\` to enable them.`)
}

describe.skipIf(!haveSource)('the sampler against the Earth', () => {
  it('reads the landmarks measured on 2026-09-17 from the 10 m tiles', async () => {
    const source = await openCoverSource(paths, COVER_BOX)
    const around = (lat: number, lon: number, halfM = 100) => {
      const d = halfM / 111000
      return source.fractions({ latMin: lat - d, latMax: lat + d, lonMin: lon - d, lonMax: lon + d })
    }
    // Mt Nacolod, an inland peak: tree 100 %.
    expect(around(10.450846, 125.096068).tree).toBeGreaterThan(0.95)
    // Leyte Gulf: water 100 %, every land channel 0.
    const gulf = around(10.75, 125.25)
    expect(gulf.water).toBeGreaterThan(0.99)
    expect(gulf.tree + gulf.crop + gulf.mangrove + gulf.open).toBeLessThan(0.01)
    // Dagami plain, the Leyte Valley: crop 86 %.
    expect(around(11.06, 124.9).crop).toBeGreaterThan(0.75)
    // Mangrove shore on San Juanico Strait: mangrove 100 %.
    expect(around(11.289, 125.077).mangrove).toBeGreaterThan(0.95)
    // Tacloban airfield: grass 64 %, built 33 % -> open ~0.64, crop ~0.36 after the correction, no trees.
    const strip = around(11.228, 125.028)
    expect(strip.tree).toBeLessThan(0.05)
    expect(strip.open).toBeGreaterThan(0.5)
    expect(strip.crop).toBeGreaterThan(0.25)
  }, 120_000)

  it('crosses the tile seam at 126 E without a gap', async () => {
    const source = await openCoverSource(paths, COVER_BOX)
    // A rectangle straddling the seam in open sea east of Samar: still all water, no NaN.
    const f = source.fractions({ latMin: 11.0, latMax: 11.01, lonMin: 125.995, lonMax: 126.005 })
    expect(f.water).toBeGreaterThan(0.99)
    expect(Number.isFinite(f.tree)).toBe(true)
  }, 120_000)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/landcoverSample.test.ts`
Expected: FAIL on the missing module. (If the cache is absent on this machine, run `npx tsx tools/landcover/fetch.ts` first: 33 MB, anonymous.)

- [ ] **Step 3: Write the implementation**

```ts
// tools/landcover/sample.ts
import { fromFile } from 'geotiff'
import type { LatLonBox } from './fetch.js'

/** WorldCover 2021 v200 class codes (ESA product user manual, table 2). */
export const CLASS = {
  tree: 10, shrub: 20, grass: 30, crop: 40, built: 50, bare: 60,
  snow: 70, water: 80, wetland: 90, mangrove: 95, moss: 100,
} as const

export type Fractions = { tree: number; crop: number; mangrove: number; open: number; water: number }

/**
 * The only place that knows class numbers. `built` becomes `crop`: master
 * spec section 4's known compromise, the one 1944 correction. Everything
 * that is not land cover a pilot can read from the air -- water, wetland,
 * snow, moss, no-data -- is `water`, which the shipped raster carries as
 * the remainder of the four land channels.
 */
export function channelOf(cls: number): keyof Fractions {
  switch (cls) {
    case CLASS.tree: return 'tree'
    case CLASS.mangrove: return 'mangrove'
    case CLASS.crop: case CLASS.built: return 'crop'
    case CLASS.grass: case CLASS.shrub: case CLASS.bare: return 'open'
    default: return 'water'
  }
}

/** Pixels per degree at 10 m: WorldCover tiles are 36,000 x 36,000. */
const PIXELS_PER_DEGREE = 12_000

type Window = {
  readonly data: Uint8Array
  readonly width: number
  readonly height: number
  /** Lat/lon of the window's north-west pixel corner. */
  readonly north: number
  readonly west: number
}

export type CoverSource = { fractions(box: LatLonBox): Fractions }

/**
 * Reads, once, the part of each tile inside `box` at full 10 m resolution.
 * For the shipped box that is about 470 MB of uint8 across the two tiles,
 * held for the build's few seconds; the terrain build holds 415 MB of
 * float32 the same way. Reading by window keeps a 1.3 GB tile off the heap.
 */
export async function openCoverSource(paths: readonly string[], box: LatLonBox): Promise<CoverSource> {
  const windows: Window[] = []
  for (const path of paths) {
    const tiff = await fromFile(path)
    const image = await tiff.getImage(0)
    const [originLon, originLat] = image.getOrigin() as [number, number]
    const width = image.getWidth(), height = image.getHeight()
    if (width !== 3 * PIXELS_PER_DEGREE || height !== 3 * PIXELS_PER_DEGREE) {
      throw new Error(`${path}: ${width}x${height}, expected ${3 * PIXELS_PER_DEGREE} square`)
    }
    const x0 = Math.max(0, Math.floor((box.lonMin - originLon) * PIXELS_PER_DEGREE))
    const x1 = Math.min(width, Math.ceil((box.lonMax - originLon) * PIXELS_PER_DEGREE))
    const y0 = Math.max(0, Math.floor((originLat - box.latMax) * PIXELS_PER_DEGREE))
    const y1 = Math.min(height, Math.ceil((originLat - box.latMin) * PIXELS_PER_DEGREE))
    if (x1 <= x0 || y1 <= y0) continue
    const [raster] = await image.readRasters({ window: [x0, y0, x1, y1] }) as unknown as [Uint8Array]
    if (!(raster instanceof Uint8Array)) throw new Error(`${path}: expected a uint8 raster`)
    windows.push({
      data: raster, width: x1 - x0, height: y1 - y0,
      north: originLat - y0 / PIXELS_PER_DEGREE, west: originLon + x0 / PIXELS_PER_DEGREE,
    })
  }
  if (windows.length === 0) throw new Error('no WorldCover tile overlaps the box')

  return {
    fractions(q: LatLonBox): Fractions {
      const counts: Fractions = { tree: 0, crop: 0, mangrove: 0, open: 0, water: 0 }
      let total = 0
      for (const w of windows) {
        const c0 = Math.max(0, Math.floor((q.lonMin - w.west) * PIXELS_PER_DEGREE))
        const c1 = Math.min(w.width, Math.ceil((q.lonMax - w.west) * PIXELS_PER_DEGREE))
        const r0 = Math.max(0, Math.floor((w.north - q.latMax) * PIXELS_PER_DEGREE))
        const r1 = Math.min(w.height, Math.ceil((w.north - q.latMin) * PIXELS_PER_DEGREE))
        for (let r = r0; r < r1; r++) {
          const row = r * w.width
          for (let c = c0; c < c1; c++) {
            counts[channelOf(w.data[row + c]!)]++
            total++
          }
        }
      }
      // A rectangle entirely outside every window is open ocean beyond
      // WorldCover's coverage: water, the same convention as no-data.
      if (total === 0) return { tree: 0, crop: 0, mangrove: 0, open: 0, water: 1 }
      return {
        tree: counts.tree / total, crop: counts.crop / total, mangrove: counts.mangrove / total,
        open: counts.open / total, water: counts.water / total,
      }
    },
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/tools/landcoverSample.test.ts && npx tsc --noEmit`
Expected: 3 passed (or 1 passed + 2 skipped without the cache, with the warning printed). If a landmark assertion fails, print the returned `Fractions` and compare with the Global Constraints table before touching anything: a row/column swap reads a different place entirely, and the fix is the indexing, never the threshold.

- [ ] **Step 5: Commit**

```bash
git add tools/landcover/sample.ts tests/tools/landcoverSample.test.ts
git commit -m "Read WorldCover at 10 m and answer class fractions for a rectangle, with the one 1944 correction"
```

---

### Task 3: Browser-safe cover geometry and header

**Files:**
- Create: `src/render/landcover/cover.ts`
- Test: `tests/render/landcover.test.ts`

**Interfaces:**
- Produces: `COVER_CHANNELS = ['tree', 'crop', 'mangrove', 'open'] as const`, `COVER_SAMPLES = 1025`, `type CoverHeader = { centreLatDeg, centreLonDeg, halfExtentM, samples, channels, encoding: 'rgba8-sixteenths' }`, `parseCoverHeader(raw: unknown): CoverHeader`, `coverByteLength(header): number`, `coverIndex(header, x, z): number` (sample index, row 0 north, column 0 west, nearest), `coverFractionsAt(data, header, x, z): { tree, crop, mangrove, open }`, `quantize(fraction): number`, `dequantize(byte): number`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/render/landcover.test.ts
import { describe, expect, it } from 'vitest'
import {
  COVER_CHANNELS, COVER_SAMPLES, coverByteLength, coverFractionsAt, coverIndex, dequantize, parseCoverHeader, quantize,
} from '../../src/render/landcover/cover.js'

const header = parseCoverHeader({
  centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000, samples: COVER_SAMPLES,
  channels: [...COVER_CHANNELS], encoding: 'rgba8-sixteenths',
})

describe('cover raster geometry', () => {
  it('is 1025 square, four bytes a sample, on the terrain grid', () => {
    expect(coverByteLength(header)).toBe(1025 * 1025 * 4)
    // Row 0 is the NORTH edge (z = -half), column 0 the WEST edge (x = -half):
    // tools/terrain/resample.ts's gridToLocal, the frame 29f5319 settled.
    expect(coverIndex(header, -100000, -100000)).toBe(0)
    expect(coverIndex(header, 100000, -100000)).toBe(1024)
    expect(coverIndex(header, -100000, 100000)).toBe(1024 * 1025)
    // Nearest sample: 195.3 m per step, so 97 m east of a sample rounds to it.
    expect(coverIndex(header, -100000 + 97, -100000)).toBe(0)
    expect(coverIndex(header, -100000 + 98, -100000)).toBe(1)
    // Outside the box clamps to the edge rather than reading garbage.
    expect(coverIndex(header, -200000, -200000)).toBe(0)
  })

  it('quantises to sixteenths and back', () => {
    expect(quantize(0)).toBe(0)
    expect(quantize(1)).toBe(255)
    expect(quantize(0.5)).toBe(8 * 17)
    for (let i = 0; i <= 15; i++) expect(dequantize(i * 17)).toBeCloseTo(i / 15, 12)
  })

  it('reads the four channels of a sample', () => {
    const data = new Uint8Array(coverByteLength(header))
    const i = coverIndex(header, 0, 0) * 4
    data[i] = quantize(0.6); data[i + 1] = quantize(0.2); data[i + 2] = quantize(0); data[i + 3] = quantize(0.2)
    expect(coverFractionsAt(data, header, 0, 0)).toEqual({ tree: 0.6, crop: 0.2, mangrove: 0, open: 0.2 })
  })

  it('rejects a header that does not describe this grid', () => {
    expect(() => parseCoverHeader({ ...header, samples: 1024 })).toThrow()
    expect(() => parseCoverHeader({ ...header, encoding: 'png' })).toThrow()
    expect(() => parseCoverHeader({ ...header, channels: ['tree'] })).toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/render/landcover.test.ts`
Expected: FAIL on the missing module.

- [ ] **Step 3: Write the implementation**

```ts
// src/render/landcover/cover.ts
import { z } from 'zod'

/**
 * The shipped land-cover raster: coverage FRACTIONS, not a class index, so
 * the GPU can filter it linearly. Design:
 * docs/superpowers/specs/2026-09-18-land-cover-design.md section 4.
 * Browser-safe on purpose: no node imports, so tools/, tests and the
 * renderer all read the same bytes the same way.
 */
export const COVER_CHANNELS = ['tree', 'crop', 'mangrove', 'open'] as const
export const COVER_SAMPLES = 1025

const HeaderSchema = z.object({
  centreLatDeg: z.number(),
  centreLonDeg: z.number(),
  halfExtentM: z.number().positive(),
  samples: z.literal(COVER_SAMPLES),
  channels: z.tuple([z.literal('tree'), z.literal('crop'), z.literal('mangrove'), z.literal('open')]),
  encoding: z.literal('rgba8-sixteenths'),
})
export type CoverHeader = z.infer<typeof HeaderSchema>

export function parseCoverHeader(raw: unknown): CoverHeader {
  return HeaderSchema.parse(raw)
}

export function coverByteLength(header: CoverHeader): number {
  return header.samples * header.samples * COVER_CHANNELS.length
}

/** Sixteen levels: `round(15 f) * 17` puts 0 at 0 and 1 at 255 exactly. */
export function quantize(fraction: number): number {
  return Math.round(15 * Math.min(1, Math.max(0, fraction))) * 17
}
export function dequantize(byte: number): number {
  return byte / 255
}

/** Nearest sample for a world position. Row 0 = north (z = -half),
 *  column 0 = west (x = -half), as `tools/terrain/resample.ts` lays the
 *  terrain out. Clamped to the edge outside the box. */
export function coverIndex(header: CoverHeader, x: number, z: number): number {
  const last = header.samples - 1
  const step = (2 * header.halfExtentM) / last
  const col = Math.min(last, Math.max(0, Math.round((x + header.halfExtentM) / step)))
  const row = Math.min(last, Math.max(0, Math.round((z + header.halfExtentM) / step)))
  return row * header.samples + col
}

export function coverFractionsAt(data: Uint8Array, header: CoverHeader, x: number, z: number): {
  tree: number; crop: number; mangrove: number; open: number
} {
  const i = coverIndex(header, x, z) * 4
  return { tree: dequantize(data[i]!), crop: dequantize(data[i + 1]!), mangrove: dequantize(data[i + 2]!), open: dequantize(data[i + 3]!) }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/render/landcover.test.ts && npx tsc --noEmit && npm run depcruise`
Expected: 4 passed; tsc and depcruise exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/render/landcover/cover.ts tests/render/landcover.test.ts
git commit -m "Define the land-cover raster: 1025 square, four fraction channels in sixteenths, terrain grid"
```

---

### Task 4: The build tool and the committed raster

**Files:**
- Create: `tools/landcover/build.ts`, `tools/landcover/load.ts`, `content/landcover/cover.bin.gz`, `content/landcover/header.json`
- Modify: `package.json` (scripts)
- Test: `tests/tools/landcoverBuild.test.ts`

**Interfaces:**
- Consumes: Task 1 (`ensureAllTiles`, `COVER_BOX`), Task 2 (`openCoverSource`, `CoverSource`), Task 3 (`COVER_SAMPLES`, `COVER_CHANNELS`, `quantize`, `CoverHeader`, `parseCoverHeader`, `coverByteLength`).
- Produces: `buildCover(source: CoverSource, samples?: number): Uint8Array` (raw RGBA, row 0 north), `COVER_DIR`, `coverPath()`, `coverHeaderPath()`, `loadCoverHeader(): CoverHeader`, `loadCover(): Uint8Array` (gunzipped), `npm run landcover:build`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/tools/landcoverBuild.test.ts
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { toLocal } from '../../src/sim/world/projection.js'
import { coverByteLength, coverFractionsAt } from '../../src/render/landcover/cover.js'
import { buildCover, coverHeaderPath, coverPath, loadCover, loadCoverHeader } from '../../tools/landcover/build.js'
import type { CoverSource } from '../../tools/landcover/sample.js'

describe('buildCover', () => {
  it('samples each cell over its own footprint and quantises', () => {
    // A synthetic source: tree everywhere north of the equator line z = 0,
    // crop everywhere south. The cell at the north-west corner is row 0.
    const source: CoverSource = {
      fractions: (box) => {
        const lat = (box.latMin + box.latMax) / 2
        return lat > 10.8 ? { tree: 1, crop: 0, mangrove: 0, open: 0, water: 0 } : { tree: 0, crop: 1, mangrove: 0, open: 0, water: 0 }
      },
    }
    const data = buildCover(source, 9)
    expect(data.length).toBe(9 * 9 * 4)
    expect([...data.subarray(0, 4)]).toEqual([255, 0, 0, 0])       // row 0, north: tree
    expect([...data.subarray(8 * 9 * 4, 8 * 9 * 4 + 4)]).toEqual([0, 255, 0, 0])  // row 8, south: crop
  })
})

const COMMITTED_SHA256: Readonly<Record<string, string>> = {
  // Regenerate with `npm run landcover:build` and paste from `sha256sum
  // content/landcover/*`; the commit that changes these says what moved.
  'header.json': 'FILL-FROM-STEP-6',
  'cover.bin.gz': 'FILL-FROM-STEP-6',
}
const sha256 = (path: string): string => createHash('sha256').update(readFileSync(path)).digest('hex')

describe('the committed land cover', () => {
  const header = loadCoverHeader()
  const data = loadCover()
  const at = (lat: number, lon: number) => {
    const p = toLocal(lat, lon)
    return coverFractionsAt(data, header, p.x, p.z)
  }

  it('is byte-for-byte the pinned build', () => {
    expect({ 'header.json': sha256(coverHeaderPath()), 'cover.bin.gz': sha256(coverPath()) }).toEqual(COMMITTED_SHA256)
    expect(data.length).toBe(coverByteLength(header))
  })

  it('agrees with the Earth at the landmarks measured on 2026-09-17', () => {
    // These are 195 m cells, so the thresholds are looser than the 200 m
    // windows in landcoverSample.test.ts; a cell straddles what a window
    // centres on. The DIRECTION of every assertion is the point.
    expect(at(10.450846, 125.096068).tree).toBeGreaterThan(0.85)          // Mt Nacolod
    const gulf = at(10.75, 125.25)                                          // Leyte Gulf
    expect(gulf.tree + gulf.crop + gulf.mangrove + gulf.open).toBe(0)
    expect(at(11.06, 124.9).crop).toBeGreaterThan(0.6)                      // Dagami plain
    expect(at(11.289, 125.077).mangrove).toBeGreaterThan(0.5)               // San Juanico shore
    const strip = at(11.228, 125.028)                                        // Tacloban airfield
    expect(strip.tree).toBeLessThan(0.2)
    expect(strip.open + strip.crop).toBeGreaterThan(0.6)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/landcoverBuild.test.ts`
Expected: FAIL on the missing module.

- [ ] **Step 3: Write the node-side loader**

```ts
// tools/landcover/load.ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { coverByteLength, parseCoverHeader, type CoverHeader } from '../../src/render/landcover/cover.js'

export const COVER_DIR = fileURLToPath(new URL('../../content/landcover/', import.meta.url))
export const coverPath = (): string => join(COVER_DIR, 'cover.bin.gz')
export const coverHeaderPath = (): string => join(COVER_DIR, 'header.json')

export function loadCoverHeader(): CoverHeader {
  return parseCoverHeader(JSON.parse(readFileSync(coverHeaderPath(), 'utf8')))
}

/** The committed raster, inflated. Throws on a length mismatch, as
 *  src/render/terrain/load.ts's decodeLevel does for terrain. */
export function loadCover(header: CoverHeader = loadCoverHeader()): Uint8Array {
  const data = new Uint8Array(gunzipSync(readFileSync(coverPath())))
  const expected = coverByteLength(header)
  if (data.length !== expected) throw new Error(`cover.bin.gz inflates to ${data.length} bytes; expected ${expected}`)
  return data
}
```

- [ ] **Step 4: Write the build tool**

```ts
// tools/landcover/build.ts
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { toGeodetic, WORLD_CENTRE } from '../../src/sim/world/projection.js'
import { COVER_CHANNELS, COVER_SAMPLES, parseCoverHeader, quantize, type CoverHeader } from '../../src/render/landcover/cover.js'
import { GRID, gridToLocal } from '../terrain/resample.js'
import { COVER_BOX, ensureAllTiles } from './fetch.js'
import { openCoverSource, type CoverSource } from './sample.js'
import { COVER_DIR, coverHeaderPath, coverPath } from './load.js'

export { COVER_DIR, coverHeaderPath, coverPath, loadCover, loadCoverHeader } from './load.js'

/**
 * One RGBA sample per grid cell: the fraction of the cell's 10 m pixels in
 * each of tree, crop, mangrove, open, quantised to sixteenths. A cell is
 * the square of one grid step centred on its sample, so cells tile the box
 * with no gaps and no double counting. Row 0 is north, column 0 west.
 */
export function buildCover(source: CoverSource, samples = COVER_SAMPLES): Uint8Array {
  const grid = { samples, halfExtentM: GRID.halfExtentM }
  const half = GRID.halfExtentM / (samples - 1)
  const out = new Uint8Array(samples * samples * COVER_CHANNELS.length)
  for (let row = 0; row < samples; row++) {
    for (let col = 0; col < samples; col++) {
      const { x, z } = gridToLocal(col, row, grid)
      const corners = [toGeodetic(x - half, z - half), toGeodetic(x + half, z - half), toGeodetic(x - half, z + half), toGeodetic(x + half, z + half)]
      const f = source.fractions({
        latMin: Math.min(...corners.map(c => c.latDeg)), latMax: Math.max(...corners.map(c => c.latDeg)),
        lonMin: Math.min(...corners.map(c => c.lonDeg)), lonMax: Math.max(...corners.map(c => c.lonDeg)),
      })
      const i = (row * samples + col) * 4
      out[i] = quantize(f.tree); out[i + 1] = quantize(f.crop); out[i + 2] = quantize(f.mangrove); out[i + 3] = quantize(f.open)
    }
  }
  return out
}

async function main(): Promise<void> {
  const paths = await ensureAllTiles()
  const source = await openCoverSource(paths, COVER_BOX)
  const started = Date.now()
  const data = buildCover(source)
  const header: CoverHeader = parseCoverHeader({
    centreLatDeg: WORLD_CENTRE.latDeg, centreLonDeg: WORLD_CENTRE.lonDeg, halfExtentM: GRID.halfExtentM,
    samples: COVER_SAMPLES, channels: [...COVER_CHANNELS], encoding: 'rgba8-sixteenths',
  })
  mkdirSync(COVER_DIR, { recursive: true })
  writeFileSync(coverHeaderPath(), `${JSON.stringify(header, null, 2)}\n`)
  const gz = gzipSync(data, { level: 9 })
  writeFileSync(coverPath(), gz)
  console.log(`landcover: ${COVER_SAMPLES}^2 x 4 = ${data.length} bytes raw, ${gz.length} bytes gzipped, ${((Date.now() - started) / 1000).toFixed(1)} s`)
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err: unknown) => {
    console.error(err)
    process.exit(1)
  })
}
```

Add to `package.json` scripts, after `"terrain:build"`:

```json
    "landcover:build": "tsx tools/landcover/build.ts",
```

- [ ] **Step 5: Build the raster**

Run: `npm run landcover:build`
Expected: a line like `landcover: 1025^2 x 4 = 4202500 bytes raw, ~265000 bytes gzipped, N s`. The gzipped size must be within 20 % of the 259 KiB measured on 2026-09-17 (see the spec §4); if it is not, the quantisation or the channel order is wrong, not the number.

- [ ] **Step 6: Pin the digests**

Run: `sha256sum content/landcover/header.json content/landcover/cover.bin.gz` and paste the two hashes into `COMMITTED_SHA256` in the test, replacing both `FILL-FROM-STEP-6` strings.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run tests/tools/landcoverBuild.test.ts && npx tsc --noEmit && npm run lint`
Expected: 3 passed; exit 0 everywhere. If a landmark assertion fails, print the fractions and check `coverIndex` (row from z, column from x) against `gridToLocal` before anything else.

- [ ] **Step 8: Commit**

```bash
git add tools/landcover/build.ts tools/landcover/load.ts package.json content/landcover/cover.bin.gz content/landcover/header.json tests/tools/landcoverBuild.test.ts
git commit -m "Build and commit the land-cover raster: 1025 square, four fractions, 259 KiB on the wire"
```

---

### Task 5: Attribution: NOTICE, ASSETS.md, credits line

**Files:**
- Create: `content/landcover/NOTICE.md`
- Modify: `ASSETS.md` (the WorldCover row and a provenance section), `src/render/legend.ts:128-139`
- Test: `tests/render/legend.test.ts`

**Interfaces:**
- Consumes: `CREDITS`, `creditsLine()` from `src/render/legend.ts`.
- Produces: the same names, new text.

- [ ] **Step 1: Write the failing test**

Add to `tests/render/legend.test.ts`, inside the existing `describe` that holds the ODbL credit test:

```ts
  it('credits ESA WorldCover alongside the other data sources', () => {
    // CC BY 4.0 wants attribution in a reasonable manner; the panel's
    // credits line is where every dataset is named. NOTICE.md and
    // ASSETS.md carry the full strings.
    expect(creditsLine()).toContain('ESA WorldCover')
    expect(creditsLine()).toContain('© OpenStreetMap contributors')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/render/legend.test.ts`
Expected: 1 failed, "expected 'Data: Copernicus DEM, GEBCO · Rivers © OpenStreetMap contributors' to contain 'ESA WorldCover'".

- [ ] **Step 3: Update the credits and write the notices**

In `src/render/legend.ts`, change the `before` string:

```ts
  before: 'Data: Copernicus DEM, GEBCO, ESA WorldCover · Rivers © ',
```

Create `content/landcover/NOTICE.md`:

```md
# Notice — land-cover data in this directory

`cover.bin.gz` is **derived** from ESA WorldCover 2021 v200 (10 m): the
fraction of each 195 m cell covered by tree cover, cropland, mangroves and
open ground, quantised to sixteenths. It is distributed publicly with the
game, so this notice ships with it. Full provenance is in
[`../../ASSETS.md`](../../ASSETS.md), which is authoritative; the strings
below are quoted from it.

## Attribution (CC BY 4.0)

> © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel
> data (2021) processed by ESA WorldCover consortium.

> Zanaga, D., Van De Kerchove, R., Daems, D., De Keersmaecker, W., Brockmann,
> C., Kirches, G., Wevers, J., Cartus, O., Santoro, M., Fritz, S., Lesiv, M.,
> Herold, M., Tsendbazar, N.E., Xu, P., Ramoino, F., Arino, O., 2022. ESA
> WorldCover 10 m 2021 v200. https://doi.org/10.5281/zenodo.7254221

## What was changed

Built-up pixels are counted as cropland (a deliberate 1944 correction, master
design spec §4); the eleven classes are collapsed to four land channels and
water; the 10 m pixels are averaged over 195 m cells. Nothing here is a
land-cover product; it is a game's paint guide.
```

In `ASSETS.md`, replace the row

```md
| ESA WorldCover 10 m | ESA WorldCover project | To be recorded with the pipeline, before first use |
```

with

```md
| ESA WorldCover 10 m 2021 v200 | ESA WorldCover consortium (VITO, Brockmann Consult, CS, GAMMA, IIASA, WUR) | CC BY 4.0; attribution in `content/landcover/NOTICE.md` and the in-app credits line. Fetched 2026-09-17. |
```

and add, after the existing per-dataset provenance sections, following their `### <Dataset> — recorded <date>` shape:

```md
### ESA WorldCover 10 m 2021 v200 — recorded 2026-09-18 (Plan 13b, land cover)

- **Dataset:** ESA WorldCover 10 m 2021 v200, tiles `N09E123` and `N09E126`,
  from `https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/`
  (public bucket, anonymous access, fetched 2026-09-17).
- **Producer:** ESA WorldCover consortium, led by VITO.
- **License:** Creative Commons Attribution 4.0 International (CC BY 4.0).
- **Attribution as required:**

  > © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium.

- **What ships:** `content/landcover/cover.bin.gz`, a 1025² four-channel
  coverage-fraction raster on the terrain grid, with the built-up class
  counted as cropland (master spec §4). The build is `npm run landcover:build`
  (`tools/landcover/`); the source tiles are cached under `tools/landcover/cache/`
  and are not committed.
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/render/legend.test.ts && npm run lint`
Expected: all passed; lint exit 0.

- [ ] **Step 5: Commit**

```bash
git add content/landcover/NOTICE.md ASSETS.md src/render/legend.ts tests/render/legend.test.ts
git commit -m "Attribute ESA WorldCover: notice, provenance and the credits line, nothing on the play screen"
```

---

### Task 6: The browser loader and the shipped-content test

**Files:**
- Create: `src/render/landcover/load.ts`
- Modify: `src/render/content.ts` (after `OCEAN_DEPTH_URL`), `tests/build/dist.test.ts`
- Test: `tests/render/landcover.test.ts` (extend)

**Interfaces:**
- Consumes: Task 3's `parseCoverHeader`, `coverByteLength`, `CoverHeader`.
- Produces: `COVER_PATH = 'content/landcover/cover.bin.gz'`, `COVER_URL`, `COVER_HEADER: CoverHeader` (parsed from the JSON import at module load), `loadCover(fetchImpl?: typeof fetch): Promise<Uint8Array>`.

- [ ] **Step 1: Write the failing test**

Append to `tests/render/landcover.test.ts`:

```ts
import { gzipSync } from 'node:zlib'
import { COVER_HEADER, loadCover } from '../../src/render/landcover/load.js'
import { COVER_PATH, COVER_URL } from '../../src/render/content.js'

describe('loadCover', () => {
  it('inflates the gzipped raster and checks its length', async () => {
    const raw = new Uint8Array(coverByteLength(COVER_HEADER))
    raw[4] = 255
    const gz = gzipSync(raw)
    const served: typeof fetch = async () => new Response(gz, { status: 200 })
    const data = await loadCover(served)
    expect(data.length).toBe(raw.length)
    expect(data[4]).toBe(255)
  })

  it('refuses a short body and a failed fetch', async () => {
    const short: typeof fetch = async () => new Response(gzipSync(new Uint8Array(16)), { status: 200 })
    await expect(loadCover(short)).rejects.toThrow(/inflates to 16 bytes/)
    const missing: typeof fetch = async () => new Response(null, { status: 404, statusText: 'Not Found' })
    await expect(loadCover(missing)).rejects.toThrow(/404/)
  })

  it('is addressed like the other content', () => {
    expect(COVER_PATH).toBe('content/landcover/cover.bin.gz')
    expect(COVER_URL.endsWith(COVER_PATH)).toBe(true)
    expect(COVER_HEADER.samples).toBe(COVER_SAMPLES)
  })
})
```

And in `tests/build/dist.test.ts`, next to the `content/ocean/depth.bin` assertions (line ~107):

```ts
      expect(readFileSync(join(outDir, 'content/landcover/cover.bin.gz')).length).toBeGreaterThan(200_000)
      expect(readFileSync(join(outDir, 'content/landcover/cover.bin.gz')).length).toBeLessThan(400_000)
      expect(readFileSync(join(outDir, 'content/landcover/NOTICE.md'), 'utf8')).toContain('ESA WorldCover')
      expect(JSON.parse(readFileSync(join(outDir, 'content/landcover/header.json'), 'utf8')).samples).toBe(1025)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/render/landcover.test.ts`
Expected: FAIL on the missing `load.js` module.

- [ ] **Step 3: Write the implementation**

In `src/render/content.ts`, after `OCEAN_DEPTH_URL`:

```ts
/** Plan 13b's land-cover raster, gzipped on disk and inflated in the
 *  browser (src/render/landcover/load.ts). No nginx dependency. */
export const COVER_PATH = 'content/landcover/cover.bin.gz'
export const COVER_URL = `${import.meta.env.BASE_URL}${COVER_PATH}`
```

Create `src/render/landcover/load.ts`:

```ts
import coverHeader from '../../../content/landcover/header.json' with { type: 'json' }
import { COVER_URL } from '../content.js'
import { coverByteLength, parseCoverHeader } from './cover.js'

export const COVER_HEADER = parseCoverHeader(coverHeader)

/**
 * Fetches and inflates the land-cover raster. `DecompressionStream` is in
 * every browser this game runs in (WebGPU implies Chromium 113+), and in
 * node 18+, which is what lets the unit test exercise this exact path.
 * The length check mirrors terrain/load.ts's decodeLevel: a truncated or
 * mis-built file fails loudly here, not as a green island.
 */
export async function loadCover(fetchImpl: typeof fetch = fetch): Promise<Uint8Array> {
  const res = await fetchImpl(COVER_URL)
  if (!res.ok || res.body === null) {
    throw new Error(`Failed to fetch land cover (${COVER_URL}): ${res.status} ${res.statusText}`)
  }
  const inflated = await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
  const data = new Uint8Array(inflated)
  const expected = coverByteLength(COVER_HEADER)
  if (data.length !== expected) throw new Error(`land cover inflates to ${data.length} bytes; expected ${expected}`)
  return data
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/render/landcover.test.ts tests/build/dist.test.ts && npx tsc --noEmit && npm run depcruise`
Expected: all passed; exit 0. The dist test builds into a temp dir and takes ~10 s. If `DecompressionStream` is reported undefined, the node version is below 18; this repo runs node 22.

- [ ] **Step 5: Commit**

```bash
git add src/render/landcover/load.ts src/render/content.ts tests/render/landcover.test.ts tests/build/dist.test.ts
git commit -m "Fetch and inflate the land-cover raster in the browser, and ship it with the build"
```

---

### Task 7: Class weights from the raster in the terrain shader

**Files:**
- Modify: `src/render/terrain/surface.ts:50-76`, `src/render/terrain/mesh.ts` (`TerrainMesh` type at :62-68, `createTerrainMesh` at :350, the albedo line at :274)
- Test: `tests/render/scenery.test.ts` (extend), `tests/render/terrainLod.test.ts` and `tests/render/frame.test.ts` must keep passing (they construct the mesh in node).

**Interfaces:**
- Consumes: `COVER_HEADER` from Task 6, `coverByteLength` from Task 3.
- Produces: `type CoverNodes = { texture: DataTexture; ready: UniformNode<number>; halfExtentM: number }`, `terrainSurfaceNode(xz, height, slope, cover: CoverNodes)`, `createCoverNodes(header: CoverHeader): CoverNodes`, `TerrainMesh.setCover(data: Uint8Array): void`.

- [ ] **Step 1: Write the failing test**

Add to `tests/render/scenery.test.ts`:

```ts
import { createTerrainMesh } from '../../src/render/terrain/mesh.js'
import { COVER_HEADER } from '../../src/render/landcover/load.js'
import { coverByteLength } from '../../src/render/landcover/cover.js'

  it('takes the land-cover raster once it arrives, and paints procedurally until then', () => {
    const mesh = createTerrainMesh(header)
    // Before the raster: the shader's `ready` uniform is 0, so the class
    // weights come from Codex's noise-and-height rule and the picture is
    // exactly what shipped in daa1b39. This is also the fallback if the
    // fetch fails: an island, not a brown one.
    expect(mesh.cover.ready.value).toBe(0)
    expect(mesh.cover.texture.image.width).toBe(COVER_HEADER.samples)
    const data = new Uint8Array(coverByteLength(COVER_HEADER))
    data[0] = 255
    mesh.setCover(data)
    expect(mesh.cover.ready.value).toBe(1)
    expect((mesh.cover.texture.image.data as Uint8Array)[0]).toBe(255)
    expect(mesh.cover.texture.needsUpdate).toBe(true)
    expect(() => mesh.setCover(new Uint8Array(16))).toThrow(/16 bytes/)
  })
```

(`header` in that file is the terrain header fixture already at its top.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/render/scenery.test.ts`
Expected: FAIL, "mesh.cover is undefined" or a type error on `setCover`.

- [ ] **Step 3: Write the implementation**

In `src/render/terrain/surface.ts`, replace the imports and `terrainSurfaceNode`:

```ts
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat } from 'three'
import { color, float, max, mix, smoothstep, texture, uniform, vec2 } from 'three/tsl'
import type { Node, UniformNode } from 'three/webgpu'
import { riverMask } from './rivers.js'
import { coverByteLength, type CoverHeader } from '../landcover/cover.js'

export type CoverNodes = {
  readonly texture: DataTexture
  /** 0 until `setCover` has data; the shader blends to the raster on 1. */
  readonly ready: UniformNode<number>
  readonly halfExtentM: number
}

/** The raster texture, zero-filled until the fetch lands, as the terrain
 *  height textures are (mesh.ts). Linear filtering is the whole reason the
 *  raster carries fractions rather than a class index. */
export function createCoverNodes(header: CoverHeader): CoverNodes {
  const tex = new DataTexture(new Uint8Array(coverByteLength(header)), header.samples, header.samples, RGBAFormat)
  tex.name = 'ESA-WorldCover-coverage-fractions'
  tex.minFilter = LinearMipmapLinearFilter
  tex.magFilter = LinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return { texture: tex, ready: uniform(0), halfExtentM: header.halfExtentM }
}
```

and, replacing the body of `terrainSurfaceNode` from `const forestWeight = ...` through the `land` mix, so that the whole function reads:

```ts
export function terrainSurfaceNode(xz: Node<'vec2'>, height: Node<'float'>, slope: Node<'float'>, cover: CoverNodes): Node<'vec3'> {
  const macro = groundNoise(xz, 2800).r
  const patches = groundNoise(vec2(xz.y.negate(), xz.x).add(173), 610).g
  const canopy = groundNoise(xz, 180).g
  const grain = groundNoise(xz, 18).b
  const sand = mix(color(0x958567), color(0xd6c49b), groundNoise(xz, 95).g)
    .mul(grain.mul(0.16).add(0.92))
  const grass = mix(color(0x626746), color(0x89915b), patches).mul(grain.mul(0.15).add(0.94))
  const forest = mix(color(0x294534), color(0x546847), canopy)
    .mul(macro.mul(0.4).add(0.8))
  // Row 0 of the raster is north (z = -half) and DataTexture row 0 sits at
  // v = 0, so v grows with z and no flip is needed: the same convention the
  // river mask uses (rivers.ts). Fractions filter linearly.
  const uv = xz.add(cover.halfExtentM).div(2 * cover.halfExtentM)
  const fractions = texture(cover.texture, uv)
  // Before the raster arrives, or if it never does, the class weights are
  // Codex's noise-and-height rule from daa1b39, unchanged.
  const proceduralForest = max(smoothstep(0.38, 0.64, macro), smoothstep(70, 220, height))
  const forestWeight = mix(proceduralForest, fractions.r.add(fractions.b), cover.ready)
  const cropWeight = fractions.g.mul(cover.ready)
  const mangroveWeight = fractions.b.mul(cover.ready)
  const soil = mix(color(0x655644), color(0x8b795b), groundNoise(xz, 150).g)
  // Paddies: a pale yellow-green with the patch noise at field scale, so the
  // Leyte Valley reads as fields from 3,000 m, which is the job (design §1).
  const paddy = mix(color(0x8a9a4e), color(0xb8b56a), groundNoise(vec2(xz.y, xz.x.negate()), 240).g)
  const mangrove = color(0x24402a)
  const open = mix(grass, soil, smoothstep(0.74, 0.9, patches).mul(0.45))
  const land = mix(mix(mix(open, forest, forestWeight), paddy, cropWeight), mangrove, mangroveWeight)
  const rock = mix(color(0x696c62), color(0x9a9585), groundNoise(xz, 220).g)
    .mul(groundNoise(xz, 26).g.mul(0.35).add(0.82))
  // Tropical summits remain vegetated; steep faces expose rock. No snow line.
  const bare = max(smoothstep(0.48, 1.05, slope), smoothstep(950, 1400, height).mul(0.5))
  const beachToLand = smoothstep(0.4, 2.3, height.add(patches.sub(0.5).mul(0.6)))
  const ground = mix(mix(sand, land, beachToLand), rock, bare)
  const rivers = riverMask()
  const mask = texture(rivers.texture, xz.sub(vec2(rivers.minX, rivers.minZ))
    .div(vec2(rivers.width, rivers.depth))).r
  const wetBank = mix(ground, color(0x68664b), smoothstep(0.05, 0.5, mask).mul(0.8))
  const water = mix(color(0x345455), color(0x65796d), groundNoise(xz, 55).g)
  return mix(wetBank, water, smoothstep(0.45, 0.85, mask))
}
```

In `src/render/terrain/mesh.ts`: import `createCoverNodes`, `type CoverNodes` from `./surface.js` and `COVER_HEADER` from `../landcover/load.js` and `coverByteLength` from `../landcover/cover.js`; extend the type:

```ts
export type TerrainMesh = {
  readonly object: Object3D
  setLevel(level: number, data: Int16Array): void
  update(cameraX: number, cameraZ: number): void
  levelTexture(level: number): DataTexture
  shaderCameraXZ(): Vector2
  /** Plan 13b: the land-cover raster, once fetched. */
  setCover(data: Uint8Array): void
  readonly cover: CoverNodes
}
```

inside `createTerrainMesh`, before the material is built: `const cover = createCoverNodes(COVER_HEADER)`; change the albedo line to `terrainSurfaceNode(varying(worldXZ), varying(heightM), varying(slope), cover)`; and add to the returned object:

```ts
    cover,
    setCover(data: Uint8Array): void {
      const expected = coverByteLength(COVER_HEADER)
      if (data.length !== expected) throw new Error(`land cover is ${data.length} bytes; expected ${expected}`)
      ;(cover.texture.image.data as Uint8Array).set(data)
      cover.texture.needsUpdate = true
      cover.ready.value = 1
    },
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/render && npx tsc --noEmit && npm run lint`
Expected: all passed, including `terrainLod.test.ts` and `frame.test.ts`, which construct the mesh in node; exit 0 everywhere. If `UniformNode` is not exported from `three/webgpu` under that name, use `ReturnType<typeof uniform<number>>` and say so in a comment.

- [ ] **Step 5: Commit**

```bash
git add src/render/terrain/surface.ts src/render/terrain/mesh.ts tests/render/scenery.test.ts
git commit -m "Paint the terrain's classes from the WorldCover raster, procedurally until it arrives"
```

---

### Task 8: Tree density from the raster

**Files:**
- Modify: `src/render/scene/vegetation.ts` (`treeSites`, `createVegetation`)
- Test: `tests/render/scenery.test.ts` (extend)

**Interfaces:**
- Consumes: `coverFractionsAt`, `CoverHeader` from Task 3; `COVER_HEADER` from Task 6.
- Produces: `type CoverLookup = { fractionsAt(x: number, z: number): { tree: number; crop: number; mangrove: number; open: number } }`, `coverLookup(data: Uint8Array, header?: CoverHeader): CoverLookup`, `treeSites(field, cellX, cellZ, cover?: CoverLookup)`, vegetation object gains `setCover(cover: CoverLookup): void`.

- [ ] **Step 1: Write the failing test**

Add to `tests/render/scenery.test.ts`:

```ts
import { coverLookup } from '../../src/render/scene/vegetation.js'

  it('plants by the tree fraction: dense jungle, bare paddies, mangroves at the waterline', () => {
    const bytes = coverByteLength(COVER_HEADER)
    const uniformCover = (tree: number, crop: number, mangrove: number, open: number) => {
      const data = new Uint8Array(bytes)
      for (let i = 0; i < bytes; i += 4) { data[i] = quantize(tree); data[i + 1] = quantize(crop); data[i + 2] = quantize(mangrove); data[i + 3] = quantize(open) }
      return coverLookup(data)
    }
    // An inland cell with real relief (the same cell the crossing test uses).
    const jungle = treeSites(field, -103, -77, uniformCover(1, 0, 0, 0)).length
    const paddy = treeSites(field, -103, -77, uniformCover(0, 1, 0, 0)).length
    const half = treeSites(field, -103, -77, uniformCover(0.5, 0.5, 0, 0)).length
    const procedural = treeSites(field, -103, -77).length
    expect(paddy).toBe(0)
    expect(jungle).toBe(procedural)            // full tree cover keeps every site the old rule kept
    expect(half).toBeGreaterThan(jungle * 0.3)
    expect(half).toBeLessThan(jungle * 0.7)
    // Determinism survives the raster: the same cell, the same forest.
    expect(treeSites(field, -103, -77, uniformCover(0.5, 0.5, 0, 0))).toEqual(treeSites(field, -103, -77, uniformCover(0.5, 0.5, 0, 0)))
    // Mangroves grow below the 3 m shore exclusion that keeps jungle off the beach.
    const shoreCell = { x: Math.floor(-30000 / TREE_CELL_M), z: Math.floor(-46000 / TREE_CELL_M) }
    const lowSites = (sites: ReturnType<typeof treeSites>) => sites.filter(t => t.y < 3).length
    expect(lowSites(treeSites(field, shoreCell.x, shoreCell.z, uniformCover(1, 0, 0, 0)))).toBe(0)
    expect(lowSites(treeSites(field, shoreCell.x, shoreCell.z, uniformCover(0, 0, 1, 0)))).toBeGreaterThan(0)
  })

  it('rebuilds the forest when the raster arrives', () => {
    const vegetation = createVegetation(field)
    vegetation.update(-40900, -30666)
    const crowns = vegetation.object.children[0] as InstancedMesh
    const before = crowns.count
    const data = new Uint8Array(coverByteLength(COVER_HEADER))   // all zero: no tree cover anywhere
    vegetation.setCover(coverLookup(data))
    expect(crowns.count).toBe(0)
    expect(before).toBeGreaterThan(0)
  })
```

(`quantize` and `coverByteLength` are imported from `../../src/render/landcover/cover.js`; `COVER_HEADER` from `../../src/render/landcover/load.js`; if the shore cell has no site at any height, move it one cell east until `treeSites(...)` with full tree cover returns at least 20 sites, and record the cell you used in the test.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/render/scenery.test.ts`
Expected: FAIL, `coverLookup` is not exported.

- [ ] **Step 3: Write the implementation**

In `src/render/scene/vegetation.ts`, add after the imports:

```ts
import { coverFractionsAt, type CoverHeader } from '../landcover/cover.js'
import { COVER_HEADER } from '../landcover/load.js'

export type CoverLookup = { fractionsAt(x: number, z: number): { tree: number; crop: number; mangrove: number; open: number } }

/** CPU twin of the shader's raster read: nearest sample, same bytes. */
export function coverLookup(data: Uint8Array, header: CoverHeader = COVER_HEADER): CoverLookup {
  return { fractionsAt: (x, z) => coverFractionsAt(data, header, x, z) }
}
```

Change `treeSites`:

```ts
/** Stable per-cell placement. Camera motion never rerolls the forest.
 *  With a cover lookup (Plan 13b) a candidate survives with probability
 *  equal to the local tree-plus-mangrove fraction, drawn from the same
 *  per-cell stream so determinism holds; without one, every candidate
 *  survives, which is the daa1b39 forest. Mangrove (fraction above 0.25)
 *  lifts the 3 m shore exclusion to 0.5 m: that is where mangroves grow. */
export function treeSites(field: TerrainField, cellX: number, cellZ: number, cover?: CoverLookup): TreeSite[] {
  let seed = (Math.imul(cellX, 73856093) ^ Math.imul(cellZ, 19349663) ^ 1944) >>> 0
  const random = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  const sites: TreeSite[] = []
  for (let i = 0; i < TREES_PER_CELL; i++) {
    const x = (cellX + random()) * TREE_CELL_M, z = (cellZ + random()) * TREE_CELL_M
    const height = 12 + random() * 15, radius = 6 + random() * 5, shade = random()
    const roll = random()
    const f = cover?.fractionsAt(x, z)
    if (f && roll >= f.tree + f.mangrove) continue
    const shoreM = f && f.mangrove > 0.25 ? 0.5 : 3
    const y = heightAt(field, x, z)
    if (y < shoreM || y > 1250 || inAirfieldClearing(x, z) || nearRiver(x, z)) continue
    const slope = Math.hypot(heightAt(field, x + 10, z) - heightAt(field, x - 10, z),
      heightAt(field, x, z + 10) - heightAt(field, x, z - 10)) / 20
    if (slope > 0.65) continue
    sites.push({ x, y, z, height, radius, shade })
  }
  return sites
}
```

Note the `roll` is drawn unconditionally, before the cover check, so the site stream is identical with and without a raster: that is what makes the `jungle === procedural` assertion hold.

In `createVegetation`: add `setCover(cover: CoverLookup): void` to the returned type and object; keep `let cover: CoverLookup | undefined`; pass `cover` to `treeSites(field, cx + dx, cz + dz, cover)`; and implement:

```ts
    setCover(next): void {
      cover = next
      cache = new Map()
      previousKey = ''
      this.update(lastX, lastZ)
    },
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/render/scenery.test.ts && npx tsc --noEmit && npm run lint && npm run depcruise`
Expected: all passed; exit 0. The existing "generates only the cells that entered" and "byte-identical on return" tests must still pass unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/render/scene/vegetation.ts tests/render/scenery.test.ts
git commit -m "Plant trees by the WorldCover tree fraction, and let mangroves reach the waterline"
```

---

### Task 9: Wire it into boot, measure on the GPU, hand off

**Files:**
- Modify: `src/render/main.ts` (imports; after `const terrain = createTerrainMesh(TERRAIN_HEADER)` at ~:336; the `arrived` block at ~:887)
- Modify: `tests/e2e/terrain.spec.ts` (the budget table comment only, if the number moves)
- Create: `docs/handoff/2026-09-18-plan13b-land-cover.md`
- Modify: `docs/superpowers/specs/2026-09-12-ww2airsim-design.md` (the 13b row of the §15 table)

**Interfaces:**
- Consumes: `loadCover` (Task 6), `coverLookup` (Task 8), `terrain.setCover` (Task 7), `vegetation.setCover` (Task 8).

- [ ] **Step 1: Wire the load**

In `src/render/main.ts`, add imports:

```ts
import { loadCover } from './landcover/load.js'
import { coverLookup, type CoverLookup } from './scene/vegetation.js'
```

(merge the second into the existing `createVegetation` import line). After `const terrain = createTerrainMesh(TERRAIN_HEADER)`:

```ts
  // Plan 13b. The raster and the terrain levels race; whichever lands
  // second finds the other ready. A failed fetch leaves the procedural
  // paint (surface.ts's `ready` uniform) and the daa1b39 forest, logged,
  // not fatal: land cover is a picture, terrain is the ground.
  let cover: CoverLookup | null = null
  void loadCover().then(data => {
    terrain.setCover(data)
    cover = coverLookup(data)
    vegetation?.setCover(cover)
  }).catch((err: unknown) => {
    console.warn('land cover unavailable, painting procedurally:', err)
  })
```

In the `arrived` block, after `vegetation.setTier(oceanTier.name)`:

```ts
      if (cover !== null) vegetation.setCover(cover)
```

- [ ] **Step 2: Verify locally**

Run: `npm run verify && npm run build`
Expected: exit 0 for both. Check the exit codes, not the grep.

- [ ] **Step 3: Tier 2 on the reference desktop**

The Windows Playwright server must be running in Mark's console session (README, Tier 2 section). On nexus, with `npm run dev:lan` serving this checkout and the control tunnel up (`ss -ltn | grep 39001`, else `ssh -N -L 39001:127.0.0.1:3000 ryzen &`):

```sh
PW_REMOTE=ws://localhost:39001/ PW_BASE_URL=https://ww2airsim.windomlane.org npm run test:tier2 2>&1 | tee /tmp/tier2-13b.log
grep -E 'frame-time budget:|passed|failed' /tmp/tier2-13b.log
```

Expected: 24 passed, or 23 with one `net::ERR_QUIC_PROTOCOL_ERROR` at `page.goto` that passes on re-run (`npx playwright test tests/e2e/ocean.spec.ts -g "<name>"`). Record the `frame-time budget:` line. It must stay under 6.0 ms p95; the raster is one filtered sample per fragment and the river mask's identical sample measured 0.1 ms, so expect about 5.1 ms p50. If it is over 6.0, do not widen: bisect as 13a's handoff describes (throwaway worktree on port 5183) and report.

- [ ] **Step 4: Look at it**

Write a throwaway spec (delete it after; never commit it):

```ts
// tests/e2e/zz-look.spec.ts
import { test } from '@playwright/test'
import { waitForTerrain } from './harness.js'
test('13b views', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 })
  for (const [name, url] of [
    ['valley', '/?spawnX=-43652&spawnY=2500&spawnZ=-28939&sceneryView=1'],   // Dagami plain, 11.06 N 124.90 E (toLocal, 2026-09-18)
    ['shore', '/?spawnX=-24317&spawnY=600&spawnZ=-54383&sceneryView=1'],     // San Juanico mangrove shore, 11.289 N 125.077 E
    ['cruise', '/?spawnX=-45000&spawnY=3000&spawnZ=-47605'],                 // the budget spawn
  ] as const) {
    await page.goto(url)
    await waitForTerrain(page)
    await page.waitForTimeout(5000)
    await page.screenshot({ path: `/tmp/ww2-13b-${name}.png` })
  }
})
```

Run it with the same `PW_REMOTE`/`PW_BASE_URL`, then read each PNG with the Read tool. What to check, in this order: the valley is pale field colour and nearly treeless; the shore has trees at the waterline and a dark green band; at cruise the island reads as forest hills with plains, not as one green. If a view is wrong, the fix is in Task 7's weights or Task 8's rule, never in a threshold in a test. Mark stays out of this loop; the screenshots go in the handoff by path only.

- [ ] **Step 5: Hand off and close the roadmap row**

Create `docs/handoff/2026-09-18-plan13b-land-cover.md` with: the commits, the `npm run verify` totals, the Tier 2 result and the budget line, the three screenshot paths and one sentence on each, the raster's on-disk size, and anything left for 13c (the sampler's sea-connectivity is 13c's first task). In `docs/superpowers/specs/2026-09-12-ww2airsim-design.md`, change the 13b row's status to `Complete <date>; [handoff](../../handoff/2026-09-18-plan13b-land-cover.md)` and, in `docs/superpowers/plans/2026-09-18-land-cover.md` (this file), tick every box of every task.

- [ ] **Step 6: Commit and push**

```bash
git add src/render/main.ts docs/handoff/2026-09-18-plan13b-land-cover.md docs/superpowers/specs/2026-09-12-ww2airsim-design.md docs/superpowers/plans/2026-09-18-land-cover.md
git commit -m "Wire the land cover into boot, measure it on the reference GPU, and hand off Plan 13b"
git push origin main
```

Production is deployed only by `gh workflow run deploy.yml --repo coder999/ww2airsim`, and only when Mark asks.
