// tests/tools/models/sketchfabEntries.test.ts
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { loadModelEntries } from '../../../tools/models/manifest.js'
import { nodeBuildDeps, runBuild } from '../../../tools/models/build.js'

/**
 * Every Sketchfab entry's raw download, in nexus's store (tools/models/raws.ts), is the one its
 * entry records, and rebuilds the committed output byte for byte. The second check is what
 * blenderEntries.test.ts already did for scripts; without it, a stage change could leave a committed
 * download-built model that its own tools no longer produce, which is what happened to the B-17 on
 * 2026-10-08 (doors cut by an earlier cut stage, merged beside a later one). remote-run mirrors the
 * store to ryzen (.remote-run-data), so both machines run this; a raw absent here is a named skip, and
 * `npm run models:raws -- --restore` refills it.
 */
const entries = loadModelEntries().filter((e) => e.input !== undefined)
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')

it('the Sketchfab entries are the thirteen downloads, each with its recorded hash (2026-10-08; Zuikaku in, M1e; Mogami, Yamato, Cleveland and Essex out to Blender, M1f, 2026-10-09)', () => {
  expect(entries).toHaveLength(13)
  for (const e of entries) expect(e.inputSha256, e.id).toMatch(/^[0-9a-f]{64}$/)
})

describe.each(entries.map((e) => [e.id, e] as const))('%s', (id, entry) => {
  const present = existsSync(entry.input!)
  it.skipIf(!present)('its raw in the store is the recorded download', () => {
    expect(sha(new Uint8Array(readFileSync(entry.input!)))).toBe(entry.inputSha256)
  })
  it.skipIf(!present)('rebuilds its committed output byte for byte', async () => {
    const written = new Map<string, Uint8Array>()
    const lines: string[] = []
    const deps = { ...nodeBuildDeps(), write: (p: string, b: Uint8Array) => { written.set(p, b) }, log: (l: string) => { lines.push(l) } }
    expect(await runBuild([entry], [id], deps), lines.join('\n')).toBe(0)
    expect(sha(written.get(entry.output)!)).toBe(sha(new Uint8Array(readFileSync(entry.output))))
  }, 600_000)
})
