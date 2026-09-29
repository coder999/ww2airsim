import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { getBounds } from '@gltf-transform/functions'
import { loadModelEntries } from '../../../tools/models/manifest.js'
import { nodeBuildDeps, runBuild } from '../../../tools/models/build.js'
import { HAVE_BLENDER } from '../../../tools/models/blender/run.js'
import { findNode, modelIO } from '../../../tools/models/document.js'
import { islands, signedVolume } from './blender/solids.js'
import type { Document } from '@gltf-transform/core'

const blenderEntries = loadModelEntries().filter((e) => e.source.kind === 'blender')
const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')
const within1pct = (got: number, want: number, label: string): void => {
  expect(Math.abs(got - want) / want, `${label}: measured ${got}, cited ${want}`).toBeLessThanOrEqual(0.01)
}

/** A node's mesh positions; the R2 ship scripts emit every part with an identity transform. */
const positions = (doc: Document, name: string): number[][] => {
  const node = findNode(doc, name)
  expect([...node.getTranslation(), ...node.getScale()], `${name} transform`).toEqual([0, 0, 0, 1, 1, 1])
  const out: number[][] = []
  for (const prim of node.getMesh()!.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')!
    for (let i = 0; i < pos.getCount(); i++) out.push(pos.getElement(i, [0, 0, 0]))
  }
  return out
}

/** The hull's deck-edge half-width at x: each station's highest vertices, linearly interpolated; -1 off the ends. */
const deckEdge = (hull: number[][]): ((x: number) => number) => {
  const stations = new Map<number, number[][]>()
  for (const v of hull) {
    const key = Math.round(v[0]! * 1000) / 1000
    stations.set(key, [...(stations.get(key) ?? []), v])
  }
  const edge = [...stations].map(([x, vs]) => {
    const top = Math.max(...vs.map((v) => v[1]!))
    return [x, Math.max(...vs.filter((v) => v[1]! > top - 1e-4).map((v) => Math.abs(v[2]!)))] as const
  }).sort((a, b) => a[0] - b[0])
  return (x) => {
    for (let i = 0; i + 1 < edge.length; i++) {
      const [x0, h0] = edge[i]!, [x1, h1] = edge[i + 1]!
      if (x >= x0 - 1e-4 && x <= x1 + 1e-4) return h0 + (h1 - h0) * Math.min(1, Math.max(0, (x - x0) / (x1 - x0)))
    }
    return -1
  }
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
    expect(['Turret1', 'Turret2', 'Turret3'].map((n) => findNode(kagero, n).getName()))
      .toEqual(['Turret1', 'Turret2', 'Turret3'])

    const casablanca = await modelIO().readBinary(new Uint8Array(readFileSync('content/ships/casablanca-cve.glb')))
    const deck = getBounds(findNode(casablanca, 'FlightDeck'))
    within1pct(deck.max[0] - deck.min[0], 145.69, 'Casablanca flight-deck length')
    within1pct(deck.max[2] - deck.min[2], 24.38, 'Casablanca flight-deck width')
    within1pct(deck.max[1], 12.0, 'Casablanca flight-deck height')
  })

  // Pennsylvania's moved to tests/tools/models/blender/ships.test.ts (DP2): its skinned output is one node.
  it.each(['kagero-dd'])('%s: the painted main deck stays inside the hull\'s own deck edge (no slab overhangs the taper)', async (id) => {
    const doc = await modelIO().readBinary(new Uint8Array(readFileSync(`content/ships/${id}.glb`)))
    const edge = deckEdge(positions(doc, 'Hull'))
    const over = positions(doc, 'MainDeck')
      .map((v) => ({ x: v[0]!, z: Math.abs(v[2]!), edge: edge(v[0]!) }))
      .filter((p) => p.z > p.edge + 0.01)
      .map((p) => `x=${p.x.toFixed(2)} |z|=${p.z.toFixed(2)} vs hull edge ${p.edge.toFixed(2)}`)
    expect([...new Set(over)]).toEqual([])
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
