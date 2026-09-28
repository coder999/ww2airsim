// tests/tools/models/blender/kitSkin.test.ts
import { beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Document, Primitive } from '@gltf-transform/core'
import { HAVE_BLENDER, runBlenderScript, skinSidecarPath } from '../../../../tools/models/blender/run.js'
import { findNode, modelIO } from '../../../../tools/models/document.js'
import { parseSidecar } from '../../../../tools/models/skin/sidecar.js'
import { rasterize, trianglesOf } from '../../../../tools/models/skin/raster.js'

const PROBE = 'tests/tools/models/blender/fixtures/kit_skin_probe.py'
const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex')
interface Patch { id: number; tag: string; rect: [number, number, number, number]; originM: [number, number] }
interface Side { version: number; model: string; atlasPx: number; paddingPx: number; metersPerPx: number; roles: Record<string, number[]>; patches: Patch[]; lines: { patch: number; axis: string; atM: number; fromM: number; toM: number; kind: string }[]; markings: { kind: string }[] }

const prims = (doc: Document): Primitive[] => doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())

// Builds in beforeAll, never in the describe body (kit.test.ts says why).
describe.skipIf(!HAVE_BLENDER)('the kit skin path (DP0 Task 2)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dp0-skin-'))
  const a = join(dir, 'a.glb'), b = join(dir, 'b.glb')
  let doc: Document
  let side: Side
  beforeAll(async () => {
    runBlenderScript(PROBE, a)
    runBlenderScript(PROBE, b)
    doc = await modelIO().readBinary(new Uint8Array(readFileSync(a)))
    side = JSON.parse(readFileSync(skinSidecarPath(a), 'utf8')) as Side
  }, 120_000)

  it('rebuilds byte-identically, glb and sidecar', () => {
    expect(sha(b)).toBe(sha(a))
    expect(sha(skinSidecarPath(b))).toBe(sha(skinSidecarPath(a)))
  })

  it('every primitive has TEXCOORD_0 inside [0, 1], and none has TEXCOORD_1', () => {
    for (const p of prims(doc)) {
      const uv = p.getAttribute('TEXCOORD_0')
      expect(uv, 'TEXCOORD_0').not.toBeNull()
      expect(p.getAttribute('TEXCOORD_1')).toBeNull()
      for (let i = 0; i < uv!.getCount(); i++) {
        const [u, v] = uv!.getElement(i, [0, 0])
        expect(u).toBeGreaterThanOrEqual(0); expect(u).toBeLessThanOrEqual(1)
        expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1)
      }
    }
  })

  it('the sidecar: version 1, 512 px, padding 4, the roles used, and patches that never overlap, padding included', () => {
    expect([side.version, side.model, side.atlasPx, side.paddingPx]).toEqual([1, 'sp', 512, 4])
    expect(Object.keys(side.roles).sort()).toEqual(['concrete', 'ijaGreen', 'steel', 'underside'])
    const pad = side.paddingPx
    const grown = side.patches.map((p) => [p.rect[0] - pad, p.rect[1] - pad, p.rect[0] + p.rect[2] + pad, p.rect[1] + p.rect[3] + pad] as const)
    for (const [x0, y0, x1, y1] of grown) { expect(x0).toBeGreaterThanOrEqual(0); expect(y0).toBeGreaterThanOrEqual(0); expect(x1).toBeLessThanOrEqual(512); expect(y1).toBeLessThanOrEqual(512) }
    for (let i = 0; i < grown.length; i++) for (let j = i + 1; j < grown.length; j++) {
      const [a0, a1, a2, a3] = grown[i]!, [b0, b1, b2, b3] = grown[j]!
      expect(a2 <= b0 || b2 <= a0 || a3 <= b1 || b3 <= a1, `patches ${i} and ${j} overlap`).toBe(true)
    }
    expect(new Set(side.patches.map((p) => p.tag))).toEqual(new Set(['slab', 'fuselage', 'wing', 'vault']))
  })

  it('one texel density: the fuselage side chart is as long in pixels as the fuselage is in meters, over metersPerPx', () => {
    const fus = side.patches.filter((p) => p.tag === 'fuselage').sort((p, q) => q.rect[2] * q.rect[3] - p.rect[2] * p.rect[3])[0]!
    // Station centroids run from x=-4 to x=3 on one line, so the chart's u extent is 7 m.
    expect(Math.abs(fus.rect[2] - Math.ceil(7 / side.metersPerPx))).toBeLessThanOrEqual(1)
  })

  it('a vertex lands at its chart pixel: the slab top corner maps inside the slab-top patch', () => {
    const slab = findNode(doc, 'sp_concrete').getMesh()!.listPrimitives()[0]!
    const pos = slab.getAttribute('POSITION')!, uv = slab.getAttribute('TEXCOORD_0')!
    const rects = side.patches.filter((p) => p.tag === 'slab').map((p) => p.rect)
    for (let i = 0; i < pos.getCount(); i++) {
      const [u, v] = uv.getElement(i, [0, 0])
      const px = u! * 512, py = v! * 512
      expect(rects.some(([x, y, w, h]) => px >= x - 1e-3 && px <= x + w + 1e-3 && py >= y - 1e-3 && py <= y + h + 1e-3), `uv ${u},${v}`).toBe(true)
    }
  })

  it('lofts are smooth-shaded: the fuselage has far fewer distinct normals than it would flat', () => {
    const p = findNode(doc, 'sp_ijaGreen').getMesh()!.listPrimitives()[0]!
    const n = p.getAttribute('NORMAL')!
    const distinct = new Set<string>()
    for (let i = 0; i < n.getCount(); i++) distinct.add(n.getElement(i, [0, 0, 0]).map((x) => x.toFixed(3)).join(','))
    const tris = p.getIndices()!.getCount() / 3
    expect(distinct.size).toBeLessThan(tris * 0.75)
  })

  /** Per triangle of a node's primitive: its unit face normal and its three corner normals. */
  const triangles = (node: string): { face: number[]; corners: number[][] }[] => {
    const p = findNode(doc, node).getMesh()!.listPrimitives()[0]!
    const pos = p.getAttribute('POSITION')!, n = p.getAttribute('NORMAL')!, idx = p.getIndices()!
    const out: { face: number[]; corners: number[][] }[] = []
    for (let t = 0; t < idx.getCount(); t += 3) {
      const [a, b, c] = [0, 1, 2].map((k) => pos.getElement(idx.getScalar(t + k), [0, 0, 0]))
      const e1 = [b![0]! - a![0]!, b![1]! - a![1]!, b![2]! - a![2]!], e2 = [c![0]! - a![0]!, c![1]! - a![1]!, c![2]! - a![2]!]
      const f = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!]
      const len = Math.hypot(f[0]!, f[1]!, f[2]!)
      out.push({ face: f.map((x) => x / len), corners: [0, 1, 2].map((k) => n.getElement(idx.getScalar(t + k), [0, 0, 0])) })
    }
    return out
  }
  const dot = (a: number[], b: number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!

  it('planar parts stay flat: every tank corner normal is its triangle\'s face normal (smooth flags survive the sharp-edge pass)', () => {
    // set_sharp_from_angle marks every face smooth in Blender 5.0.1, so the kit re-applies the per-face flags after it.
    // The tank's 24 walls meet at 15 deg, under SHARP_DEG, so they would shade smooth if the flags were lost.
    for (const [i, t] of triangles('sp_tank').entries()) for (const c of t.corners) expect(dot(c, t.face), `triangle ${i}`).toBeGreaterThan(0.9999)
  })

  it('a skinned barrel vault: outer and inner shells smooth-shaded, rims flat', () => {
    const tris = triangles('sp_steel')
    const rims = tris.filter((t) => Math.abs(t.face[2]!) > 0.99), shells = tris.filter((t) => Math.abs(t.face[2]!) <= 0.99)
    expect([rims.length, shells.length]).toEqual([48, 48])  // 12 segments: 2 rims and 2 shells of 12 quads each
    for (const t of rims) for (const c of t.corners) expect(dot(c, t.face)).toBeGreaterThan(0.9999)
    // Smooth: every shell triangle has a corner bent off its face normal, and the shells share
    // one normal per ring vertex (13 outer + 13 inner), far fewer than their triangles.
    for (const t of shells) expect(Math.min(...t.corners.map((c) => dot(c, t.face)))).toBeLessThan(0.9999)
    const distinct = new Set(shells.flatMap((t) => t.corners.map((c) => c.map((x) => x.toFixed(3)).join(','))))
    expect(distinct.size).toBeLessThanOrEqual(26)
    expect(distinct.size).toBeLessThan(shells.length * 0.75)
  })

  it('panel lines: one per interior authored fuselage station, and two spars per wing surface per half', () => {
    const fusPatch = side.patches.filter((p) => p.tag === 'fuselage').sort((p, q) => q.rect[2] * q.rect[3] - p.rect[2] * p.rect[3])[0]!
    expect(side.lines.filter((l) => l.patch === fusPatch.id && l.axis === 'u').length).toBe(1)
    const wingSides = side.patches.filter((p) => p.tag === 'wing').sort((p, q) => q.rect[2] * q.rect[3] - p.rect[2] * p.rect[3]).slice(0, 2)
    for (const w of wingSides) expect(side.lines.filter((l) => l.patch === w.id && l.axis === 'v').length).toBe(4)
  })

  it('markings pass through as declared', () => {
    expect(side.markings).toEqual([{ kind: 'disc', tags: ['wing'], center: [0, 1.5, 2.5], axis: [0, 1, 0], radiusM: 0.4, color: 'hinomaruRed' }])
  })

  it('a model without skin writes no sidecar and no TEXCOORD_0 (the unskinned path is unchanged)', async () => {
    const out = join(dir, 'plain.glb')
    runBlenderScript('tests/tools/models/blender/fixtures/kit_probe.py', out)
    expect(existsSync(skinSidecarPath(out))).toBe(false)
    const plain = await modelIO().readBinary(new Uint8Array(readFileSync(out)))
    for (const p of prims(plain)) expect(p.getAttribute('TEXCOORD_0')).toBeNull()
  })
})

describe.skipIf(!HAVE_BLENDER)('Model.shared_chart() (DP0 Task 8)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dp0-shared-'))
  const a = join(dir, 'a.glb'), b = join(dir, 'b.glb')
  let doc: Document
  let side: ReturnType<typeof parseSidecar>
  beforeAll(async () => {
    runBlenderScript('tests/tools/models/blender/fixtures/kit_shared_probe.py', a)
    runBlenderScript('tests/tools/models/blender/fixtures/kit_shared_probe.py', b)
    doc = await modelIO().readBinary(new Uint8Array(readFileSync(a)))
    side = parseSidecar(readFileSync(skinSidecarPath(a), 'utf8'))
  }, 120_000)

  /** node name -> the sorted distinct patch ids its triangles land in. */
  const patchesOf = (): Map<string, number[]> => {
    const t = trianglesOf(doc, side, side.atlasPx)
    const out = new Map<string, Set<number>>()
    let i = 0
    for (const node of doc.getRoot().listNodes().filter((n) => n.getMesh())) {
      const count = node.getMesh()!.listPrimitives().reduce((k, p) => k + p.getIndices()!.getCount() / 3, 0)
      const set = out.get(node.getName()) ?? new Set<number>()
      for (let k = 0; k < count; k++) set.add(t.tris[i++]!.patch)
      out.set(node.getName(), set)
    }
    return new Map([...out].map(([k, v]) => [k, [...v].sort((x, y) => x - y)]))
  }

  it('rebuilds byte-identically, glb and sidecar', () => {
    expect(sha(b)).toBe(sha(a))
    expect(sha(skinSidecarPath(b))).toBe(sha(skinSidecarPath(a)))
  })

  it('faces inside share one patch per role; faces outside, and a nested context, do not', () => {
    const p = patchesOf()
    expect(p.get('sh_a')).toHaveLength(6)
    expect(p.get('sh_g')).toHaveLength(6)
    for (const n of ['sh_b', 'sh_c', 'sh_d', 'sh_e', 'sh_f']) expect(p.get(n), n).toHaveLength(1)
    const shared = p.get('sh_b')![0]!
    expect(p.get('sh_c')).toEqual([shared])
    expect(p.get('sh_f')).toEqual([shared])  // exiting the nested context restores the outer one
    expect(p.get('sh_d')![0]).not.toBe(shared)  // glazing gets its own
    expect(p.get('sh_e')![0]).not.toBe(shared)  // the nested context its own
    expect(side.patches).toHaveLength(6 + 6 + 3)
    expect(new Set(side.patches.map((q) => q.tag))).toEqual(new Set(['fit']))
  })

  it('the shared patch is the union of its faces\' extents, not their sum', () => {
    const shared = patchesOf().get('sh_b')![0]!
    const rect = side.patches.find((q) => q.id === shared)!.rect
    // The largest face is sh_b's 2.0 x 0.2 m side or sh_c's 1.5 m side: the union is at most 2.0 x 2.0 m.
    expect(Math.max(rect[2], rect[3])).toBeLessThanOrEqual(Math.ceil(2.0 / side.metersPerPx) + 1)
  })

  it('the rasterizer takes the overlapping triangles: every shared texel is covered once, in its own patch and role', () => {
    const t = trianglesOf(doc, side, side.atlasPx)
    const g = rasterize(t, 2 * side.atlasPx)
    const p = patchesOf()
    const steel = t.roles.indexOf('steel'), glazing = t.roles.indexOf('glazing')
    for (const [node, role] of [['sh_b', steel], ['sh_d', glazing], ['sh_e', steel]] as const) {
      const id = p.get(node)![0]!
      let n = 0
      for (let i = 0; i < g.patch.length; i++) if (g.patch[i] === id) { n++; expect(g.covered[i]).toBe(1); expect(g.role[i], node).toBe(role) }
      expect(n, `${node}: texels in its patch`).toBeGreaterThan(0)
    }
  })
})
