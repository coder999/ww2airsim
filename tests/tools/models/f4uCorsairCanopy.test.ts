import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { Accessor, Node } from '@gltf-transform/core'
import { modelIO } from '../../../tools/models/document.js'

type Point = readonly [number, number, number]

function worldPoint(node: Node, position: Accessor, index: number): Point {
  const [x, y, z] = position.getElement(index, [0, 0, 0]) as [number, number, number]
  const m = node.getWorldMatrix()
  return [
    m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
    m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
    m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
  ]
}

describe('f4u-corsair-blender canopy', () => {
  it('has a connected, near-vertical side pane from the fuselage rail to the shoulder', async () => {
    const doc = await modelIO().readBinary(new Uint8Array(readFileSync('content/aircraft/f4u-corsair-blender.glb')))
    let found = false
    for (const node of doc.getRoot().listNodes().filter((candidate) => candidate.getMesh())) {
      for (const primitive of node.getMesh()!.listPrimitives()) {
        const position = primitive.getAttribute('POSITION')
        const indices = primitive.getIndices()
        if (!position || !indices) continue
        for (let i = 0; i < indices.getCount(); i += 3) {
          const triangle = [0, 1, 2].map((offset) => worldPoint(node, position, indices.getScalar(i + offset)))
          for (const [a, b] of [[triangle[0]!, triangle[1]!], [triangle[1]!, triangle[2]!], [triangle[2]!, triangle[0]!]] as const) {
            const [low, high] = a[1] < b[1] ? [a, b] : [b, a]
            if (Math.abs(low[0] + 1.83) < 0.03 && Math.abs(high[0] + 1.83) < 0.03 &&
                low[2] > 0.35 && high[2] > 0.35 && Math.abs(high[2] - low[2]) < 0.06 &&
                low[1] > 0.68 && low[1] < 0.85 && high[1] > 1.0 && high[1] < 1.14) found = true
          }
        }
      }
    }
    expect(found, 'no connected canopy edge rises from the local fuselage rail to the side-pane shoulder').toBe(true)
  })
})
