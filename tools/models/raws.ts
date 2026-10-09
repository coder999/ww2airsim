// tools/models/raws.ts
/**
 * The raw Sketchfab downloads' one home is nexus's gitignored tools/models/cache (Mark, 2026-10-08:
 * "a single source of truth"). Each entry records its raw's SHA-256, so this checks the store and,
 * with --restore, refills it from the places copies have been found, proving each by its hash:
 *   - content/models/candidates/ (where sketchfab-fetch.sh first puts a download)
 *   - dist/content/models/ (a stale build copy, 2026-09-24)
 *   - ryzen's remote-run mirror (one-way from nexus, so it outlives a deletion here)
 * On 2026-10-08, 11 of 16 were missing, and every one turned up in those three places.
 *
 * `npm run models:raws` lists every entry's raw and exits 1 if any is missing or wrong.
 * `npm run models:raws -- --restore` fills the gaps first.
 */
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadModelEntries } from './manifest.js'

const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')
const RYZEN_MIRROR = '/home/markt/remote-run/ww2airsim/tools/models/cache'

/** Where a raw might be, best first. Each returns its bytes or null. */
const SOURCES: readonly { readonly name: string; readonly get: (file: string) => Uint8Array | null }[] = [
  { name: 'content/models/candidates', get: (f) => local(`content/models/candidates/${f}`) },
  { name: 'dist/content/models', get: (f) => local(`dist/content/models/${f}`) },
  {
    name: 'ryzen remote-run mirror',
    get: (f) => {
      // ryzen's SSH lands in PowerShell; WSL's cat streams the bytes cleanly (hash-checked below).
      const r = spawnSync('ssh', ['-o', 'ConnectTimeout=8', 'ryzen', `wsl -e cat ${RYZEN_MIRROR}/${f}`], { maxBuffer: 256 * 1024 * 1024, timeout: 600_000 })
      return r.status === 0 && r.stdout.length > 0 ? new Uint8Array(r.stdout) : null
    },
  },
]

function local(p: string): Uint8Array | null {
  return existsSync(p) ? new Uint8Array(readFileSync(p)) : null
}

export type RawStatus = 'ok' | 'missing' | 'wrong'

export function rawStatus(path: string, want: string, read: (p: string) => Uint8Array | null = local): RawStatus {
  const b = read(path)
  return b === null ? 'missing' : sha(b) === want ? 'ok' : 'wrong'
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const restore = process.argv.includes('--restore')
  let bad = 0
  for (const e of loadModelEntries()) {
    if (e.input === undefined || e.inputSha256 === undefined) continue
    let status = rawStatus(e.input, e.inputSha256)
    let from = ''
    if (status !== 'ok' && restore) {
      for (const s of SOURCES) {
        const b = s.get(basename(e.input))
        if (b === null || sha(b) !== e.inputSha256) continue
        // Write beside, then rename: an interrupted copy never sits in the store under the real name.
        writeFileSync(`${e.input}.part`, b)
        renameSync(`${e.input}.part`, e.input)
        status = 'ok'
        from = ` (restored from ${s.name})`
        break
      }
    }
    if (status !== 'ok') bad++
    console.log(`${status.padEnd(7)} ${e.id.padEnd(22)} ${e.input}${from}`)
  }
  if (bad) console.log(`${bad} raw input(s) not in the store${restore ? ' and not found anywhere' : '; try --restore'}`)
  process.exit(bad ? 1 : 0)
}
