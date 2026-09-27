import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { TEXTURE_CACHE } from './ktxTool.js'

/** Where `url` lands in the cache (its last path segment). */
export const pinnedCachePath = (url: string, cacheDir: string = TEXTURE_CACHE): string => join(cacheDir, url.split('/').pop()!)

/** Downloads `url` once into the cache and refuses it unless its MD5 is `md5`. Returns the file. */
export async function fetchPinned(url: string, md5: string, cacheDir: string = TEXTURE_CACHE): Promise<string> {
  mkdirSync(cacheDir, { recursive: true })
  const file = pinnedCachePath(url, cacheDir)
  if (!existsSync(file)) {
    const res = await globalThis.fetch(url, { headers: { 'User-Agent': 'ww2airsim-textures-build' } })
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
    writeFileSync(file, new Uint8Array(await res.arrayBuffer()))
  }
  const got = createHash('md5').update(readFileSync(file)).digest('hex')
  if (got !== md5) throw new Error(`${file}: md5 ${got}, expected ${md5}`)
  return file
}
