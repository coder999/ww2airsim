import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const TEXTURE_CACHE = fileURLToPath(new URL('./cache/', import.meta.url)) // gitignored: /tools/**/cache/
const VERSION = '4.4.2'
const TARBALL = `KTX-Software-${VERSION}-Linux-x86_64.tar.bz2`
const URL_ = `https://github.com/KhronosGroup/KTX-Software/releases/download/v${VERSION}/${TARBALL}`
/** The release's own .sha1, checked 2026-09-25. */
const SHA1 = 'c6b08c817f8c8dd299deccae4f2fbb8d55e9acd2'

/** Path to a verified `ktx` 4.4.2 binary, downloading it once into the cache.
 *  Linux x86_64 only: the build is run on nexus. */
export async function ktxBinary(): Promise<string> {
  if (process.platform !== 'linux' || process.arch !== 'x64') throw new Error(`textures:build needs Linux x86_64 (KTX-Software ${VERSION} tarball); this is ${process.platform}/${process.arch}`)
  mkdirSync(TEXTURE_CACHE, { recursive: true })
  const bin = join(TEXTURE_CACHE, `KTX-Software-${VERSION}-Linux-x86_64`, 'bin', 'ktx')
  if (existsSync(bin)) return bin
  const tar = join(TEXTURE_CACHE, TARBALL)
  if (!existsSync(tar)) {
    const res = await globalThis.fetch(URL_)
    if (!res.ok) throw new Error(`${URL_}: HTTP ${res.status}`)
    writeFileSync(tar, new Uint8Array(await res.arrayBuffer()))
  }
  const got = createHash('sha1').update(readFileSync(tar)).digest('hex')
  if (got !== SHA1) throw new Error(`${TARBALL}: sha1 ${got}, expected ${SHA1}`)
  execFileSync('tar', ['xjf', tar, '-C', TEXTURE_CACHE])
  const version = execFileSync(bin, ['--version'], { encoding: 'utf8' })
  if (!version.includes(`v${VERSION}`)) throw new Error(`ktx reports ${version.trim()}, expected v${VERSION}`)
  return bin
}
