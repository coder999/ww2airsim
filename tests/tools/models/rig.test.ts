// tests/tools/models/rig.test.ts
import { describe, expect, it } from 'vitest'
import { bounds, boxPositions, centroid, legTop, principalYawDeg, radiusAbout, rotateAbout, symmetryError, worldPositions, type Vec3 } from '../../../tools/models/rig.js'
import { meshNodes } from '../../../tools/models/document.js'
import { addMeshNode, boxesPrimitive, newDocument } from './fixtures.js'

const X: Vec3 = [1, 0, 0]
/** A propeller-like star about the x axis through `hub`: `blades` rows of points out to r = 1.5. */
function star(hub: Vec3, blades = 3): Vec3[] {
  const out: Vec3[] = []
  for (let b = 0; b < blades; b++) {
    const a = (2 * Math.PI * b) / blades
    for (let i = 2; i <= 15; i++) {
      const r = i / 10
      for (const w of [-0.05, 0.05]) out.push([hub[0] + w, hub[1] + r * Math.cos(a) - w * Math.sin(a), hub[2] + r * Math.sin(a) + w * Math.cos(a)])
    }
  }
  return out
}
const close = (a: readonly number[], b: readonly number[], eps = 1e-9): void => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, -Math.log10(eps)))

describe('rig measurements (R3)', () => {
  it('rotateAbout: a right leg hanging down, turned +90 deg about +x, points inboard (-z)', () => {
    close(rotateAbout([0, -1, 0], [0, 0, 0], X, Math.PI / 2), [0, 0, -1])
    close(rotateAbout([1, -1, 2], [1, 0, 2], [0, 0, 1], Math.PI / 2), [2, 0, 2]) // +90 about +z: forward
  })

  it('a symmetric star: centroid on its hub, radius 1.5 to the blade corner, zero symmetry error there', () => {
    const hub: Vec3 = [10, 2, -3]
    const pts = star(hub)
    close(centroid(pts), hub, 1e-9)
    expect(radiusAbout(pts, hub, X)).toBeCloseTo(Math.hypot(1.5, 0.05), 9)
    expect(symmetryError(pts, hub, X, 3)).toBeLessThan(1e-9)
  })

  it('a pivot 0.1 m off the hub fails the 1% symmetry tolerance', () => {
    const hub: Vec3 = [0, 0, 0]
    const pts = star(hub)
    expect(symmetryError(pts, [0, 0.1, 0], X, 3)).toBeGreaterThan(0.01 * 1.5)
  })

  it('rejects a blade count below 2', () => {
    expect(() => symmetryError(star([0, 0, 0]), [0, 0, 0], X, 1)).toThrow(/blades must be an integer >= 2/)
  })

  it('legTop is the center of the top of a leg', () => {
    const doc = newDocument()
    const node = addMeshNode(doc, 'Leg', [boxesPrimitive(doc, [[[-0.1, -2, 1.9], [0.1, 0, 2.1]]])])
    close(legTop(worldPositions(node)), [0, 0, 2], 1e-6)
  })

  it('worldPositions applies the node transform; boxPositions keeps only what is inside the box', () => {
    const doc = newDocument()
    const node = addMeshNode(doc, 'Body', [boxesPrimitive(doc, [[[0, 0, 0], [1, 1, 1]], [[5, 0, 0], [6, 1, 1]]])])
    node.setTranslation([10, 0, 0])
    expect(bounds(worldPositions(node)).min[0]).toBeCloseTo(10, 9)
    const inside = boxPositions(meshNodes(doc), [14.5, -1, -1], [16.5, 2, 2])
    expect(inside).toHaveLength(8)
    expect(bounds(inside).min[0]).toBeCloseTo(15, 9)
  })

  it('principalYawDeg: points along 30 deg from +x toward +z read 30; along -x read 0', () => {
    const along = (deg: number): Vec3[] => Array.from({ length: 21 }, (_, i) => {
      const t = i - 10, a = (deg * Math.PI) / 180
      return [t * Math.cos(a), 0, t * Math.sin(a)] as Vec3
    })
    expect(principalYawDeg(along(30))).toBeCloseTo(30, 9)
    expect(principalYawDeg(along(180))).toBeCloseTo(0, 9)
    expect(principalYawDeg(along(-40))).toBeCloseTo(-40, 9)
  })
})
