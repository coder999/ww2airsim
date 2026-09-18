import { mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
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
  // A zero-byte file is treated as absent: it is what an out-of-disk or a
  // killed process leaves behind, and it is indistinguishable from a cached
  // tile by existence alone.
  try {
    if (statSync(path).size > 0) return path
  } catch {
    // not cached; fall through
  }
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
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength === 0) throw new Error(`fetch ${url}: empty body`)
  return bytes
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
