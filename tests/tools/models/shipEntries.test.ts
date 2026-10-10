// tests/tools/models/shipEntries.test.ts
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { loadModelEntries } from '../../../tools/models/manifest.js'
import { nodeBuildDeps, runBuild } from '../../../tools/models/build.js'

const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')
const downloads = loadModelEntries().filter((e) => e.ship && e.source.kind === 'sketchfab')

// Raw inputs are gitignored in tools/models/cache/ (remote-run mirrors them to ryzen): a missing one
// skips its entry by name; re-fetch it with tools/models/sketchfab-fetch.sh <uid> <name>.
describe('downloaded ships rebuild byte-identically from their raw inputs (DP2)', () => {
  for (const e of downloads) {
    it.skipIf(!existsSync(e.input!))(`${e.id} (raw ${e.input})`, async () => {
      const written = new Map<string, Uint8Array>()
      const deps = { ...nodeBuildDeps(), write: (p: string, b: Uint8Array) => { written.set(p, b) }, log: () => {} }
      expect(await runBuild([e], [e.id], deps)).toBe(0)
      expect(sha(written.get(e.output)!)).toBe(sha(new Uint8Array(readFileSync(e.output))))
    }, 120_000)
  }
})

