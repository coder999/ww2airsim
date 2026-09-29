// tests/tools/models/blender/kitShips.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Document, Node } from '@gltf-transform/core'
import { HAVE_BLENDER, runBlenderScript, skinSidecarPath } from '../../../../tools/models/blender/run.js'
import { findNode, modelIO } from '../../../../tools/models/document.js'
import { islands, signedVolume } from './solids.js'

const PROBE = 'tests/tools/models/blender/fixtures/kit_ship_probe.py'
const SKIN_PROBE = 'tests/tools/models/blender/fixtures/kit_ship_skin_probe.py'
const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex')
const tris = (node: Node): number[][][] => {
  const out: number[][][] = []
  for (const prim of node.getMesh()!.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')!, idx = prim.getIndices()!
    for (let i = 0; i < idx.getCount(); i += 3) out.push([0, 1, 2].map((k) => pos.getElement(idx.getScalar(i + k), [0, 0, 0]) as number[]))
  }
  return out
}
const verts = (node: Node): number[][] => tris(node).flat()

// Builds in beforeAll, never in the describe body (kit.test.ts says why).
describe.skipIf(!HAVE_BLENDER)("the kit's ship parts (DP2 Task 6)", () => {
  const dir = mkdtempSync(join(tmpdir(), 'dp2-ship-'))
  const a = join(dir, 'a.glb'), b = join(dir, 'b.glb'), s = join(dir, 's.glb')
  let doc: Document, skinned: Document
  beforeAll(async () => {
    runBlenderScript(PROBE, a); runBlenderScript(PROBE, b); runBlenderScript(SKIN_PROBE, s)
    doc = await modelIO().readBinary(new Uint8Array(readFileSync(a)))
    skinned = await modelIO().readBinary(new Uint8Array(readFileSync(s)))
  }, 180_000)

  it('rebuilds byte-identically', () => { expect(sha(b)).toBe(sha(a)) })

  it('hull_lines: 60 m long, the waterline beam and the flared deck edge where the stations say, keel at -3', () => {
    const all = [...verts(findNode(doc, 'Hull')), ...verts(findNode(doc, 'MainDeck')), ...verts(findNode(doc, 'Bottom'))]
    const xs = all.map((v) => v[0]!), ys = all.map((v) => v[1]!)
    expect(Math.min(...xs)).toBeCloseTo(-30, 5); expect(Math.max(...xs)).toBeCloseTo(30, 5)
    expect(Math.min(...ys)).toBeCloseTo(-3.0, 5)
    const at25 = all.filter((v) => Math.abs(v[0]! - 25) < 1e-4)
    expect(Math.max(...at25.filter((v) => Math.abs(v[1]!) < 1e-4).map((v) => Math.abs(v[2]!)))).toBeCloseTo(3.0, 4)      // waterline half-beam
    expect(Math.max(...at25.filter((v) => Math.abs(v[1]! - 4.8) < 1e-4).map((v) => Math.abs(v[2]!)))).toBeCloseTo(3.6, 4) // flared deck edge
  })

  it('every solid winds outward: the hull (hull, deck and bottom weld into one) and each turret island', () => {
    const hull = [...tris(findNode(doc, 'Hull')), ...tris(findNode(doc, 'MainDeck')), ...tris(findNode(doc, 'Bottom'))]
    const hs = islands(hull)
    expect(hs).toHaveLength(1)
    expect(signedVolume(hs[0]!)).toBeGreaterThan(0)
    for (const t of ['Turret1', 'Turret2']) for (const i of islands(tris(findNode(doc, t)))) expect(signedVolume(i), t).toBeGreaterThan(0)
  })

  it('the deck is up-facing and the bottom lies wholly below the waterline; no hull face is wholly below it', () => {
    for (const [p, q, r] of tris(findNode(doc, 'MainDeck'))) {
      const ux = q![0]! - p![0]!, uy = q![1]! - p![1]!, uz = q![2]! - p![2]!, vx = r![0]! - p![0]!, vy = r![1]! - p![1]!, vz = r![2]! - p![2]!
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
      expect(ny / Math.hypot(nx, ny, nz)).toBeGreaterThan(0.9)
    }
    for (const v of verts(findNode(doc, 'Bottom'))) expect(v[1]!).toBeLessThanOrEqual(1e-6)
    expect(tris(findNode(doc, 'Hull')).filter((t) => t.every((v) => v[1]! < -1e-6))).toEqual([])
  })

  it('naval_turret: Turret1 guns point to the bow, Turret2 to the stern; 2 and 3 tubes; bags only where asked; each stands 0.02 m into the deck', () => {
    const t1 = verts(findNode(doc, 'Turret1')), t2 = verts(findNode(doc, 'Turret2'))
    expect(Math.max(...t1.map((v) => v[0]!))).toBeGreaterThan(15 + 2 + 4.5)
    expect(Math.min(...t2.map((v) => v[0]!))).toBeLessThan(-15 - 2 - 4.5)
    expect(islands(tris(findNode(doc, 'Turret1')))).toHaveLength(1 + 2 + 2) // gunhouse, 2 tubes, 2 bags
    expect(islands(tris(findNode(doc, 'Turret2')))).toHaveLength(1 + 3)
    // hull_at gave the deck height; the probe sank each gunhouse 0.02 m into it.
    const deck = verts(findNode(doc, 'MainDeck')).sort((p, q) => p[0]! - q[0]!)
    const deckY = (x: number): number => { const i = deck.findIndex((v) => v[0]! >= x); const [p, q] = [deck[i - 1]!, deck[i]!]; return p[1]! + (q[1]! - p[1]!) * (x - p[0]!) / (q[0]! - p[0]!) }
    expect(Math.min(...t1.map((v) => v[1]!))).toBeCloseTo(deckY(15) - 0.02, 4)
  })

  it('skinned: the hull chart holds true arc length, so a ring edge is as long in texels x metersPerPx as in meters, bow to stern', () => {
    const side = JSON.parse(readFileSync(skinSidecarPath(s), 'utf8')) as { atlasPx: number; metersPerPx: number }
    let checked = 0
    for (const name of ['Hull', 'MainDeck']) {
      const prim = findNode(skinned, name).getMesh()!.listPrimitives()[0]!
      const pos = prim.getAttribute('POSITION')!, uv = prim.getAttribute('TEXCOORD_0')!, idx = prim.getIndices()!
      for (let i = 0; i < idx.getCount(); i += 3) for (let k = 0; k < 3; k++) {
        const ia = idx.getScalar(i + k), ib = idx.getScalar(i + (k + 1) % 3)
        const pa = pos.getElement(ia, [0, 0, 0]), pb = pos.getElement(ib, [0, 0, 0])
        if (Math.abs(pa[0]! - pb[0]!) > 1e-6) continue // only edges around one ring
        const ua = uv.getElement(ia, [0, 0]), ub = uv.getElement(ib, [0, 0])
        const texM = Math.hypot(ua[0]! - ub[0]!, ua[1]! - ub[1]!) * side.atlasPx * side.metersPerPx
        const m = Math.hypot(pa[0]! - pb[0]!, pa[1]! - pb[1]!, pa[2]! - pb[2]!)
        if (m < 0.05) continue
        expect(Math.abs(texM / m - 1), `ring edge at x=${pa[0]!.toFixed(2)}`).toBeLessThan(0.01)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(100)
  })
})
