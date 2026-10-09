// tests/tools/models/skin/boxProject.test.ts
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import type { Document, Primitive } from '@gltf-transform/core'
import { boxProject, dominantAxis, overlapFraction, project, shelfPack, type BoxAxis } from '../../../../tools/models/skin/boxProject.js'
import { renderSkinMaps } from '../../../../tools/models/skin/stage.js'
import { runPipeline } from '../../../../tools/models/build.js'
import { parseModelEntry } from '../../../../tools/models/manifest.js'
import { measureDocument } from '../../../../tools/models/measure.js'
import { addMeshNode, boxesPrimitive, newDocument, type V3 } from '../fixtures.js'
import { soupHash } from '../soupHash.js'
import { flatScan } from './fixture.js'
import { loadShipSpec } from '../../../../tools/content/load.js'
import type { ShipSpec } from '../../../../src/sim/world/ships.js'

// Track M, M1: the toy hulls carry no guns, so they fit the real essex-cv spec without its armament.
const unarmed = (id: string): ShipSpec => ({ ...loadShipSpec(id), armament: undefined })

const flat = async () => flatScan()

/** Indexed, smooth per-vertex NORMALs (a download's shape: shared corners), keeping the indices.
 *  glTF-Transform's `normals()` un-indexes, which would hide the seam splits this stage exists for. */
function smoothNormals(doc: Document): void {
  for (const prim of doc.getRoot().listMeshes().flatMap((m) => m.listPrimitives())) {
    const pos = prim.getAttribute('POSITION')!.getArray()!, idx = prim.getIndices()!.getArray()!
    const acc = new Float32Array(pos.length)
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [3 * idx[t]!, 3 * idx[t + 1]!, 3 * idx[t + 2]!]
      const u = [pos[b]! - pos[a]!, pos[b + 1]! - pos[a + 1]!, pos[b + 2]! - pos[a + 2]!], v = [pos[c]! - pos[a]!, pos[c + 1]! - pos[a + 1]!, pos[c + 2]! - pos[a + 2]!]
      const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!]
      const len = Math.hypot(n[0]!, n[1]!, n[2]!) || 1
      for (const k of [a, b, c]) for (let i = 0; i < 3; i++) acc[k + i]! += n[i]! / len
    }
    for (let k = 0; k < acc.length; k += 3) {
      const len = Math.hypot(acc[k]!, acc[k + 1]!, acc[k + 2]!) || 1
      for (let i = 0; i < 3; i++) acc[k + i]! /= len
    }
    prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(acc))
  }
}
const skipSkirt = (n: { getName(): string }) => n.getName() === 'Skirt'

/** What shipMaterials leaves (Ruling S3): identity nodes, ship:<role> materials, POSITION + NORMAL.
 *  A hull box with a 45-degree chamfer along its starboard deck edge (a tie between +y and +z), a
 *  deck box on it, and a Skirt the stage must not touch. Corners are shared, so seams split them. */
async function afterShipMaterials(): Promise<Document> {
  const doc = newDocument()
  const hull = doc.createMaterial('ship:hull'), deck = doc.createMaterial('ship:deck'), boot = doc.createMaterial('ship:boot')
  const chamfer = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array([-20, 3, 4, 20, 3, 4, 20, 4, 3, -20, 4, 3])))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array([0, 1, 2, 0, 2, 3]))).setMaterial(hull)
  addMeshNode(doc, 'Object_2', [boxesPrimitive(doc, [[[-20, 0, -4], [20, 3, 4]]], hull), chamfer, boxesPrimitive(doc, [[[-18, 3, -3], [18, 4, 3]]], deck)])
  addMeshNode(doc, 'Skirt', [boxesPrimitive(doc, [[[-20, -3, -4], [20, 0, -3.9]]], boot)])
  smoothNormals(doc)
  return doc
}
const prims = (doc: Document, node: string): Primitive[] => doc.getRoot().listNodes().find((n) => n.getName() === node)!.getMesh()!.listPrimitives()
const OPTS = { atlasPx: 1024, palette: 'usn-1944', skip: skipSkirt } as const

describe('box projection (DP2)', () => {
  it('picks the dominant axis; a tie goes to y, then x (a 45-degree chamfer takes its top or bottom chart)', () => {
    expect(dominantAxis(0.2, 0.9, 0.1)).toBe('+y')
    expect(dominantAxis(0, 1, 1)).toBe('+y')
    expect(dominantAxis(1, 0, 1)).toBe('+x')
    expect(dominantAxis(0, -1, 1)).toBe('-y')
    expect(dominantAxis(0, 0, -1)).toBe('-z')
    expect(dominantAxis(0, 0, 0)).toBe('+y')
  })

  it('never mirrors a chart: seen from outside, (right, up) on each face maps to (+u, +v) with a positive 2D cross product', () => {
    const cases: [BoxAxis, V3, V3][] = [['+x', [0, 0, -1], [0, 1, 0]], ['-x', [0, 0, 1], [0, 1, 0]], ['+z', [1, 0, 0], [0, 1, 0]], ['-z', [-1, 0, 0], [0, 1, 0]], ['+y', [0, 0, 1], [1, 0, 0]], ['-y', [0, 0, -1], [1, 0, 0]]]
    for (const [axis, right, up] of cases) {
      const [ru, rv] = project(axis, ...right), [uu, uv] = project(axis, ...up)
      expect(ru * uv - rv * uu, axis).toBeGreaterThan(0)
    }
  })

  it('shelfPack places tallest first, left to right, inset by the padding, and says when nothing fits', () => {
    expect(shelfPack([[10, 5], [20, 10]], 1, 64, 4)).toEqual([[32, 4, 10, 5], [4, 4, 20, 10]])
    expect(shelfPack([[100, 5]], 1, 64, 4)).toBeNull()
  })

  it('every triangle lies inside one patch, its own (role, axis) chart; the Skirt takes no UVs', async () => {
    const doc = await afterShipMaterials()
    const side = boxProject(doc, 'toy', OPTS)
    const rect = new Map(side.patches.map((p) => [p.tag, p.rect]))
    for (const p of prims(doc, 'Object_2')) {
      const role = p.getMaterial()!.getName(), pos = p.getAttribute('POSITION')!, uv = p.getAttribute('TEXCOORD_0')!, idx = p.getIndices()!
      for (let i = 0; i < idx.getCount(); i += 3) {
        const v = [0, 1, 2].map((k) => idx.getScalar(i + k))
        const [a, b, c] = v.map((k) => pos.getElement(k, [0, 0, 0]))
        const n = [(b![1]! - a![1]!) * (c![2]! - a![2]!) - (b![2]! - a![2]!) * (c![1]! - a![1]!), (b![2]! - a![2]!) * (c![0]! - a![0]!) - (b![0]! - a![0]!) * (c![2]! - a![2]!), (b![0]! - a![0]!) * (c![1]! - a![1]!) - (b![1]! - a![1]!) * (c![0]! - a![0]!)]
        const [x, y, w, h] = rect.get(`${role}|${dominantAxis(n[0]!, n[1]!, n[2]!)}`)!
        for (const k of v) {
          const [u, t] = uv.getElement(k, [0, 0])
          expect(u! * 1024 >= x - 1e-3 && u! * 1024 <= x + w + 1e-3 && t! * 1024 >= y - 1e-3 && t! * 1024 <= y + h + 1e-3, `${role} tri ${i / 3}`).toBe(true)
        }
      }
    }
    for (const p of prims(doc, 'Skirt')) expect(p.getAttribute('TEXCOORD_0')).toBeNull()
  })

  it('never moves geometry: the same triangles, and every split seam vertex keeps its POSITION and NORMAL bit for bit', async () => {
    const before = await afterShipMaterials(), after = await afterShipMaterials()
    const keyed = (doc: Document) => prims(doc, 'Object_2').map((p) => {
      const pos = p.getAttribute('POSITION')!, nor = p.getAttribute('NORMAL')!, idx = p.getIndices()!
      return Array.from({ length: idx.getCount() }, (_, i) => [...pos.getElement(idx.getScalar(i), [0, 0, 0]), ...nor.getElement(idx.getScalar(i), [0, 0, 0])].join(','))
    })
    boxProject(after, 'toy', OPTS)
    expect(keyed(after)).toEqual(keyed(before))
    expect(soupHash(after)).toBe(soupHash(before))
    // A box corner is shared by three faces in three charts: 8 corners -> 24 vertices.
    expect(prims(after, 'Object_2')[0]!.getAttribute('POSITION')!.getCount()).toBe(24)
  })

  it('is deterministic: two runs give the same UVs and sidecar, hashing to the golden', async () => {
    const run = async () => {
      const doc = await afterShipMaterials()
      const side = boxProject(doc, 'toy', OPTS)
      const h = createHash('sha256').update(JSON.stringify(side))
      for (const p of prims(doc, 'Object_2')) h.update(new Uint8Array(p.getAttribute('TEXCOORD_0')!.getArray()!.buffer)).update(new Uint8Array(p.getIndices()!.getArray()!.buffer))
      return h.digest('hex')
    }
    const a = await run()
    expect(await run()).toBe(a)
    expect(a).toBe('f6289c2b51c8d51749e891bfa8fe087f851034069cb170e1386cf32474dea9df')
  })

  it('texel density is uniform: an axis-aligned edge is as long in texels x metersPerPx as in meters', async () => {
    const doc = await afterShipMaterials()
    const side = boxProject(doc, 'toy', OPTS)
    const p = prims(doc, 'Object_2')[0]!, pos = p.getAttribute('POSITION')!, uv = p.getAttribute('TEXCOORD_0')!, idx = p.getIndices()!
    for (let i = 0; i < idx.getCount(); i += 3) for (let k = 0; k < 3; k++) {
      const ia = idx.getScalar(i + k), ib = idx.getScalar(i + (k + 1) % 3)
      const pa = pos.getElement(ia, [0, 0, 0]), pb = pos.getElement(ib, [0, 0, 0])
      const axisAligned = [0, 1, 2].filter((c) => Math.abs(pa[c]! - pb[c]!) > 1e-6).length === 1
      if (!axisAligned) continue
      const ua = uv.getElement(ia, [0, 0]), ub = uv.getElement(ib, [0, 0])
      expect(Math.hypot(ua[0]! - ub[0]!, ua[1]! - ub[1]!) * 1024 * side.metersPerPx).toBeCloseTo(Math.hypot(pa[0]! - pb[0]!, pa[1]! - pb[1]!, pa[2]! - pb[2]!), 3)
    }
  })

  it('seams on a hull: each face paints its own role\'s color up to its chart edge, never black and never the neutral fill', async () => {
    const doc = await afterShipMaterials()
    const side = boxProject(doc, 'toy', { ...OPTS, atlasPx: 512 })
    const maps = await renderSkinMaps(doc, side, flat, skipSkirt)
    // A flat scan has no wear, so a face shows its palette color, lightened at most a few levels by chalking
    // on up-facing faces (fade <= 0.08): within 12 sRGB levels. The neutral fill (128 gray) is far outside.
    for (const p of prims(doc, 'Object_2')) {
      const want = side.roles[p.getMaterial()!.getName()]!.map((c) => c * 255)
      const uv = p.getAttribute('TEXCOORD_0')!, idx = p.getIndices()!
      for (let i = 0; i < idx.getCount(); i += 3) {
        const c = [0, 1, 2].map((k) => uv.getElement(idx.getScalar(i + k), [0, 0]))
        const px = Math.floor(((c[0]![0]! + c[1]![0]! + c[2]![0]!) / 3) * 512), py = Math.floor(((c[0]![1]! + c[1]![1]! + c[2]![1]!) / 3) * 512)
        const o = 3 * (py * maps.size + px)
        for (let k = 0; k < 3; k++) expect(Math.abs(maps.baseColor[o + k]! - want[k]!), `${p.getMaterial()!.getName()} tri ${i / 3} channel ${k}`).toBeLessThanOrEqual(12)
      }
    }
  })

  it('refuses what it cannot project: a leftover TEXCOORD_0, a non-ship material, a node off the identity', async () => {
    const uv = await afterShipMaterials()
    prims(uv, 'Object_2')[0]!.setAttribute('TEXCOORD_0', uv.createAccessor().setType('VEC2').setArray(new Float32Array(16)))
    expect(() => boxProject(uv, 'toy', OPTS)).toThrow(/only POSITION and NORMAL/)
    const named = await afterShipMaterials()
    prims(named, 'Object_2')[0]!.getMaterial()!.setName('Material.001')
    expect(() => boxProject(named, 'toy', OPTS)).toThrow(/ship:<role>/)
    const moved = await afterShipMaterials()
    moved.getRoot().listNodes().find((n) => n.getName() === 'Object_2')!.setTranslation([1, 0, 0])
    expect(() => boxProject(moved, 'toy', OPTS)).toThrow(/identity/)
  })
})

describe('island charts (M1d)', () => {
  const ISL = { ...OPTS, islands: true } as const
  /** The patch holding a primitive's first triangle's UV centroid. */
  const patchOf = (side: ReturnType<typeof boxProject>, p: Primitive): number => {
    const uv = p.getAttribute('TEXCOORD_0')!, idx = p.getIndices()!
    const c = [0, 1, 2].map((k) => uv.getElement(idx.getScalar(k), [0, 0]))
    const x = ((c[0]![0]! + c[1]![0]! + c[2]![0]!) / 3) * 1024, y = ((c[0]![1]! + c[1]![1]! + c[2]![1]!) / 3) * 1024
    return side.patches.find((q) => x >= q.rect[0] && x <= q.rect[0] + q.rect[2] && y >= q.rect[1] && y <= q.rect[1] + q.rect[3])!.id
  }

  it('overlapFraction counts the texels two triangles both cover', () => {
    const tri: [number, number][] = [[0, 0], [8, 0], [0, 8]]
    expect(overlapFraction(8, 8, [tri])).toBe(0)
    expect(overlapFraction(8, 8, [tri, tri])).toBe(1)
    expect(overlapFraction(8, 8, [])).toBe(1) // nothing to bake
  })

  it('charts each island apart, tags patches by role, bakes all that do not fold, and never moves geometry', async () => {
    const before = await afterShipMaterials(), doc = await afterShipMaterials()
    const side = boxProject(doc, 'toy', ISL)
    expect(new Set(side.patches.map((p) => p.tag))).toEqual(new Set(['ship:hull', 'ship:deck']))
    // One island per box face and role (the chamfer joins the hull's top, its tie going to +y): 2 x 6.
    expect(side.patches.length).toBe(12)
    // All but one: the chamfer joins the hull's top island and projects onto its starboard meter, a real fold.
    const top = patchOf(side, prims(doc, 'Object_2')[1]!)
    expect(side.baked).toEqual(side.patches.map((p) => p.id).filter((id) => id !== top))
    expect(soupHash(doc)).toBe(soupHash(before))
  })

  it('keeps a doubled face\'s island out of `baked`, and pools a part under 2 m unbaked', async () => {
    const doc = await afterShipMaterials()
    const hull = doc.getRoot().listMaterials().find((m) => m.getName() === 'ship:hull')!
    const deck = doc.getRoot().listMaterials().find((m) => m.getName() === 'ship:deck')!
    addMeshNode(doc, 'Doubled', [boxesPrimitive(doc, [[[-18, 3, -3], [18, 4, 3]]], deck)])
    addMeshNode(doc, 'Bolt', [boxesPrimitive(doc, [[[5, 4, 0], [5.5, 4.5, 0.5]]], hull)])
    smoothNormals(doc)
    const side = boxProject(doc, 'toy', ISL)
    expect(side.baked).not.toContain(patchOf(side, prims(doc, 'Doubled')[0]!))
    expect(side.baked).not.toContain(patchOf(side, prims(doc, 'Bolt')[0]!))
    expect(side.baked).toContain(patchOf(side, prims(doc, 'Object_2')[0]!))
  })
})

describe('a boxSkin entry through runPipeline (DP2)', () => {
  const SOURCE = { url: 'https://sketchfab.com/3d-models/toy-cv-0123456789abcdef0123456789abcdef', uid: '0123456789abcdef0123456789abcdef', author: 'tester', license: 'CC-BY-4.0' }
  const entry = (boxSkin: boolean) => parseModelEntry({
    id: 'toy-cv', input: 'tools/models/cache/toy-cv.glb', output: 'content/ships/toy-cv.glb', source: SOURCE,
    normalize: { forward: '-z', up: '+y', origin: [0, 0, 0], fit: { extent: 'length', meters: 265.8 } },
    textures: { maxSize: 512, format: 'webp' }, opaque: false, budget: { maxBytes: 2_000_000, maxTriangles: 2000, maxDrawCalls: 5 },
    ship: { spec: 'essex-cv', fit: 'deck', kind: 'waterline', palette: 'usn-1944', otherMaterials: 'classify', smokeOrigin: [20, 44, 14.5], bow: 'island-starboard' },
    ...(boxSkin ? { boxSkin: { atlasPx: 512 } } : {}),
  })
  /** shipStages.test.ts's toy carrier (CV-6 authoring: bow to -z, a tenth scale), with normals. */
  async function toyCarrier(): Promise<Document> {
    const doc = newDocument()
    const paint = doc.createMaterial('Material.001')
    const box = (min: V3, max: V3): [V3, V3] => [[min[2] / 10, min[1] / 10, -max[0] / 10], [max[2] / 10, max[1] / 10, -min[0] / 10]]
    addMeshNode(doc, 'Object_2', [boxesPrimitive(doc, [box([-130, 0, -13], [130, 15, 13]), box([-128, 15, -15], [128, 16, 15]), box([0, 16, 12], [40, 40, 15])], paint)])
    smoothNormals(doc)
    return doc
  }

  it('skins everything but the Skirt with one metallic-0 skin material, in two draws, drawing the same triangles as without it', async () => {
    const plain = await runPipeline(await toyCarrier(), entry(false), unarmed)
    const skinned = await runPipeline(await toyCarrier(), entry(true), unarmed, null, flat)
    expect(skinned.getRoot().listMaterials().map((m) => m.getName()).sort()).toEqual(['ship:boot', 'toy-cv-skin'])
    expect(skinned.getRoot().listMaterials().find((m) => m.getName() === 'toy-cv-skin')!.getMetallicFactor()).toBe(0)
    expect(skinned.getRoot().listTextures().map((t) => t.getName()).sort()).toEqual(['toy-cv-skin-baseColor', 'toy-cv-skin-metallicRoughness', 'toy-cv-skin-normal'])
    expect(measureDocument(skinned).drawCalls).toBe(2)
    expect(soupHash(skinned)).toBe(soupHash(plain))
    expect(skinned.getRoot().listNodes().map((n) => n.getName()).filter((n) => n === 'SmokeOrigin' || n === 'TrapBand').sort()).toEqual(['SmokeOrigin', 'TrapBand'])
  })
})
