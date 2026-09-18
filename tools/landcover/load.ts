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
