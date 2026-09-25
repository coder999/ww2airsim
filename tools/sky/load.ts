import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { curlByteLength, weatherByteLength, detailByteLength, shapeByteLength } from '../../src/render/sky/noise.js'

export const SKY_DIR = fileURLToPath(new URL('../../content/sky/', import.meta.url))
export const shapePath = (): string => join(SKY_DIR, 'shape.bin.gz')
export const detailPath = (): string => join(SKY_DIR, 'detail.bin.gz')
export const curlPath = (): string => join(SKY_DIR, 'curl.bin.gz')
export const weatherPath = (): string => join(SKY_DIR, 'weather.bin.gz')
const inflate = (path: string, expected: number): Uint8Array => {
  const data = new Uint8Array(gunzipSync(readFileSync(path)))
  if (data.length !== expected) throw new Error(`${path} inflates to ${data.length} bytes; expected ${expected}`)
  return data
}
/** The committed volumes, inflated; Node only. `src/render/sky/load.ts` is the browser twin. */
export const loadShape = (): Uint8Array => inflate(shapePath(), shapeByteLength())
export const loadDetail = (): Uint8Array => inflate(detailPath(), detailByteLength())
export const loadCurl = (): Uint8Array => inflate(curlPath(), curlByteLength())
export const loadWeather = (): Uint8Array => inflate(weatherPath(), weatherByteLength())
