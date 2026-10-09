// tests/tools/models/geometryStages.test.ts
import { describe, expect, it } from 'vitest'
import { getBounds } from '@gltf-transform/functions'
import { findNode, meshNodes } from '../../../tools/models/document.js'
import type { ModelEntry } from '../../../tools/models/manifest.js'
import { nodeTriangles } from '../../../tools/models/measure.js'
import { removeNodes } from '../../../tools/models/stages/remove.js'
import { splitByBox } from '../../../tools/models/stages/split.js'
import { collapseKept } from '../../../tools/models/stages/collapse.js'
import { pivotNode } from '../../../tools/models/stages/pivot.js'
import { normalizeDocument, normalizeMatrix } from '../../../tools/models/stages/normalize.js'
import { addMeshNode, boxesPrimitive, newDocument, worldPositions } from './fixtures.js'
import { worldTriangles } from './buildingGeometry.js'

const close = (a: readonly number[], b: readonly number[], eps = 1e-4): boolean => a.every((v, i) => Math.abs(v - b[i]!) < eps)
/** Vertex sets compared order-free: compaction reorders vertices, and only positions matter. */
const sorted = (ps: number[][]): number[][] => [...ps].sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!)
const sameSet = (a: number[][], b: number[][], eps = 1e-4): boolean => {
  const sa = sorted(a), sb = sorted(b)
  return sa.length === sb.length && sa.every((p, i) => close(p, sb[i]!, eps))
}

describe('removeNodes', () => {
  it('drops a node and its subtree, and fails loudly on a name that is not there', () => {
    const doc = newDocument()
    const tank = addMeshNode(doc, 'Tank', [boxesPrimitive(doc, [[[0, 0, 0], [1, 1, 1]]])])
    addMeshNode(doc, 'TankStrap', [boxesPrimitive(doc, [[[0, 0, 0], [1, 1, 1]]])], tank)
    addMeshNode(doc, 'Body', [boxesPrimitive(doc, [[[0, 0, 0], [1, 1, 1]]])])
    removeNodes(doc, ['Tank'])
    expect(meshNodes(doc).map((n) => n.getName())).toEqual(['Body'])
    expect(() => removeNodes(doc, ['Pylon'])).toThrow(/"Pylon"/)
  })
})

describe('splitByBox', () => {
  it('components: takes a whole shell whose bounds lie inside the box, in world space, and leaves the rest', () => {
    const doc = newDocument()
    // Body shell at x 0..10, tailwheel shell at x 20..21, under a node translated +100 in x.
    const body = addMeshNode(doc, 'Corps', [boxesPrimitive(doc, [[[0, 0, 0], [10, 2, 2]], [[20, 0, 0], [21, 1, 1]]])])
    body.setTranslation([100, 0, 0])
    const wheel = splitByBox(doc, { name: 'Tailwheel', select: 'components', boxMin: [119, -1, -1], boxMax: [122, 3, 3] })
    expect(nodeTriangles(wheel)).toBe(12)
    expect(nodeTriangles(body)).toBe(12)
    const wb = getBounds(wheel)
    expect(close(wb.min, [120, 0, 0]) && close(wb.max, [121, 1, 1])).toBe(true)
    // A box that clips a shell does not take it.
    expect(() => splitByBox(doc, { name: 'Half', select: 'components', boxMin: [99, -1, -1], boxMax: [105, 3, 3] })).toThrow(/selected no triangles/)
  })

  it('triangles: takes each triangle whose centroid is inside the box, cutting through a shell', () => {
    const doc = newDocument()
    const body = addMeshNode(doc, 'Corps', [boxesPrimitive(doc, [[[0, 0, 0], [10, 2, 2]]])])
    const cut = splitByBox(doc, { name: 'Belly', select: 'triangles', boxMin: [-1, -1, -1], boxMax: [11, 0.5, 3] })
    expect(nodeTriangles(cut)).toBe(2) // the y = 0 face, whose centroids sit at y = 0
    expect(nodeTriangles(body)).toBe(10)
  })
})

describe('splitByBox with a cut (C1 batch 2)', () => {
  const area = (n: Parameters<typeof worldTriangles>[0]): number => worldTriangles(n).reduce((s, [a, b, c]) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    return s + Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!) / 2
  }, 0)

  it('slices triangles that span the hinge, takes exactly the side behind it, and loses no area', () => {
    const doc = newDocument()
    // A 10 x 2 x 2 box whose long faces are each ONE quad end to end (as a download's wing skin is),
    // under a +100 x translation: no edge lies at x = 107, where the cut is.
    const body = addMeshNode(doc, 'Wing', [boxesPrimitive(doc, [[[0, 0, 0], [10, 2, 2]]])])
    body.setTranslation([100, 0, 0])
    const before = area(body)
    const flap = splitByBox(doc, { name: 'Flap', select: 'triangles', boxMin: [106, -1, -1], boxMax: [111, 3, 3], pivot: { point: [107, 0, 0] }, cut: { normal: [1, 0, 0] } })
    // Behind the plane: 3 m of the four long faces (3 x 2 each) plus the 2 x 2 end, and the 2 x 2 cap on
    // the hinge plane; the body gains the same cap facing the other way.
    expect(area(flap)).toBeCloseTo(4 * 3 * 2 + 4 + 4, 9)
    expect(area(flap) + area(body)).toBeCloseTo(before + 2 * 4, 9)
    expect(worldPositions(flap).every((p) => p[0]! >= 107 - 1e-9)).toBe(true)
    expect(worldPositions(body).every((p) => p[0]! <= 107 + 1e-9)).toBe(true)
  })
})

describe('splitByBox with a cut: caps (C1 batch 2 review)', () => {
  type Tri = ReturnType<typeof worldTriangles>[number]
  const key = (p: readonly number[]): string => p.map((c) => Math.round(c * 1e4)).join(',')
  /** Edges shared by other than exactly two triangles, by position: 0 for a closed shell. */
  const openEdges = (tris: Tri[]): number => {
    const n = new Map<string, number>()
    for (const t of tris) for (let k = 0; k < 3; k++) { const a = key(t[k]!), b = key(t[(k + 1) % 3]!); if (a === b) continue; const e = a < b ? `${a}|${b}` : `${b}|${a}`; n.set(e, (n.get(e) ?? 0) + 1) }
    return [...n.values()].filter((c) => c !== 2).length
  }
  const volume = (tris: Tri[]): number => tris.reduce((s, [a, b, c]) => s + (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6, 0)

  it('the piece and the body it leaves are both closed solids: the cut openings are capped, facing out', () => {
    const doc = newDocument()
    const body = addMeshNode(doc, 'Wing', [boxesPrimitive(doc, [[[0, 0, 0], [10, 2, 2]]])])
    body.setTranslation([100, 0, 0])
    // The box takes only the middle of the span (z 0.5..1.5), so the piece has three cut faces: the
    // hinge plane at x 107 and the box's two z faces, and the body a slot with the same three.
    const flap = splitByBox(doc, { name: 'Flap', select: 'triangles', boxMin: [106, -1, 0.5], boxMax: [111, 3, 1.5], pivot: { point: [107, 0, 0] }, cut: { normal: [1, 0, 0] } })
    expect(openEdges(worldTriangles(flap))).toBe(0)
    expect(openEdges(worldTriangles(body))).toBe(0)
    // Positive volumes: every cap faces out of its own solid. The flap is 3 x 2 x 1; the body the rest of 10 x 2 x 2.
    expect(volume(worldTriangles(flap))).toBeCloseTo(6, 9)
    expect(volume(worldTriangles(body))).toBeCloseTo(40 - 6, 9)
  })

  it('caps a shell whose skins are two materials (two primitives) as one solid, not two slivers', () => {
    // The F4U's elevators: upper and lower skin are different materials. Here the box's upper half of
    // triangles is one primitive and the rest another, both on one node.
    const doc = newDocument()
    const whole = boxesPrimitive(doc, [[[0, 0, 0], [10, 2, 2]]])
    const all = Array.from(whole.getIndices()!.getArray() as ArrayLike<number>)
    const pos = whole.getAttribute('POSITION')!
    const upper: number[] = [], rest: number[] = []
    for (let t = 0; t < all.length; t += 3) {
      const ys = [0, 1, 2].map((k) => pos.getElement(all[t + k]!, [0, 0, 0])[1]!)
      ;(ys.every((y) => y > 1.5) ? upper : rest).push(all[t]!, all[t + 1]!, all[t + 2]!)
    }
    const a = whole.clone().setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(upper))).setMaterial(doc.createMaterial('upper'))
    const b = whole.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(rest))).setMaterial(doc.createMaterial('lower'))
    const body = addMeshNode(doc, 'Tail', [a, b])
    const elevator = splitByBox(doc, { name: 'Elevator', select: 'triangles', boxMin: [6, -1, 0.5], boxMax: [11, 3, 1.5], pivot: { point: [7, 0, 0] }, cut: { normal: [1, 0, 0] } })
    expect(elevator.getMesh()!.listPrimitives()).toHaveLength(2)
    expect(openEdges(worldTriangles(elevator))).toBe(0)
    expect(openEdges(worldTriangles(body))).toBe(0)
    expect(volume(worldTriangles(elevator))).toBeCloseTo(6, 9)
  })

  it('a cut piece carved from two primitives of ONE material is one primitive, one draw (C1 batch 3)', () => {
    // The Zero's Corps body is two primitives of one material, so its surfaces came out as two draws each.
    const doc = newDocument()
    const skin = doc.createMaterial('Corps')
    const whole = boxesPrimitive(doc, [[[0, 0, 0], [10, 2, 2]]]).setMaterial(skin)
    const all = Array.from(whole.getIndices()!.getArray() as ArrayLike<number>)
    const half = all.length / 2 - ((all.length / 2) % 3)
    const a = whole.clone().setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(all.slice(0, half))))
    const b = whole.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(all.slice(half))))
    const body = addMeshNode(doc, 'Corps', [a, b])
    const rudder = splitByBox(doc, { name: 'Rudder', select: 'triangles', boxMin: [6, -1, 0.5], boxMax: [11, 3, 1.5], pivot: { point: [7, 0, 0] }, cut: { normal: [1, 0, 0] } })
    expect(rudder.getMesh()!.listPrimitives()).toHaveLength(1)
    expect(rudder.getMesh()!.listPrimitives()[0]!.getMaterial()).toBe(skin)
    expect(openEdges(worldTriangles(rudder))).toBe(0)
    expect(openEdges(worldTriangles(body))).toBe(0)
    expect(volume(worldTriangles(rudder))).toBeCloseTo(6, 9)
  })
})

describe('collapseKept + pivotNode + normalizeDocument', () => {
  /** A Sketchfab-shaped part: group `Rotor` (scaled x100, y and z swapped) holding mesh `Rotor_Rotor_0`. */
  function sketchfabDoc() {
    const doc = newDocument()
    const root = doc.createNode('Sketchfab_model').setRotation([-Math.SQRT1_2, 0, 0, Math.SQRT1_2])
    doc.getRoot().listScenes()[0]!.addChild(root)
    const rotor = doc.createNode('Rotor').setScale([100, 100, 100])
    root.addChild(rotor)
    addMeshNode(doc, 'Rotor_Rotor_0', [boxesPrimitive(doc, [[[2, -0.1, -1], [2.1, 0.1, 1]]])], rotor)
    const corps = doc.createNode('Corps').setScale([100, 100, 100])
    root.addChild(corps)
    addMeshNode(doc, 'Corps_Corps_0', [boxesPrimitive(doc, [[[-3, -0.5, -0.5], [2, 0.5, 0.5]], [[0, -0.1, -6], [1, 0.1, 6]]])], corps)
    return doc
  }

  it('collapse turns a group part into one scene-root leaf without moving a vertex', () => {
    const doc = sketchfabDoc()
    const before = worldPositions(findNode(doc, 'Rotor_Rotor_0'))
    const prop = collapseKept(doc, { node: 'Rotor', as: 'Prop' })
    expect(prop.getParentNode()).toBeNull()
    expect(() => findNode(doc, 'Rotor')).toThrow()
    expect(sameSet(worldPositions(prop), before)).toBe(true)
  })

  it('pivot moves the origin onto the stated point, not a vertex, and records the axis', () => {
    const doc = sketchfabDoc()
    const prop = collapseKept(doc, { node: 'Rotor', as: 'Prop' })
    const before = worldPositions(prop)
    pivotNode(doc, prop, { point: [205, 0, 0], axis: '+x' })
    expect(prop.getTranslation()).toEqual([205, 0, 0])
    expect(prop.getExtras()['pivotAxis']).toEqual([1, 0, 0])
    expect(sameSet(worldPositions(prop), before)).toBe(true)
  })

  it('normalize bakes forward/up/origin/fit: every vertex lands at M * source, parts keep only a translation', () => {
    const doc = sketchfabDoc()
    const prop = collapseKept(doc, { node: 'Rotor', as: 'Prop' })
    pivotNode(doc, prop, { point: [205, 0, 0], axis: '+x' })
    // Source frame after the root's -90 degree X rotation: nose +x, span along y... measure it rather than assume:
    const b = getBounds(doc.getRoot().listScenes()[0]!)
    const n: NonNullable<ModelEntry['normalize']> = { forward: '+x', up: '+z', origin: [0, 0, 0], fit: { extent: 'span', meters: 12 } }
    const m = normalizeMatrix(n, b.min, b.max)
    const sourceProp = worldPositions(prop)
    const sourceBody = worldPositions(findNode(doc, 'Corps_Corps_0'))
    normalizeDocument(doc, n)
    const apply = (p: number[]) => [0, 1, 2].map((r) => m[r]! * p[0]! + m[4 + r]! * p[1]! + m[8 + r]! * p[2]! + m[12 + r]!)
    expect(sameSet(worldPositions(findNode(doc, 'Prop')), sourceProp.map(apply))).toBe(true)
    expect(sameSet(worldPositions(findNode(doc, 'Corps_Corps_0')), sourceBody.map(apply))).toBe(true)
    // Span (output Z) is exactly 12 m; the part carries translation only; groups are gone.
    const out = getBounds(doc.getRoot().listScenes()[0]!)
    expect(out.max[2]! - out.min[2]!).toBeCloseTo(12, 6)
    const p = findNode(doc, 'Prop')
    expect(p.getParentNode()).toBeNull()
    expect(p.getRotation()).toEqual([0, 0, 0, 1])
    expect(p.getScale()).toEqual([1, 1, 1])
    expect(close(p.getTranslation(), apply([205, 0, 0]))).toBe(true)
    expect(p.getExtras()['pivotAxis']).toEqual([1, 0, 0])
    expect(() => findNode(doc, 'Sketchfab_model')).toThrow()
  })

  it('normalize maps forward -x / up +y onto +X / +Y, and right-handedness puts the source -z side on +Z', () => {
    const doc = newDocument()
    // Nose at source -x (x = -5), right wingtip at source -z.
    addMeshNode(doc, 'Body', [boxesPrimitive(doc, [[[-5, 0, -0.5], [5, 1, 0.5]], [[0, 0, -6], [1, 0.2, -5]]])])
    normalizeDocument(doc, { forward: '-x', up: '+y', origin: [0, 0, 0], fit: { extent: 'length', meters: 10 } })
    const b = getBounds(doc.getRoot().listScenes()[0]!)
    expect(b.max[0]).toBeCloseTo(5, 5) // the nose, now +X
    expect(b.max[2]).toBeCloseTo(6, 5) // (-x) x (+y) = +z... check: f=(-1,0,0), u=(0,1,0), r=f x u=(0,0,-1): source -z -> +Z
  })
})
