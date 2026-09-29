import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { getBounds } from '@gltf-transform/functions'
import { loadModelEntries } from '../../../tools/models/manifest.js'
import { nodeBuildDeps, runBuild } from '../../../tools/models/build.js'
import { HAVE_BLENDER } from '../../../tools/models/blender/run.js'
import { findNode, modelIO } from '../../../tools/models/document.js'
import { islands, signedVolume } from './blender/solids.js'

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

  it('the three R2 ship scripts and committed outputs carry their cited dimensions', async () => {
    expect(blenderEntries.map((e) => e.id)).toEqual(expect.arrayContaining(['pennsylvania-bb', 'kagero-dd', 'casablanca-cve']))

    const penn = await modelIO().readBinary(new Uint8Array(readFileSync('content/ships/pennsylvania-bb.glb')))
    const pennBounds = getBounds(penn.getRoot().listScenes()[0]!)
    within1pct(pennBounds.max[0] - pennBounds.min[0], 185.32, 'Pennsylvania overall length')
    within1pct(pennBounds.max[2] - pennBounds.min[2], 32.39, 'Pennsylvania post-modernization beam')
    expect(['Turret1', 'Turret2', 'Turret3', 'Turret4'].map((n) => findNode(penn, n).getName()))
      .toEqual(['Turret1', 'Turret2', 'Turret3', 'Turret4'])

    const kagero = await modelIO().readBinary(new Uint8Array(readFileSync('content/ships/kagero-dd.glb')))
    const kageroBounds = getBounds(kagero.getRoot().listScenes()[0]!)
    within1pct(kageroBounds.max[0] - kageroBounds.min[0], 118.5, 'Kagero overall length')
    within1pct(kageroBounds.max[2] - kageroBounds.min[2], 10.8, 'Kagero beam')
    within1pct(-kageroBounds.min[1], 3.76, 'Kagero design draft')
    // Ruling S8 (DP2): the cited hull, Yukikaze in October 1944, had her X mount removed in 1943 (see kagero-dd.py).
    expect(['Turret1', 'Turret2'].map((n) => findNode(kagero, n).getName()))
      .toEqual(['Turret1', 'Turret2'])

    const casablanca = await modelIO().readBinary(new Uint8Array(readFileSync('content/ships/casablanca-cve.glb')))
    const deck = getBounds(findNode(casablanca, 'FlightDeck'))
    within1pct(deck.max[0] - deck.min[0], 145.69, 'Casablanca flight-deck length')
    within1pct(deck.max[2] - deck.min[2], 24.38, 'Casablanca flight-deck width')
    within1pct(deck.max[1], 12.0, 'Casablanca flight-deck height')
  })

  it.each(['pennsylvania-bb', 'kagero-dd', 'casablanca-cve'])('%s: every closed solid in the committed output winds outward (DP2 winding fix)', async (id) => {
    const doc = await modelIO().readBinary(new Uint8Array(readFileSync(`content/ships/${id}.glb`)))
    // Every node but the skirt (an open wall, not a solid), pooled: the hull and its deck are two
    // nodes today and one after skinning, and they close only together (welded positions).
    const tris: number[][][] = []
    for (const node of doc.getRoot().listNodes()) {
      if (!node.getMesh() || node.getName() === 'Skirt') continue
      const m = node.getWorldMatrix()
      for (const prim of node.getMesh()!.listPrimitives()) {
        const pos = prim.getAttribute('POSITION')!, idx = prim.getIndices()!
        const v = (i: number): number[] => { const [x, y, z] = pos.getElement(idx.getScalar(i), [0, 0, 0]) as number[]; return [0, 1, 2].map((r) => m[r]! * x! + m[4 + r]! * y! + m[8 + r]! * z! + m[12 + r]!) }
        for (let i = 0; i < idx.getCount(); i += 3) tris.push([v(i), v(i + 1), v(i + 2)])
      }
    }
    for (const s of islands(tris)) expect(signedVolume(s), `${id}: an island of ${s.length} triangles`).toBeGreaterThan(0)
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
