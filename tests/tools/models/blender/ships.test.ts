// tests/tools/models/blender/ships.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Document, Node } from '@gltf-transform/core'
import { HAVE_BLENDER, runBlenderScript, skinSidecarPath } from '../../../../tools/models/blender/run.js'
import { findNode, modelIO } from '../../../../tools/models/document.js'
import { loadModelEntries } from '../../../../tools/models/manifest.js'
import { parseSidecar, type Sidecar } from '../../../../tools/models/skin/sidecar.js'
import { rasterize, trianglesOf } from '../../../../tools/models/skin/raster.js'
import { coverage } from '../../../../tools/models/skin/layers.js'
import { strokeLength } from '../../../../tools/models/skin/strokeFont.js'
import { withShipColors } from '../../../../tools/models/skin/shipColors.js'
import { coplanarOverlaps, worldTriangles } from '../buildingGeometry.js'
import { islands, signedVolume } from './solids.js'

/** The skinned Blender ships this plan has reached. Tasks 8 and 9 add theirs. */
const SHIPS: readonly string[] = ['casablanca-cve', 'kagero-dd', 'pennsylvania-bb']
/** Each ship's text markings, from Task 1's research (ledger, 2026-09-28): a count, so a ship with
 *  no number on its cited hull declares that instead of passing the placement test vacuously. */
const TEXTS: Readonly<Record<string, number>> = { 'casablanca-cve': 0, 'kagero-dd': 0, 'pennsylvania-bb': 0 }
/** hull_lines' nodes: open shells each, closed only together (Task 6's kitShips.test.ts pools them). */
const HULL_NODES = new Set(['Hull', 'MainDeck', 'Bottom'])
const entries = loadModelEntries()
const tris = (node: Node): number[][][] => worldTriangles(node).map((t) => t.map((p) => [...p]))

describe.skipIf(!HAVE_BLENDER).each(SHIPS.map((id) => [id] as const))('%s, raw export (DP2)', (id) => {
  const entry = entries.find((e) => e.id === id)!
  const dir = mkdtempSync(join(tmpdir(), `dp2-${id}-`))
  const out = join(dir, `${id}.glb`)
  let doc: Document, side: Sidecar
  beforeAll(async () => {
    if (entry.source.kind !== 'blender') throw new Error(`${id} is not a Blender entry`)
    runBlenderScript(entry.source.script, out)
    doc = await modelIO().readBinary(new Uint8Array(readFileSync(out)))
    side = parseSidecar(readFileSync(skinSidecarPath(out), 'utf8'))
  }, 180_000)
  const meshNodes = (): Node[] => doc.getRoot().listNodes().filter((n) => n.getMesh())

  it('every closed solid winds outward: the hull (its nodes pooled) and each island of every other node', () => {
    const hull = meshNodes().filter((n) => HULL_NODES.has(n.getName())).flatMap(tris)
    const hs = islands(hull)
    expect(hs, 'the hull, deck and bottom weld into one solid').toHaveLength(1)
    expect(signedVolume(hs[0]!)).toBeGreaterThan(0)
    for (const n of meshNodes()) {
      if (HULL_NODES.has(n.getName())) continue
      for (const s of islands(tris(n))) expect(signedVolume(s), `${n.getName()}: an island of ${s.length}`).toBeGreaterThan(0)
    }
  })

  it('no two faces lie in one plane facing one way and overlapping: a skin would show the z-fight', () => {
    const all = meshNodes().flatMap((n) => worldTriangles(n).map((tri, i) => ({ label: `${n.getName()}#${i}`, where: n.getName(), tri })))
    expect(coplanarOverlaps(all)).toEqual([])
  }, 120_000)

  it('its turrets are the entry\'s keep nodes, numbered bow to stern', () => {
    const names = entry.keep.map((k) => k.as ?? k.node).filter((n) => n.startsWith('Turret'))
    const xs = names.map((n) => { const v = tris(findNode(doc, n)).flat(); return v.reduce((s, p) => s + p[0]!, 0) / v.length })
    expect([...xs].sort((a, b) => b - a)).toEqual(xs)
  })

  it('the painted main deck stays inside the hull\'s own deck edge (moved from blenderEntries.test.ts, DP2)', () => {
    // The deck edge at x, as the R2 test read it: the hull's highest vertices there, and their widest |z|.
    const hull = tris(findNode(doc, 'Hull')).flat()
    const over: string[] = []
    for (const v of tris(findNode(doc, 'MainDeck')).flat()) {
      const near = hull.filter((h) => Math.abs(h[0]! - v[0]!) < 1e-4)
      const top = Math.max(...near.map((h) => h[1]!))
      const edge = Math.max(...near.filter((h) => h[1]! > top - 1e-4).map((h) => Math.abs(h[2]!)))
      if (Math.abs(v[2]!) > edge + 0.01) over.push(`x=${v[0]!.toFixed(2)} |z|=${Math.abs(v[2]!).toFixed(2)} vs hull ${edge.toFixed(2)}`)
    }
    expect([...new Set(over)]).toEqual([])
  })

  it('every kit role is painted from the ship palette or is a non-ship role (Ruling S2)', () => {
    expect(() => withShipColors(side, entry.ship!)).not.toThrow()
  })

  it('each hull number lands on its own tagged faces and all of its strokes land (Review Focus 4)', () => {
    const texts = side.markings.filter((m) => m.kind === 'text')
    expect(texts.length, 'text markings vs Task 1\'s count for the cited hull').toBe(TEXTS[id])
    if (texts.length === 0) return // Task 1 found no number on the cited hull; the handoff says so
    // Facing is not asserted here: coverage() already returns 0 below FACING_MIN, so it could not fail.
    const t = trianglesOf(doc, side, side.atlasPx)
    const g = rasterize(t, 2 * side.atlasPx)
    const tagOf = new Map(side.patches.map((p) => [p.id, p.tag]))
    const sampleM2 = (side.metersPerPx / 2) ** 2
    for (const mk of texts) {
      if (mk.kind !== 'text') continue
      let inked = 0
      for (let i = 0; i < g.size * g.size; i++) {
        if (!g.covered[i]) continue
        const p: [number, number, number] = [g.pos[3 * i]!, g.pos[3 * i + 1]!, g.pos[3 * i + 2]!]
        const n: [number, number, number] = [g.nrm[3 * i]!, g.nrm[3 * i + 1]!, g.nrm[3 * i + 2]!]
        if (!mk.tags.includes(tagOf.get(g.patch[i]!)!)) continue
        if (coverage(mk, p, n) === 0) continue
        inked++
      }
      const expected = strokeLength(mk.text) * mk.heightM * mk.strokeM
      expect(inked * sampleM2 / expected, `'${mk.text}': inked area vs stroke area`).toBeGreaterThan(0.6)
      expect(inked * sampleM2 / expected, `'${mk.text}': inked area vs stroke area`).toBeLessThan(1.6)
    }
  })
})
