import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { getBounds } from '@gltf-transform/functions'
import { loadModelEntries } from '../../../tools/models/manifest.js'
import { nodeBuildDeps, runBuild } from '../../../tools/models/build.js'
import { HAVE_BLENDER } from '../../../tools/models/blender/run.js'
import { modelIO } from '../../../tools/models/document.js'

const blenderEntries = loadModelEntries().filter((e) => e.source.kind === 'blender')
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')
const within1pct = (got: number, want: number, label: string): void => {
  expect(Math.abs(got - want) / want, `${label}: measured ${got}, cited ${want}`).toBeLessThanOrEqual(0.01)
}

describe('blender entries (R1)', () => {
  it('there is at least one, and every script exists', () => {
    expect(blenderEntries.map((e) => e.id)).toContain('hangar')
    for (const e of blenderEntries) if (e.source.kind === 'blender') expect(existsSync(e.source.script), e.source.script).toBe(true)
  })

  it("the hangar's committed output fits Tacloban's cited footprint, measured without Blender (spec §7)", async () => {
    const tacloban = JSON.parse(readFileSync('content/bases/tacloban.json', 'utf8')) as { buildings: { id: string; widthM: number; lengthM: number }[] }
    const cited = tacloban.buildings.find((b) => b.id === 'tacloban-hangar-1')!
    const doc = await modelIO().readBinary(new Uint8Array(readFileSync('content/buildings/hangar.glb')))
    const bb = getBounds(doc.getRoot().listScenes()[0]!)
    // The slab is the footprint plus 1 m (hangar.py), and its top is the ground plane.
    within1pct(bb.max[0] - bb.min[0], cited.widthM + 1, 'slab width (x)')
    within1pct(bb.max[2] - bb.min[2], cited.lengthM + 1, 'slab length (z)')
    // Height (5.5 m wall + width x 0.25 rise) is hangar.py's own ESTIMATE, not a cited figure; only the footprint is cited.
    within1pct(bb.max[1], 5.5 + cited.widthM * 0.25, 'height: wall + rise')
    expect(bb.min[1]).toBeCloseTo(-0.3, 4)
  })
})

// A named skip where Blender is absent (ryzen): run on nexus by name (spec §7).
describe.skipIf(!HAVE_BLENDER)('blender entries rebuild byte-identically to their committed output', () => {
  it.each(blenderEntries.map((e) => [e.id, e] as const))('%s', async (id, entry) => {
    const written = new Map<string, Uint8Array>()
    const deps = { ...nodeBuildDeps(), write: (p: string, b: Uint8Array) => { written.set(p, b) }, log: () => {} }
    expect(await runBuild([entry], [id], deps)).toBe(0)
    expect(sha(written.get(entry.output)!)).toBe(sha(new Uint8Array(readFileSync(entry.output))))
  }, 120_000)
})
