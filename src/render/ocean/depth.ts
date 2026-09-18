import oceanHeader from '../../../content/ocean/header.json' with { type: 'json' }
import terrainHeader from '../../../content/terrain/header.json' with { type: 'json' }
import { OCEAN_DEPTH_URL } from '../content.js'
import { parseOceanHeader, type OceanHeader } from './schema.js'

/** Out-of-box fallback, rounded beyond the measured -7971 m source minimum.
 * It means fully deep-water shading, not a claim about unsampled geography. */
export const OUTSIDE_DEPTH_M = -8000
export type DepthField = { readonly header: OceanHeader; readonly samples: Int16Array }
export const OCEAN_HEADER = parseOceanHeader(oceanHeader)

/** Int16 metres, LE, row-major: row 0 NORTH, column 0 WEST. */
export function decodeDepth(bytes: ArrayBuffer, samples: number): Int16Array {
  if (!Number.isInteger(samples) || samples < 1 || bytes.byteLength !== samples * samples * 2) {
    throw new Error(`ocean: ${bytes.byteLength} bytes cannot encode ${samples} square int16 samples`)
  }
  const view = new DataView(bytes)
  const out = new Int16Array(samples * samples)
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true)
  return out
}

export function createDepthField(rawHeader: OceanHeader, samples: Int16Array): DepthField {
  const header = parseOceanHeader(rawHeader)
  if (samples.length !== header.samples ** 2) throw new Error('ocean: sample count does not match header')
  return { header, samples }
}

/** Bilinear elevation in metres, clamped to water depth. Row 0 is NORTH.
 * Terrain owns land elevation; positive values never escape this sampler. */
export function depthAt(field: DepthField, x: number, z: number): number {
  const { halfExtentM: h, samples: n } = field.header
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > h || Math.abs(z) > h) return OUTSIDE_DEPTH_M
  const col = (x + h) / (2 * h) * (n - 1)
  const row = (z + h) / (2 * h) * (n - 1)
  const ix = Math.min(Math.floor(col), n - 2)
  const iz = Math.min(Math.floor(row), n - 2)
  const fx = col - ix
  const fz = row - iz
  const at = (dx: number, dz: number) => field.samples[(iz + dz) * n + ix + dx]!
  return Math.min(0, (1 - fz) * ((1 - fx) * at(0, 0) + fx * at(1, 0)) +
    fz * ((1 - fx) * at(0, 1) + fx * at(1, 1)))
}

export async function loadDepth(fetchImpl: typeof fetch = fetch): Promise<DepthField> {
  for (const key of ['centreLatDeg', 'centreLonDeg', 'halfExtentM'] as const) {
    if (OCEAN_HEADER[key] !== terrainHeader[key]) throw new Error(`ocean: terrain grid mismatch at ${key}`)
  }
  if (OCEAN_HEADER.samples !== (terrainHeader.finestSamples - 1) / 16 + 1) throw new Error('ocean: expected terrain L4 grid')
  const response = await fetchImpl(OCEAN_DEPTH_URL)
  if (!response.ok) throw new Error(`ocean depth fetch failed: HTTP ${response.status}`)
  return createDepthField(OCEAN_HEADER, decodeDepth(await response.arrayBuffer(), OCEAN_HEADER.samples))
}
