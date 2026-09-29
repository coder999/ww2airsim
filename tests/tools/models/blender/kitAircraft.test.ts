// tests/tools/models/blender/kitAircraft.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getBounds } from '@gltf-transform/functions'
import type { Document, Node } from '@gltf-transform/core'
import { HAVE_BLENDER, runBlenderScript } from '../../../../tools/models/blender/run.js'
import { findNode, modelIO, onlyScene } from '../../../../tools/models/document.js'
import { measureDocument } from '../../../../tools/models/measure.js'
import { radiusAbout, rotateAbout, worldPositions, type Vec3 } from '../../../../tools/models/rig.js'
import { islands, signedVolume } from './solids.js'

const PROBE = 'tests/tools/models/blender/fixtures/kit_aircraft_probe.py'
const BAD = 'tests/tools/models/blender/fixtures/kit_bad_aircraft.py'
const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex')

/** World-space triangles of one node. */
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
const normal = ([p, q, r]: number[][]): number[] => {
  const u = [q![0]! - p![0]!, q![1]! - p![1]!, q![2]! - p![2]!], w = [r![0]! - p![0]!, r![1]! - p![1]!, r![2]! - p![2]!]
  return [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!]
}
const mid = ([p, q, r]: number[][]): number[] => [0, 1, 2].map((i) => (p![i]! + q![i]! + r![i]!) / 3)

// Builds run in beforeAll, never in the describe body (kit.test.ts says why).
describe.skipIf(!HAVE_BLENDER)("the Blender kit's aircraft parts (R3)", () => {
  const dir = mkdtempSync(join(tmpdir(), 'r3-kit-'))
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

  it('one node per named part or role, flat materials named by role, metalness 0', () => {
    const names = onlyScene(doc).listChildren()[0]!.listChildren().map((n) => n.getName()).sort()
    expect(names).toEqual(['GearL', 'GearR', 'Prop', 'Turret1', 'Turret2', 'ap_canopy', 'ap_fin', 'ap_fuse', 'ap_fuse_lower', 'ap_wing'].sort())
    const mats = doc.getRoot().listMaterials()
    expect(mats.map((m) => m.getName()).sort()).toEqual(['dark', 'glazing', 'ijaGreen', 'naturalMetal', 'underside'])
    for (const mat of mats) expect(mat.getMetallicFactor()).toBe(0)
    expect(measureDocument(doc).drawCalls).toBe(10)
  })

  it('fuselage: the stations set length, width and height; the lower half is its own node; every side faces out', () => {
    const up = findNode(doc, 'ap_fuse'), low = findNode(doc, 'ap_fuse_lower')
    const bu = getBounds(up), bl = getBounds(low)
    const min = [0, 1, 2].map((i) => Math.min(bu.min[i]!, bl.min[i]!)), max = [0, 1, 2].map((i) => Math.max(bu.max[i]!, bl.max[i]!))
    ;[-4, -0.8, -1].forEach((v, i) => expect(min[i]).toBeCloseTo(v, 5))
    ;[4, 0.8, 1].forEach((v, i) => expect(max[i]).toBeCloseTo(v, 5))
    expect(bl.max[1]).toBeLessThanOrEqual(1e-6)
    expect(bl.min[1]).toBeCloseTo(-0.8, 5)
    for (const node of [up, low]) for (const t of triangles(node)) {
      const c = mid(t)
      if (Math.abs(c[0]!) > 3.999) continue // end caps point along x
      const n = normal(t)
      expect(n[1]! * c[1]! + n[2]! * c[2]!, `fuselage face at ${c.map((x) => x.toFixed(2))}`).toBeGreaterThan(0)
    }
  })

  it('wing: span, chords and dihedral as given, mirrored, upper faces up and lower faces down', () => {
    const w = findNode(doc, 'ap_wing')
    const bb = getBounds(w)
    expect(bb.min[0]).toBeCloseTo(19, 5)
    expect(bb.max[0]).toBeCloseTo(21, 5)
    expect(bb.min[2]).toBeCloseTo(-5, 5)
    expect(bb.max[2]).toBeCloseTo(5, 5)
    const pts = worldPositions(w)
    const tipLe = pts.filter((p) => Math.abs(Math.abs(p[2]) - 5) < 1e-5 && Math.abs(p[0] - 21) < 1e-5)
    expect(tipLe.length).toBeGreaterThanOrEqual(2)
    for (const p of tipLe) expect(p[1]).toBeCloseTo(5 * Math.tan((5 * Math.PI) / 180), 5)
    const tipTe = pts.filter((p) => Math.abs(Math.abs(p[2]) - 5) < 1e-5).map((p) => p[0])
    expect(Math.min(...tipTe)).toBeCloseTo(20, 5) // tip chord 1, no sweep
    const tan5 = Math.tan((5 * Math.PI) / 180)
    for (const t of triangles(w)) {
      const c = mid(t)
      if (Math.abs(c[2]!) < 0.01 || Math.abs(c[2]!) > 4.99) continue // root and tip caps
      const side = c[1]! - Math.abs(c[2]!) * tan5
      expect(Math.sign(normal(t)[1]!), `wing face at ${c.map((x) => x.toFixed(3))}`).toBe(Math.sign(side))
    }
  })

  it('fin: stands height tall on its root, thickness along z, leading edge swept', () => {
    const f = findNode(doc, 'ap_fin')
    const bb = getBounds(f)
    expect(bb.min[1]).toBeCloseTo(0, 5)
    expect(bb.max[1]).toBeCloseTo(3, 5)
    expect(bb.max[0]).toBeCloseTo(41, 5)
    expect(bb.max[2]).toBeLessThanOrEqual(0.1 + 1e-4)
    expect(bb.max[2]).toBeGreaterThan(0.09)
    const tip = worldPositions(f).filter((p) => Math.abs(p[1] - 3) < 1e-5).map((p) => p[0])
    expect(Math.max(...tip)).toBeCloseTo(41 - 3 * Math.tan((10 * Math.PI) / 180), 5)
  })

  it('propeller: diameter as given to 1%, exactly 3-fold symmetric about the hub, spinner tip ahead', () => {
    const pts = worldPositions(findNode(doc, 'Prop'))
    const hub: Vec3 = [60, 0, 0], x: Vec3 = [1, 0, 0]
    const r = radiusAbout(pts, hub, x)
    expect(r).toBeGreaterThanOrEqual(1.5)
    expect(r).toBeLessThanOrEqual(1.5 * 1.01)
    for (const p of pts) {
      const q = rotateAbout(p, hub, x, (2 * Math.PI) / 3)
      const nearest = Math.min(...pts.map((s) => Math.hypot(q[0] - s[0], q[1] - s[1], q[2] - s[2])))
      expect(nearest, `turned ${p.map((v) => v.toFixed(3))}`).toBeLessThan(1e-4)
    }
    expect(Math.max(...pts.map((p) => p[0]))).toBeCloseTo(60.375, 5)
  })

  it('gear legs: hang exactly length below the hinge; the hinge is the top', () => {
    for (const [name, z] of [['GearR', 2], ['GearL', -2]] as const) {
      const bb = getBounds(findNode(doc, name))
      expect(bb.max[1]).toBeCloseTo(0, 5)
      expect(bb.min[1]).toBeCloseTo(-2, 5)
      expect((bb.min[2] + bb.max[2]) / 2).toBeCloseTo(z, 5)
    }
  })

  it('turrets: TurretN nodes, a dorsal dome above its base and a ventral one below, guns facing as asked', () => {
    const t1 = getBounds(findNode(doc, 'Turret1')), t2 = getBounds(findNode(doc, 'Turret2'))
    expect(t1.min[1]).toBeGreaterThanOrEqual(-1e-6)
    expect(t2.max[1]).toBeLessThanOrEqual(1e-6)
    expect(t1.max[0]).toBeCloseTo(97.5, 5)
    expect(t2.min[0]).toBeCloseTo(98.5, 5)
  })

  it('every part is wound outward: each closed solid in a node has a positive signed volume', () => {
    // R2's tapered_box, cylinder and turret read negative this way (measured 2026-09-27, fixed in DP2 Task 2; see
    // the R3 ledger), hidden by double-sided materials. The face-by-face checks above skip
    // caps and tips; this one sees every face. A node holds several solids (blades and a
    // spinner, a strut and a wheel), so the volume is taken per island of welded positions;
    // one inverted blade cannot hide behind its spinner. The split fuselage closes as a pair.
    const solids: [string, number, number[][][]][] = [
      ['ap_fuse + ap_fuse_lower', 1, [...triangles(findNode(doc, 'ap_fuse')), ...triangles(findNode(doc, 'ap_fuse_lower'))]],
      // The halves weld along the root, so they are split by side: a root-cap face belongs
      // to the half it closes (the starboard half's cap faces -z).
      ...(['starboard', 'port'] as const).map((side): [string, number, number[][][]] => [`ap_wing ${side}`, 1,
        triangles(findNode(doc, 'ap_wing')).filter((t) => {
          const far = t.map((p) => p[2]!).reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a))
          const starboard = Math.abs(far) > 1e-9 ? far > 0 : normal(t)[2]! < 0
          return starboard === (side === 'starboard')
        })]),
      ['ap_fin', 1, triangles(findNode(doc, 'ap_fin'))],
      ['ap_canopy', 1, triangles(findNode(doc, 'ap_canopy'))],
      ['Prop', 4, triangles(findNode(doc, 'Prop'))], // 3 blades + spinner
      ['GearL', 2, triangles(findNode(doc, 'GearL'))], // strut + wheel
      ['GearR', 2, triangles(findNode(doc, 'GearR'))],
      ['Turret1', 3, triangles(findNode(doc, 'Turret1'))], // dome + 2 barrels
      ['Turret2', 3, triangles(findNode(doc, 'Turret2'))],
    ]
    for (const [name, count, tris] of solids) {
      const parts = islands(tris)
      expect(parts.length, `${name} islands`).toBe(count)
      parts.forEach((part, i) => expect(signedVolume(part), `${name} island ${i}`).toBeGreaterThan(0))
    }
  })

  it('rejects bad input by name', () => {
    const bad = (c: string) => () => runBlenderScript(BAD, join(dir, `bad-${c}.glb`), ['--case', c])
    expect(bad('fuselage-order')).toThrow(/fuselage: station x values must be strictly increasing/)
    expect(bad('blades')).toThrow(/propeller: blades must be an integer from 2 to 6/)
    expect(bad('wing-chord')).toThrow(/wing: root and tip chords must be > 0/)
    expect(bad('turret')).toThrow(/gun_turret: index must be a positive integer/)
  })
})
