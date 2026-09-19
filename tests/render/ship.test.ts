import { describe, it, expect } from 'vitest'
import { Box3, Mesh, Object3D } from 'three'
import { createShipMesh } from '../../src/render/scene/ship.js'
import { loadShipSpec } from '../../tools/content/load.js'

/**
 * The hulls are code-built from the class record, like the Hellcat, so the
 * only thing a headless test can check is that the record's dimensions
 * actually reach the geometry -- and that the mesh is authored in the frame
 * `main.ts` poses it in: bow along local +x, waterline at local y = 0. Get
 * either wrong and the ship sails sideways or floats above its own wake,
 * which is a Tier 3 finding, not a Tier 1 one.
 */
describe('createShipMesh', () => {
  for (const id of ['essex-cv', 'fletcher-dd']) {
    it(`${id}: bow along +x, waterline at y = 0, hull the class's length, every vertex finite`, () => {
      const spec = loadShipSpec(id)
      const object = createShipMesh(spec)
      const box = new Box3().setFromObject(object)
      expect(box.max.x - box.min.x).toBeCloseTo(spec.lengthM, 0)
      expect(box.max.z - box.min.z).toBeLessThanOrEqual(spec.deckWidthM + 1)
      expect(box.min.y).toBeLessThan(0)          // draft below the waterline
      expect(box.max.y).toBeGreaterThan(spec.deckHeightM) // something above the deck
      object.traverse((o: Object3D) => {
        if (o instanceof Mesh) {
          expect(Array.from(o.geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true)
        }
      })
    })
  }

  it('the carrier deck plane sits exactly at flightDeck.heightM with the flight deck dimensions, and carries a trap band (Plan 8)', () => {
    const cv = loadShipSpec('essex-cv')
    const mesh = createShipMesh(cv)
    const plane = mesh.getObjectByName('flight deck') as Mesh
    expect(plane).toBeDefined()
    plane.geometry.computeBoundingBox()
    const box = plane.geometry.boundingBox!
    // Local: bow along +x, waterline at y = 0. The TOP of the slab is the deck height.
    expect(box.max.y + plane.position.y).toBeCloseTo(cv.flightDeck!.heightM, 6)
    // Precision 4, not 6: BoxGeometry stores vertices in a Float32Array, and
    // at these magnitudes (131.35 m half-length) that alone rounds off by
    // ~1.2e-5 m -- verified with Math.fround(262.7 / 2), independent of this
    // module's implementation. Still 0.05 mm, far tighter than a real bug.
    expect(box.max.x - box.min.x).toBeCloseTo(cv.flightDeck!.lengthM, 4)
    expect(box.max.z - box.min.z).toBeCloseTo(cv.flightDeck!.widthM, 4)
    const band = mesh.getObjectByName('trap zone') as Mesh
    band.geometry.computeBoundingBox()
    const bb = band.geometry.boundingBox!
    // From the stern (-x) forward: fromSternM..toSternM.
    expect(bb.min.x + band.position.x).toBeCloseTo(-cv.flightDeck!.lengthM / 2 + cv.trapZone!.fromSternM, 6)
    expect(bb.max.x + band.position.x).toBeCloseTo(-cv.flightDeck!.lengthM / 2 + cv.trapZone!.toSternM, 6)
    expect(bb.max.y + band.position.y).toBeGreaterThan(cv.flightDeck!.heightM)
  })
})
