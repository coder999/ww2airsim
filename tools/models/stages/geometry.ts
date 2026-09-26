// tools/models/stages/geometry.ts
import type { Document, mat4, Primitive } from '@gltf-transform/core'
import { compactPrimitive, transformPrimitive } from '@gltf-transform/functions'

/** Gives an unindexed primitive a 0..n-1 index buffer, so every stage can treat
 *  triangles as index triples. */
export function ensureIndices(doc: Document, prim: Primitive): Uint32Array {
  const existing = prim.getIndices()
  if (existing) return Uint32Array.from(existing.getArray() as ArrayLike<number>)
  const n = prim.getAttribute('POSITION')!.getCount()
  const seq = Uint32Array.from({ length: n }, (_, i) => i)
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(seq))
  return seq
}

/** A copy of `prim` drawing only `indices`, with vertex streams of its own
 *  (nothing shared with `prim`), transformed by `matrix` if one is given. */
export function carve(doc: Document, prim: Primitive, indices: Uint32Array, matrix?: mat4): Primitive {
  const copy = prim.clone()
  copy.setIndices(doc.createAccessor().setType('SCALAR').setArray(indices))
  compactPrimitive(copy)
  if (matrix) transformPrimitive(copy, matrix)
  return copy
}

/** World-space position of vertex `i` of `positions` under column-major `m`. */
export function applyMatrix(m: readonly number[], positions: ArrayLike<number>, i: number): [number, number, number] {
  const x = positions[3 * i]!, y = positions[3 * i + 1]!, z = positions[3 * i + 2]!
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  ]
}
