import { describe, it, expect, vi } from 'vitest'
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { createShipMesh, createShipView, probeShipSurface } from '../../src/render/scene/ship.js'
import { createModelCache } from '../../src/render/models/modelCache.js'
import { makeShipViewLoader, SHIP_MODELS } from '../../src/render/scene/shipModels.js'
import { loadShipSpec } from '../../tools/content/load.js'

/**
 * The hulls are code-built from the class record, like the Hellcat, so the
 * only thing a headless test can check is that the record's dimensions
 * actually reach the geometry -- and that the mesh is authored in the frame
 * `main.ts` poses it in: bow along local +x, waterline at local y = 0. Get
 * either wrong and the ship sails sideways or floats above its own wake,
 * which is a Tier 3 finding, not a Tier 1 one.
 *
 * `createShipMesh` returns a HANDLE, `{ root, setDamage }` (Plan 6b Task 8),
 * not the bare `Object3D` it used to: `root` is the exact object `main.ts`
 * poses every frame from the ship's kinematic position/heading, so
 * `setDamage`'s sink/list has to move an INNER child instead of `root`
 * itself, or the next frame's pose write would erase it.
 */
describe('createShipMesh', () => {
  for (const id of ['essex-cv', 'fletcher-dd']) {
    it(`${id}: bow along +x, waterline at y = 0, hull the class's length, every vertex finite`, () => {
      const spec = loadShipSpec(id)
      const { root: object } = createShipMesh(spec)
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
    const { root: mesh } = createShipMesh(cv)
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

  it("a merchant gets a taller, named superstructure box amidships; an escort's is not this one (Plan 6b Task 8, spec §2.2)", () => {
    const maru = loadShipSpec('type-b-maru')
    const { root: merchantRoot } = createShipMesh(maru)
    const merchantSuper = merchantRoot.getObjectByName('merchant superstructure') as Mesh
    expect(merchantSuper).toBeDefined()
    // Amidships: centred at local x = 0, not offset toward the bow the way
    // the escort's superstructure is.
    expect(merchantSuper.position.x).toBeCloseTo(0, 6)

    const dd = loadShipSpec('fletcher-dd')
    const { root: escortRoot } = createShipMesh(dd)
    expect(escortRoot.getObjectByName('merchant superstructure')).toBeUndefined()
  })

  it("setDamage sinks and lists an inner hull group (not root, which main.ts poses every frame), and hides root once sunk (Plan 6b Task 8)", () => {
    const dd = loadShipSpec('fletcher-dd')
    const { root, setDamage } = createShipMesh(dd)
    const hullGroup = root.getObjectByName('hull group')!
    expect(hullGroup.position.y).toBe(0)
    expect(hullGroup.rotation.x).toBe(0)
    expect(root.visible).toBe(true)

    setDamage(0, 0.5)
    expect(hullGroup.position.y).toBeLessThan(0)
    // A list is a roll about the keel (+x). Before S1 this was rotation.z, a bow-down trim (ship-models spec §6).
    expect(hullGroup.rotation.x).toBeCloseTo(-4 * Math.PI / 180, 12)
    expect(hullGroup.rotation.z).toBe(0)
    expect(root.visible).toBe(true) // still afloat, if barely

    setDamage(0, 1)
    expect(root.visible).toBe(false) // fully sunk
  })

  it('setDamage shows a smoke plume scaled by fire, reusing the engine-smoke curve (Plan 6b Task 8)', () => {
    const dd = loadShipSpec('fletcher-dd')
    const { root, setDamage } = createShipMesh(dd)
    const smoke = root.getObjectByName('ship smoke')!
    expect(smoke.visible).toBe(false) // no fire yet
    setDamage(1, 0)
    expect(smoke.visible).toBe(true)
    setDamage(0, 0)
    expect(smoke.visible).toBe(false)
  })
})


it('names a carrier whose flight deck is missing', () => {
  const cv = loadShipSpec('essex-cv')
  expect(() => createShipMesh({ ...cv, flightDeck: undefined })).toThrow(/essex-cv.*flightDeck/)
})

/**
 * A synthetic fitted model, as a committed ship glb parses: bow +x,
 * waterline y = 0, a mast top at 30 m, `SmokeOrigin`, and on a carrier
 * `TrapBand` with its half-width. GLTFLoader never runs in Node, so the
 * cache's parse is injected (Z1's pattern, tests/render/scenarioEntities.test.ts).
 */
function syntheticShip(opts: { trapBand?: boolean; smoke?: boolean } = {}): Object3D {
  const root = new Group()
  const hull = new Mesh(new BoxGeometry(100, 10, 12), new MeshStandardMaterial({ color: 0x5c6670 }))
  hull.position.y = 2
  const mast = new Mesh(new BoxGeometry(1, 20, 1), new MeshStandardMaterial())
  mast.position.set(10, 20, 0)
  root.add(hull, mast)
  if (opts.smoke !== false) { const s = new Object3D(); s.name = 'SmokeOrigin'; s.position.set(-4, 18, 1); root.add(s) }
  if (opts.trapBand) { const t = new Object3D(); t.name = 'TrapBand'; t.userData['halfWidthM'] = 9.25; root.add(t) }
  return root
}

describe('ship models (ship-models spec §3, §6)', () => {
  const cv = loadShipSpec('essex-cv'), dd = loadShipSpec('fletcher-dd')

  it('a model view hangs the instance unmoved in hull group, smokes at SmokeOrigin, and sinks by its top plus 2 m about the keel', async () => {
    const cache = createModelCache(async () => syntheticShip())
    const view = createShipView(dd, 'fletcher-dd', await cache.acquire('x.glb'))
    const hullGroup = view.root.getObjectByName('hull group')!
    expect(view.model).toBe('fletcher-dd')
    const box = new Box3().setFromObject(hullGroup.children[0]!)
    expect([box.min.x, box.max.x, box.max.y]).toEqual([-50, 50, 30]) // unmoved: bow +x, waterline 0
    expect(view.root.getObjectByName('ship smoke')!.position.toArray()).toEqual([-4, 18, 1])
    view.setDamage(0, 0.5)
    expect(hullGroup.position.y).toBeCloseTo(-0.5 * (30 + 2), 9)
    expect(hullGroup.rotation.x).toBeCloseTo(-4 * Math.PI / 180, 12)
    view.setDamage(0, 1)
    expect(view.root.visible).toBe(false)
  })

  it('a carrier model draws the trap band from the spec, as wide as the model leaves clear', async () => {
    const cache = createModelCache(async () => syntheticShip({ trapBand: true }))
    const view = createShipView(cv, 'essex-cv', await cache.acquire('cv.glb'))
    const band = view.root.getObjectByName('trap zone') as Mesh
    band.geometry.computeBoundingBox()
    const bb = band.geometry.boundingBox!
    expect(bb.max.z - bb.min.z).toBeCloseTo(18.5, 6)
    expect(bb.min.x + band.position.x).toBeCloseTo(-cv.flightDeck!.lengthM / 2 + cv.trapZone!.fromSternM, 6)
    expect(bb.max.y + band.position.y).toBeCloseTo(cv.flightDeck!.heightM + 0.05, 6)
  })

  it('every mesh of a model view receives shadow (Plan 16b), and two instances share === materials', async () => {
    const cache = createModelCache(async () => syntheticShip())
    const a = createShipView(dd, 'fletcher-dd', await cache.acquire('dd.glb'))
    const b = createShipView(dd, 'fletcher-dd', await cache.acquire('dd.glb'))
    const meshes = (v: typeof a): Mesh[] => { const out: Mesh[] = []; v.root.traverse((o) => { if (o instanceof Mesh) out.push(o) }); return out }
    for (const m of meshes(a)) expect(m.receiveShadow).toBe(true)
    const hullA = meshes(a).find((m) => m.geometry instanceof BoxGeometry && m.geometry.parameters.width === 100)!
    const hullB = meshes(b).find((m) => m.geometry instanceof BoxGeometry && m.geometry.parameters.width === 100)!
    expect(hullA.material).toBe(hullB.material)
  })

  it('dispose releases the instance (never disposes shared materials) and frees the smoke and band it owns', async () => {
    const cache = createModelCache(async () => syntheticShip({ trapBand: true }))
    const view = createShipView(cv, 'essex-cv', await cache.acquire('cv.glb'))
    const other = createShipView(cv, 'essex-cv', await cache.acquire('cv.glb'))
    const shared = (view.root.getObjectByName('hull group')!.children[0]!.children[0] as Mesh).material as MeshStandardMaterial
    const spy = vi.spyOn(shared, 'dispose')
    expect(cache.refCount('cv.glb')).toBe(2)
    view.dispose()
    view.dispose()
    expect(cache.refCount('cv.glb')).toBe(1)
    expect(spy).not.toHaveBeenCalled()
    other.dispose()
    expect(cache.refCount('cv.glb')).toBe(0)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('the boxes still sink by their own top plus 2 m, and carry no model id', () => {
    const view = createShipMesh(dd)
    const hullGroup = view.root.getObjectByName('hull group')!
    // The hull's own top, without the smoke plume, which rides above it.
    const smoke = hullGroup.getObjectByName('ship smoke')!
    hullGroup.remove(smoke)
    const top = new Box3().setFromObject(hullGroup).max.y
    hullGroup.add(smoke)
    expect(top).toBe(21) // the escort's stack: deck 6 + superstructure 7 + stack 8
    view.setDamage(0, 1)
    expect(view.model).toBeNull()
    expect(view.root.getObjectByName('hull group')!.position.y).toBeCloseTo(-(top + 2), 9)
  })
})

describe('makeShipViewLoader: the loud fallback (spec §3.4)', () => {
  const dd = loadShipSpec('fletcher-dd')

  it('no view.model draws the boxes and reports nothing', async () => {
    const errors: string[] = []
    const view = await makeShipViewLoader((m) => errors.push(m), async () => { throw new Error('never asked') })({ ...dd, view: undefined })
    expect(view.model).toBeNull()
    expect(errors).toEqual([])
  })

  it('a registered model loads through the cache by its registry URL', async () => {
    const asked: string[] = []
    const cache = createModelCache(async (url) => { asked.push(url); return syntheticShip() })
    const view = await makeShipViewLoader(() => {}, (url) => cache.acquire(url))(dd)
    expect(view.model).toBe('fletcher-dd')
    expect(asked).toEqual([SHIP_MODELS['fletcher-dd']!.url])
  })

  it('a model that fails to load draws the boxes AND reports it, naming the ship and the model', async () => {
    const errors: string[] = []
    const view = await makeShipViewLoader((m) => errors.push(m), async () => { throw new Error('404 Not Found') })(dd)
    expect(view.model).toBeNull()
    expect(errors).toEqual([expect.stringMatching(/^ship fletcher-dd: model "fletcher-dd" failed.*404 Not Found/)])
  })

  it('a model missing SmokeOrigin is released, drawn as boxes, and reported', async () => {
    const errors: string[] = []
    const cache = createModelCache(async () => syntheticShip({ smoke: false }))
    const view = await makeShipViewLoader((m) => errors.push(m), (url) => cache.acquire(url))(dd)
    expect(view.model).toBeNull()
    expect(cache.refCount(SHIP_MODELS['fletcher-dd']!.url)).toBe(0)
    expect(errors[0]).toMatch(/required node "SmokeOrigin" not found/)
  })

  it('an unregistered or prototype-named model id is reported, never looked up on Object.prototype', async () => {
    for (const id of ['nope', 'constructor']) {
      const errors: string[] = []
      await makeShipViewLoader((m) => errors.push(m))({ ...dd, view: { model: id } })
      expect(errors[0]).toMatch(new RegExp(`no ship model "${id}" \\(registered: essex-cv, fletcher-dd, type-b-maru\\)`))
    }
  })
})

describe('probeShipSurface (the Tier 2 deck probe, spec §9)', () => {
  it('finds the posed deck under ship-frame and world points, the trap band on top of it, and nothing off the ship', () => {
    const cv = loadShipSpec('essex-cv')
    const fd = cv.flightDeck!, tz = cv.trapZone!
    const view = createShipMesh(cv)
    view.root.position.set(1000, 0, -500)
    view.root.rotation.y = Math.PI / 2 // ship +x (bow) -> world -z
    view.setDamage(1, 0) // the smoke is showing, and must not count as a surface
    const trapCenter = -fd.lengthM / 2 + (tz.fromSternM + tz.toSternM) / 2
    const bow = fd.lengthM / 2 - 5
    const [onBand, nearBow] = probeShipSurface(view, [{ x: trapCenter, z: 0 }, { x: bow, z: 0 }], 'ship')
    expect(onBand).toBeCloseTo(fd.heightM + 0.05, 4)
    expect(nearBow).toBeCloseTo(fd.heightM, 4)
    expect(probeShipSurface(view, [{ x: 1000, z: -500 - bow }], 'world')[0]).toBeCloseTo(fd.heightM, 4)
    expect(probeShipSurface(view, [{ x: 0, z: 0 }], 'world')).toEqual([null])
  })

  it('answers in sim metres under the floating origin, where the scene sits at minus the eye', () => {
    // main.ts sets `scene.position` to `worldOffsetFor(eye)` every frame and
    // adds each ship root straight to the scene. The first Tier 2 run
    // (2026-09-26) read null under the parked airplane: the world points and
    // the returned heights were in three's shifted frame, not the sim's.
    const cv = loadShipSpec('essex-cv')
    const fd = cv.flightDeck!
    const view = createShipMesh(cv)
    view.root.position.set(1000, 0, -500)
    view.root.rotation.y = Math.PI / 2
    const scene = new Group()
    scene.position.set(-1000, -(fd.heightM + 3), 480) // the eye, on the deck
    scene.add(view.root)
    const bow = fd.lengthM / 2 - 5
    expect(probeShipSurface(view, [{ x: 1000, z: -500 - bow }], 'world')[0]).toBeCloseTo(fd.heightM, 4)
    expect(probeShipSurface(view, [{ x: bow, z: 0 }], 'ship')[0]).toBeCloseTo(fd.heightM, 4)
    expect(probeShipSurface(view, [{ x: 0, z: 0 }], 'world')).toEqual([null])
  })
})
