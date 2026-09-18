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
})
