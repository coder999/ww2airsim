/**
 * GEBCO_2026 via CEDA OPeNDAP, verified 2026-09-15. Int16 elevation
 * [lat=43200][lon=86400], metres relative to assumed mean sea level; WGS84
 * horizontal coordinates. Cell centres are -90+(j+.5)/240, -180+(i+.5)/240.
 * ASCII is a small, auditable once-only download; no NetCDF dependency.
 * Source rows run SOUTH to NORTH, columns WEST to EAST. The build reverses
 * the row convention when projecting onto the game's north-first grid.
 */
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { toGeodetic, WORLD_CENTRE } from '../../src/sim/world/projection.js'

const ENDPOINT = 'https://dap.ceda.ac.uk/thredds/dodsC/bodc/gebco/global/gebco_2026/ice_surface_elevation/netcdf/GEBCO_2026.nc'
export const CACHE_DIR = fileURLToPath(new URL('./cache', import.meta.url))
export type WorldBox = { centreLatDeg: number; centreLonDeg: number; halfExtentM: number }
export type SubsetWindow = { latStart: number; latCount: number; lonStart: number; lonCount: number }
export type Subset = { window: SubsetWindow; elevations: Int16Array; latitudes: number[]; longitudes: number[] }

export function subsetWindow(header: WorldBox, marginSamples: number): SubsetWindow {
  if (header.centreLatDeg !== WORLD_CENTRE.latDeg || header.centreLonDeg !== WORLD_CENTRE.lonDeg) {
    throw new Error('bathy: header centre does not match the world projection')
  }
  if (!Number.isFinite(header.halfExtentM) || header.halfExtentM <= 0 || header.halfExtentM > 200_000 ||
      !Number.isInteger(marginSamples) || marginSamples < 1) {
    throw new Error('bathy: expected a local world box and positive integer margin')
  }
  // Include edge midpoints: maximum latitude occurs north of the centre,
  // not at either northern corner of the azimuthal-equidistant box.
  const points = [-1, 0, 1].flatMap((z) => [-1, 0, 1].map((x) =>
    toGeodetic(x * header.halfExtentM, z * header.halfExtentM)))
  const latIndex = points.map((p) => (p.latDeg + 90) * 240 - 0.5)
  const lonIndex = points.map((p) => (p.lonDeg + 180) * 240 - 0.5)
  const latStart = Math.floor(Math.min(...latIndex)) - marginSamples
  const lonStart = Math.floor(Math.min(...lonIndex)) - marginSamples
  const latCount = Math.ceil(Math.max(...latIndex)) + marginSamples - latStart + 1
  const lonCount = Math.ceil(Math.max(...lonIndex)) + marginSamples - lonStart + 1
  const window = { latStart, latCount, lonStart, lonCount }
  validateWindow(window)
  return window
}

function validateWindow(w: SubsetWindow): void {
  if (![w.latStart, w.lonStart, w.latCount, w.lonCount].every(Number.isInteger) ||
      w.latStart < 0 || w.lonStart < 0 || w.latCount < 2 || w.lonCount < 2 ||
      w.latStart + w.latCount > 43200 || w.lonStart + w.lonCount > 86400) {
    throw new Error('bathy: subset outside the global grid')
  }
}

export function opendapUrl(w: SubsetWindow): string {
  validateWindow(w)
  return `${ENDPOINT}.ascii?elevation[${w.latStart}:${w.latStart + w.latCount - 1}][${w.lonStart}:${w.lonStart + w.lonCount - 1}]`
}

/** Reject truncated, reordered, non-numeric, or geographically wrong caches. */
export function parseSubset(text: string, window: SubsetWindow): Subset {
  validateWindow(window)
  const { latCount, lonCount } = window
  const lines = text.trim().split(/\r?\n/)
  const start = lines.indexOf(`elevation.elevation[${latCount}][${lonCount}]`)
  if (start < 0) throw new Error('bathy: unexpected elevation dimensions')
  const elevations = new Int16Array(latCount * lonCount)
  for (let row = 0; row < latCount; row++) {
    const match = lines[start + 1 + row]?.match(/^\[(\d+)\], (.+)$/)
    if (!match || Number(match[1]) !== row) throw new Error(`bathy: missing source row ${row}`)
    const values = match[2]!.split(',').map((v) => v.trim() === '' ? NaN : Number(v))
    if (values.length !== lonCount || !values.every((v) => Number.isInteger(v) && v > -32768 && v <= 32767)) {
      throw new Error(`bathy: invalid elevations in row ${row}`)
    }
    elevations.set(values, row * lonCount)
  }
  const coordinates = (axis: 'lat' | 'lon', count: number, index: number, offset: number): number[] => {
    const pos = lines.indexOf(`elevation.${axis}[${count}]`)
    if (pos < 0) throw new Error(`bathy: missing ${axis} map`)
    const values = (lines[pos + 1] ?? '').split(',').map(Number)
    if (values.length !== count || values.some((v, i) => !Number.isFinite(v) ||
      Math.abs(v - (offset + (index + i + 0.5) / 240)) > 1e-9)) {
      throw new Error(`bathy: unexpected ${axis} coordinates`)
    }
    return values
  }
  return { window, elevations,
    latitudes: coordinates('lat', latCount, window.latStart, -90),
    longitudes: coordinates('lon', lonCount, window.lonStart, -180) }
}

export function terrainBox(): WorldBox {
  const { centreLatDeg, centreLonDeg, halfExtentM } = JSON.parse(readFileSync(new URL('../../content/terrain/header.json', import.meta.url), 'utf8')) as WorldBox
  return { centreLatDeg, centreLonDeg, halfExtentM }
}

export async function fetchSubset(cacheDir: string): Promise<string> {
  const w = subsetWindow(terrainBox(), 4)
  const path = join(cacheDir, `gebco-2026-${w.latStart}-${w.latCount}-${w.lonStart}-${w.lonCount}.ascii`)
  if (existsSync(path)) {
    parseSubset(readFileSync(path, 'utf8'), w)
    return path
  }
  mkdirSync(cacheDir, { recursive: true })
  const response = await globalThis.fetch(opendapUrl(w), { signal: AbortSignal.timeout(120_000) })
  if (!response.ok) throw new Error(`bathy: HTTP ${response.status}`)
  const text = await response.text()
  parseSubset(text, w)
  const part = `${path}.part`
  try {
    writeFileSync(part, text)
    renameSync(part, path)
  } finally { rmSync(part, { force: true }) }
  console.log(`bathy: cached ${Buffer.byteLength(text)} bytes in ${path}`)
  return path
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fetchSubset(CACHE_DIR).then((p) => {
    const s = parseSubset(readFileSync(p, 'utf8'), subsetWindow(terrainBox(), 4))
    const row = Math.round((WORLD_CENTRE.latDeg + 90) * 240 - 0.5) - s.window.latStart
    const col = Math.round((WORLD_CENTRE.lonDeg + 180) * 240 - 0.5) - s.window.lonStart
    const range = s.elevations.reduce(([lo, hi], v) => [Math.min(lo!, v), Math.max(hi!, v)], [Infinity, -Infinity])
    console.log(`nearest centre elevation ${s.elevations[row * s.window.lonCount + col]} m; source range ${range.join(' to ')} m`)
  }).catch((err: unknown) => { console.error(err); process.exitCode = 1 })
}
