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
