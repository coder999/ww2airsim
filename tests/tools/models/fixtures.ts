// tests/tools/models/fixtures.ts
import { Document, type Material, type Node, type Primitive } from '@gltf-transform/core'

export type V3 = [number, number, number]

/** One closed box: 8 shared corners, 12 triangles, wound outward. */
export function boxArrays(min: V3, max: V3): { positions: number[]; indices: number[] } {
  const [x0, y0, z0] = min, [x1, y1, z1] = max
  const positions = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]
  const indices = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]
  return { positions, indices }
}

/** One primitive holding every box given, as separate shells. */
export function boxesPrimitive(doc: Document, boxes: [V3, V3][], material?: Material): Primitive {
  const positions: number[] = [], indices: number[] = []
  for (const [min, max] of boxes) {
    const b = boxArrays(min, max)
    const base = positions.length / 3
    positions.push(...b.positions)
    indices.push(...b.indices.map((i) => i + base))
  }
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)))
  if (material) prim.setMaterial(material)
  return prim
}

/** An n x n grid of quads in the XZ plane at y = 0, 2n^2 triangles, with a gentle bump. */
export function gridPrimitive(doc: Document, n: number, size: number): Primitive {
  const positions: number[] = [], indices: number[] = []
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) positions.push((i / n) * size, 0, (j / n) * size)
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const a = i * (n + 1) + j, b = a + 1, c = a + n + 1, d = c + 1
    indices.push(a, b, d, a, d, c)
  }
  return doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)))
}

/** A new document with one scene and one buffer. */
export function newDocument(): Document {
  const doc = new Document()
  doc.createBuffer()
  doc.createScene('scene')
  return doc
}

/** Adds a mesh node (or a group holding one, Sketchfab-style) under `parent` or the scene. */
export function addMeshNode(doc: Document, name: string, prims: Primitive[], parent?: Node): Node {
  const mesh = doc.createMesh(name)
  for (const p of prims) mesh.addPrimitive(p)
  const node = doc.createNode(name).setMesh(mesh)
  if (parent) parent.addChild(node)
  else doc.getRoot().listScenes()[0]!.addChild(node)
  return node
}

/** World-space positions of every vertex under `node` (its own mesh only). */
export function worldPositions(node: Node): number[][] {
  const m = node.getWorldMatrix() as unknown as number[]
  const out: number[][] = []
  for (const prim of node.getMesh()?.listPrimitives() ?? []) {
    const p = prim.getAttribute('POSITION')!.getArray()!
    for (let i = 0; i < p.length / 3; i++) {
      const x = p[3 * i]!, y = p[3 * i + 1]!, z = p[3 * i + 2]!
      out.push([m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!])
    }
  }
  return out
}
