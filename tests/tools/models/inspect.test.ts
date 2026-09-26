// tests/tools/models/inspect.test.ts
import { describe, expect, it } from 'vitest'
import { measureDocument } from '../../../tools/models/measure.js'
import { inspectDocument } from '../../../tools/models/inspect.js'
import { addMeshNode, boxesPrimitive, newDocument } from './fixtures.js'

describe('measureDocument / inspectDocument', () => {
  it('counts triangles and draw calls per mesh node and prints source-frame bounds', () => {
    const doc = newDocument()
    const group = doc.createNode('Rotor').setTranslation([100, 0, 0])
    doc.getRoot().listScenes()[0]!.addChild(group)
    addMeshNode(doc, 'Rotor_0', [boxesPrimitive(doc, [[[0, 0, 0], [1, 1, 1]]]), boxesPrimitive(doc, [[[2, 0, 0], [3, 1, 1]]])], group)
    const m = measureDocument(doc)
    expect(m.triangles).toBe(24)
    expect(m.drawCalls).toBe(2)
    expect(m.bounds.min).toEqual([100, 0, 0])
    const text = inspectDocument(doc, 'synthetic')
    expect(text).toContain('24 triangles, 2 draw calls')
    expect(text).toContain('"Rotor" 0/24')
    expect(text).toContain('min [100.000, 0.000, 0.000] max [103.000, 1.000, 1.000]')
  })
})
