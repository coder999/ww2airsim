// tests/tools/models/shipEntries.test.ts
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { loadModelEntries } from '../../../tools/models/manifest.js'
import { nodeBuildDeps, runBuild } from '../../../tools/models/build.js'
import { modelIO } from '../../../tools/models/document.js'
import { soupHash } from './soupHash.js'

const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')
const downloads = loadModelEntries().filter((e) => e.ship && e.source.kind === 'sketchfab')

/** The four box-skinned downloads' triangles, hashed from their flat committed outputs before DP2
 *  skinned them (Task 10 Step 1, 2026-09-28). Box projection adds UVs and never moves a vertex.
 *  Re-pinned per ship by Track M's M1 (2026-10-08), whose mount kits carve the guns out, keep one
 *  copy of each kit posed in place and add generated kits: each re-pin is its own commit, saying why. */
const FLAT_SOUP: Readonly<Record<string, string>> = {
  'cleveland-cl': '248de4ec470db281ee272e0f7230a724630f4c8da0606d9b93742e3dedd694af',
  'essex-cv': 'f9a6769bdeec92a7ca8a34d5b29f065a833f8759c3a3af180b6f29fc73fe279b',
  'mogami-ca': 'ac7cadfdf0467d5ba4624f7692fa782839dcb63237d1ef175b04cf1f425096f1',
  'yamato-bb': '32ee71102f8cb9eb6b5893a98ecced653d6a4606f195bc1ec00255a4fd9ad3ef',
}

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

describe('box-skinned downloads keep their geometry (DP2, Review Focus 2)', () => {
  it.each(Object.keys(FLAT_SOUP))('%s draws the same triangles as its flat predecessor', async (id) => {
    const e = downloads.find((x) => x.id === id)!
    expect(soupHash(await modelIO().readBinary(new Uint8Array(readFileSync(e.output))))).toBe(FLAT_SOUP[id])
  })
})
