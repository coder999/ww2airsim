// tests/tools/models/wingSection.test.ts
import { describe, expect, it } from 'vitest'
import { addMeshNode, boxesPrimitive, newDocument } from './fixtures.js'
import { fitMount, sceneTriangles, wingSection } from '../../../tools/models/wingSection.js'
import { box } from '../../../tools/models/generated/mesh.js'

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
/** A slab wing: x 0..2 (leading edge at +2), lower skin y = 1, upper y = 1.2, span z -5..5. */
function slab(): Float64Array {
  const doc = newDocument()
  addMeshNode(doc, 'wing', [boxesPrimitive(doc, [[[0, 1, -5], [2, 1.2, 5]]])])
  return sceneTriangles(doc, IDENTITY)
}

describe('wingSection', () => {
  it('finds the leading and trailing edges and the lower skin at a station', () => {
    const s = wingSection(slab(), 2, -2)
    expect(s.leadingX).toBeCloseTo(2, 12)
    expect(s.trailingX).toBeCloseTo(0, 12)
    expect(s.lowerY(1)).toBeCloseTo(1, 12)
    expect(s.lowerY(3)).toBe(Infinity)
  })
  it('applies the to-sim matrix after each node\'s world matrix (a scale of 2 doubles the chord)', () => {
    const doc = newDocument()
    addMeshNode(doc, 'wing', [boxesPrimitive(doc, [[[0, 1, -5], [2, 1.2, 5]]])])
    const s = wingSection(sceneTriangles(doc, [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1]), 4, -2)
    expect(s.leadingX - s.trailingX).toBeCloseTo(4, 12)
  })
  it('names the station when nothing crosses it', () => {
    expect(() => wingSection(slab(), 9, -2)).toThrow(/z = 9/)
  })
})

describe('fitMount', () => {
  const cube = box([-0.1, -0.2, -0.1], [0.1, 0, 0.1], 0, -0.1, [0, 0, 0], 1) // a 0.2 m store whose top is its origin
  const at = (z: number) => wingSection(slab(), z, -2)
  it('puts the lug point at the chord fraction on the lower skin, dropped just enough for the clearance', () => {
    const f = fitMount(at, 2, 0.5, 0, cube, 0.02)
    expect(f.offset[0]).toBeCloseTo(1, 3)
    expect(f.dropM).toBeCloseTo(0.02, 6)
    expect(f.offset[1]).toBeCloseTo(0.98, 3)
    expect(f.offset[2]).toBe(2)
    expect(f.clearanceM).toBeGreaterThanOrEqual(0.02 - 1e-9)
  })
  it('a pitched store drops further, because its raised end must clear too', () => {
    expect(fitMount(at, 2, 0.5, 0.2, cube, 0.02).dropM).toBeGreaterThan(0.02)
  })
})

