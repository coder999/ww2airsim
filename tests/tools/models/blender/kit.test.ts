// tests/tools/models/blender/kit.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getBounds } from '@gltf-transform/functions'
import type { Document, Node } from '@gltf-transform/core'
import { HAVE_BLENDER, runBlenderScript } from '../../../../tools/models/blender/run.js'
import { modelIO, findNode, onlyScene } from '../../../../tools/models/document.js'
import { measureDocument } from '../../../../tools/models/measure.js'

const PROBE = 'tests/tools/models/blender/fixtures/kit_probe.py'
const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex')

/** World-space triangles of one node: [a, b, c] each an [x, y, z]. */
function triangles(node: Node): number[][][] {
  const m = node.getWorldMatrix()
  const out: number[][][] = []
  for (const prim of node.getMesh()!.listPrimitives()) {
    const pos = prim.getAttribute('POSITION')!
    const idx = prim.getIndices()!
    const v = (i: number): number[] => {
      const [x, y, z] = pos.getElement(idx.getScalar(i), [0, 0, 0]) as number[]
      return [0, 1, 2].map((r) => m[r]! * x! + m[4 + r]! * y! + m[8 + r]! * z! + m[12 + r]!)
    }
    for (let i = 0; i < idx.getCount(); i += 3) out.push([v(i), v(i + 1), v(i + 2)])
  }
  return out
}

// Builds run in beforeAll, never in the describe body: vitest runs a skipped suite's body
// to collect it, so a build there would error on ryzen instead of skipping by name.
describe.skipIf(!HAVE_BLENDER)('the Blender kit (model-roster spec §4.2)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'm0-kit-'))
  const a = join(dir, 'a.glb'), b = join(dir, 'b.glb')
  let doc: Document
  beforeAll(async () => {
    runBlenderScript(PROBE, a)
    runBlenderScript(PROBE, b)
    doc = await modelIO().readBinary(new Uint8Array(readFileSync(a)))
  }, 120_000)

  it('rebuilds byte-identically', () => {
    expect(sha(b)).toBe(sha(a))
  })

  it('one root named for the model, one child per role or named node, sorted', () => {
    const roots = onlyScene(doc).listChildren()
    expect(roots.map((n) => n.getName())).toEqual(['probe'])
    expect(roots[0]!.listChildren().map((n) => n.getName())).toEqual(['probe_concrete', 'probe_door', 'probe_steel'])
  })

  it('one draw call per node, flat materials named by role, metalness 0', () => {
    expect(measureDocument(doc).drawCalls).toBe(3)
    const mats = doc.getRoot().listMaterials()
    expect(mats.map((m) => m.getName()).sort()).toEqual(['concrete', 'dark', 'steel'])
    for (const mat of mats) expect(mat.getMetallicFactor()).toBe(0)
  })

  it('writes the glTF frame as given: the box spans x ±1, y 0..1, z ±2', () => {
    const bb = getBounds(findNode(doc, 'probe_concrete'))
    for (const [got, want] of [[bb.min, [-1, 0, -2]], [bb.max, [1, 1, 2]]] as const) {
      got.forEach((g, i) => expect(g).toBeCloseTo(want[i]!, 5))
    }
  })

  it('the vault: outer width 6 at the spring line, rise 1.5 above y = 1, length 8 along z', () => {
    const tris = triangles(findNode(doc, 'probe_steel')).flat().filter((p) => p[0]! > 5 && p[0]! < 15)
    const xs = tris.map((p) => p[0]!), ys = tris.map((p) => p[1]!), zs = tris.map((p) => p[2]!)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(6, 5)
    expect(Math.min(...ys)).toBeCloseTo(1, 5)
    expect(Math.max(...ys)).toBeCloseTo(2.5, 5)
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(8, 5)
  })

  it('outward normals: every face of every solid points away from its solid center', () => {
    // Solids are separated in x (box at 0, vault at 10, gable at 20), so a face belongs to
    // the solid whose center is nearest. The vault is a shell: its inner surface faces the
    // axis and its outer surface faces away, so for it "outward" is measured from the
    // springing axis (x=10, y=1), in the x-y plane only.
    const centers: Record<string, number[]> = { box: [0, 0.5, 0], vault: [10, 1, 0], gable: [20, 1.5, 0] }
    for (const node of ['probe_concrete', 'probe_steel']) {
      for (const [p, q, r] of triangles(findNode(doc, node))) {
        const u = [q![0]! - p![0]!, q![1]! - p![1]!, q![2]! - p![2]!]
        const w = [r![0]! - p![0]!, r![1]! - p![1]!, r![2]! - p![2]!]
        const n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!]
        const c = [(p![0]! + q![0]! + r![0]!) / 3, (p![1]! + q![1]! + r![1]!) / 3, (p![2]! + q![2]! + r![2]!) / 3]
        const solid = c[0]! < 5 ? 'box' : c[0]! < 15 ? 'vault' : 'gable'
        const o = centers[solid]!
        if (solid === 'vault') {
          const radial = [c[0]! - o[0]!, c[1]! - o[1]!]
          const rim = Math.abs(Math.abs(c[2]!) - 4) < 1e-4 // the two end rims face ±z
          if (rim) expect(Math.sign(n[2]!), `vault rim at z=${c[2]}`).toBe(Math.sign(c[2]!))
          else {
            const dot = n[0]! * radial[0]! + n[1]! * radial[1]!
            const r0 = Math.hypot(radial[0]! / 3, radial[1]! / 1.5) // ~1 on the outer surface, <1 inner
            expect(dot * (r0 > 0.97 ? 1 : -1), `vault face at ${c.map((v) => v.toFixed(2))}`).toBeGreaterThan(0)
          }
        } else {
          const dot = n[0]! * (c[0]! - o[0]!) + n[1]! * (c[1]! - o[1]!) + n[2]! * (c[2]! - o[2]!)
          expect(dot, `${solid} face at ${c.map((v) => v.toFixed(2))}`).toBeGreaterThan(0)
        }
      }
    }
  })
})
