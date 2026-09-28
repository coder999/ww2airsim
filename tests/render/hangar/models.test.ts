// tests/render/hangar/models.test.ts
import { describe, expect, it, vi } from 'vitest'
import { buildCatalog } from '../../../src/render/hangar/catalog.js'
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D } from 'three'
import { displayModelUrl, flatField, loadHangarModel, partSpecsFor, probeArticulated, sceneCounts } from '../../../src/render/hangar/models.js'
import { createHellcat } from '../../../src/render/scene/hellcat.js'
import { createShipMesh } from '../../../src/render/scene/ship.js'
import { heightAt } from '../../../src/sim/world/terrain.js'
import { nodeHangarContent } from './content.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { staticModelUrl, shipModelUrl } from '../../../src/render/content.js'
import type { ModelInstance } from '../../../src/render/models/modelCache.js'

const catalog = buildCatalog(nodeHangarContent())
const byId = (id: string) => catalog.find((e) => e.library.id === id)!

describe('sceneCounts', () => {
  it('draws a single-material mesh once whatever its groups, and a multi-material one per group', async () => {
    const { BoxGeometry, Group, Mesh, MeshStandardMaterial } = await import('three')
    const one = new Mesh(new BoxGeometry(), new MeshStandardMaterial()) // 6 groups, one material
    const multi = new Mesh(new BoxGeometry(), Array.from({ length: 6 }, () => new MeshStandardMaterial()))
    const root = new Group(); root.add(one, multi)
    expect(sceneCounts(root)).toEqual({ triangles: 24, drawCalls: 7 })
  })
})

describe('partSpecsFor', () => {
  it("reports every bench part, modeled only where the airframe's parts say so", () => {
    const rows = partSpecsFor(['prop', 'gear', 'stores'])
    expect(rows.map((r) => [r.id, r.modeled])).toEqual([['gear', true], ['flaps', false], ['prop', true], ['stores', true]])
  })
})

describe('loadHangarModel (Node, with a stub airframe)', () => {
  it("an aircraft loads by its spec's view.model, stands at its gear height, and drives update", async () => {
    const hellcat = createHellcat()
    const update = vi.spyOn(hellcat, 'update')
    const asked: string[] = []
    const entry = byId('f4f-wildcat')
    const m = await loadHangarModel(entry, async (id) => { asked.push(id); return hellcat })
    expect(asked).toEqual(['wildcat'])
    expect(m!.root.position.y).toBe(entry.subject?.kind === 'aircraft' ? entry.subject.spec.gear.heightM : NaN)
    m!.pose({ throttle: 1 })
    m!.update(0.1)
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ throttle: 1, frameS: 0.1, gearFraction: 1 }))
    expect(m!.parts.find((p) => p.id === 'gear')!.modeled).toBe(false)
  })

  it('pose applies at once, without advancing the clock, so a frozen page still shows it (Tier 2 check 2)', async () => {
    const hellcat = createHellcat()
    const update = vi.spyOn(hellcat, 'update')
    const m = await loadHangarModel(byId('f4f-wildcat'), async () => hellcat)
    m!.pose({ gearFraction: 0 })
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ gearFraction: 0, frameS: 0 }))
  })

  it('a ship and a building load with no articulated parts and a non-zero triangle count', async () => {
    // A building spec with no model of its own draws drawBuilding's boxes. Every Library building
    // names its model since R4, so the case is the tower entry with its model removed.
    const c = nodeHangarContent()
    const bare = { ...c.library.find((e) => e.id === 'tower')! }
    delete bare.model
    const boxes = buildCatalog({ ...c, library: [bare] })[0]!
    for (const [id, entry] of [['essex-cv', byId('essex-cv')], ['tower without its model', boxes]] as const) {
      // The ship loader is the game's (S1); a stub keeps GLTFLoader out of Node.
      const m = await loadHangarModel(entry, undefined, async (spec) => createShipMesh(spec))
      expect(m!.parts, id).toEqual([])
      expect(m!.counts().triangles, id).toBeGreaterThan(0)
      m!.dispose()
    }
  })

  it("a ship loads through the game's ship loader, and disposes through its view", async () => {
    const asked: string[] = []
    let disposed = 0
    const m = await loadHangarModel(byId('fletcher-dd'), undefined, async (spec) => {
      asked.push(spec.id)
      const v = createShipMesh(spec)
      return { ...v, dispose: () => { disposed++; v.dispose() } }
    })
    expect(asked).toEqual(['fletcher-dd'])
    m!.dispose()
    expect(disposed).toBe(1)
  })

  it('"Not yet in service" loads nothing', async () => {
    // No shipped entry is undrawn since R5, so the case is a copy of the jeep with its model removed.
    const c = nodeHangarContent()
    const bare = { ...c.library.find((e) => e.id === 'willys-mb-jeep')!, id: 'test-undrawn' }
    delete (bare as { model?: unknown }).model
    const entry = buildCatalog({ ...c, library: [bare] })[0]!
    expect(entry.subject).toBeNull()
    expect(await loadHangarModel(entry)).toBeNull()
  })

  it('the flat field is height 0 everywhere', () => {
    const f = flatField()
    expect([heightAt(f, 0, 0), heightAt(f, 123.4, -56.7), heightAt(f, 5e5, 0)]).toEqual([0, 0, 0])
  })
})

describe('the ordnance category (O1, Task 8)', () => {
  it('an ordnance entry loads its store model through the injected loader, stands clear of the pad, and has no mounts', async () => {
    const entry = catalog.find((e) => e.library.id === 'an-m65')!
    const seen: string[] = []
    const model = await loadHangarModel(entry, undefined, undefined, async (id) => {
      seen.push(id)
      const root = new Group()
      root.add(new Mesh(new BoxGeometry(1.7, 0.5, 0.5).translate(0, -0.3, 0), new MeshStandardMaterial()))
      return { root, node: () => root, release: () => {} }
    })
    expect(seen).toEqual(['an-m65'])
    expect(new Box3().setFromObject(model!.root).min.y).toBeGreaterThanOrEqual(0)
    expect(model!.parts).toEqual([])
    expect(model!.mounts()).toEqual([])
  })

  it('an aircraft model reports one mount point per rack and rail of its spec; the Zero, with no stores, reports none', async () => {
    // createHellcat() hangs meshes named with the same mount ids content uses (Task 6's HELLCAT_MOUNTS).
    const hellcatEntry = byId('f4f-wildcat')
    const m = await loadHangarModel(hellcatEntry, async () => createHellcat())
    const spec = hellcatEntry.subject?.kind === 'aircraft' ? hellcatEntry.subject.spec : null
    expect(m!.mounts().map((p) => p.id)).toEqual([...spec!.stores!.racks, ...spec!.stores!.rails].map((r) => r.id))
    const zero = await loadHangarModel(byId('a6m-zero'), async () => createHellcat())
    expect(zero!.mounts()).toEqual([])
  })
})

describe('probeArticulated', () => {
  it('finds exactly the nodes a pose moves, and leaves the model at rest', () => {
    const root = new Group()
    const leg = new Object3D(); leg.name = 'leg'
    const prop = new Object3D(); prop.name = 'prop'
    const still = new Object3D(); still.name = 'still'
    const child = new Object3D(); child.name = 'child-of-leg' // moves in world, not locally
    leg.add(child); root.add(leg, prop, still)
    let rest = true
    const drive = (u: { gearFraction: number; flapFraction: number; throttle: number; frameS: number }): void => {
      leg.position.y = u.gearFraction
      prop.rotation.z += u.throttle * u.frameS * 40
      rest = u.gearFraction === 1 && u.flapFraction === 0
    }
    expect(probeArticulated(root, drive).map((o) => o.name).sort()).toEqual(['leg', 'prop'])
    expect(rest).toBe(true)
    expect(leg.position.y).toBe(1)
  })
})

describe('stores on the bench', () => {
  it('toggles hand setStores full racks or empty ones', async () => {
    const hellcat = createHellcat()
    const setStores = vi.spyOn(hellcat, 'setStores')
    const m = await loadHangarModel(byId('f4f-wildcat'), async () => hellcat)
    const stores = loadAircraftSpec('f4f-wildcat').stores!
    m!.pose({ bombs: false })
    expect(setStores).toHaveBeenLastCalledWith(0, stores.rails.length)
    m!.pose({ rockets: false, bombs: true })
    expect(setStores).toHaveBeenLastCalledWith(stores.racks.length, 0)
  })

  it('an aircraft reports what its probe found; a ship reports nothing', async () => {
    const m = await loadHangarModel(byId('f4f-wildcat'), async () => createHellcat())
    expect(m!.articulated.length).toBeGreaterThan(0) // the stub's propeller
    const s = await loadHangarModel(byId('essex-cv'), undefined, async (spec) => createShipMesh(spec))
    expect(s!.articulated).toEqual([])
  })
})

describe("an entry's own model (R1)", () => {
  const instance = (h = 5): { inst: ModelInstance; released: () => number } => {
    let n = 0
    const root = new Group()
    root.add(new Mesh(new BoxGeometry(10, h, 10).translate(0, h / 2, 0), new MeshStandardMaterial()))
    return { inst: { root, node: () => root, release: () => { n++ } }, released: () => n }
  }

  it('the hangar, with a spec and a model, draws the model through the display loader, not drawBuilding, and releases it', async () => {
    const seen: unknown[] = []
    const { inst, released } = instance()
    const m = await loadHangarModel(byId('hangar'), undefined, undefined, undefined, async (ref) => { seen.push(ref); return inst })
    expect(seen).toEqual([{ kind: 'building', id: 'hangar' }])
    expect(m!.root).toBe(inst.root) // the display model itself stands on the pad; drawBuilding never ran
    expect(m!.parts).toEqual([])
    m!.dispose()
    expect(released()).toBe(1)
  })

  it('every Library building draws its own model through the display loader, and one with a spec keeps its figures (R4)', async () => {
    const buildings = buildCatalog(nodeHangarContent()).filter((e) => e.library.kind === 'building')
    expect(buildings).toHaveLength(10)
    for (const entry of buildings) {
      const seen: unknown[] = []
      await loadHangarModel(entry, undefined, undefined, undefined, async (ref) => { seen.push(ref); return instance().inst })
      expect(seen, entry.library.id).toEqual([{ kind: 'building', id: entry.library.id }])
    }
    for (const id of ['hangar', 'tower', 'aaa']) expect(byId(id).subject?.kind, id).toBe('building')
  })

  it('a spec-less aircraft model loads by its id with no stores, stands on the pad by its bounds, and has no mounts', async () => {
    const c = nodeHangarContent()
    const corsair = { ...c.library.find((e) => e.id === 'f4u-corsair')!, model: { kind: 'aircraft' as const, id: 'wildcat' } }
    const entry = buildCatalog({ ...c, library: [corsair] })[0]!
    const asked: [string, unknown][] = []
    const m = await loadHangarModel(entry, async (id, stores) => { asked.push([id, stores]); return createHellcat() })
    expect(asked).toEqual([['wildcat', undefined]])
    expect(new Box3().setFromObject(m!.root).min.y).toBeCloseTo(0, 6)
    expect(m!.mounts()).toEqual([])
    expect(m!.parts.find((p) => p.id === 'prop')!.modeled).toBe(true)
  })

  it("the Hellcat, with a spec and its own model, draws the model with no stores, and its card keeps the spec (R3, P3)", async () => {
    const hellcat = byId('f6f-hellcat')
    expect(hellcat.subject?.kind).toBe('aircraft')
    expect(hellcat.library.model).toEqual({ kind: 'aircraft', id: 'f6f-hellcat' })
    const asked: [string, unknown][] = []
    const m = await loadHangarModel(hellcat, async (id, stores) => { asked.push([id, stores]); return createHellcat() })
    expect(asked).toEqual([['f6f-hellcat', undefined]])
    expect(m!.mounts()).toEqual([])
    expect(loadAircraftSpec('f6f-hellcat').view.model).toBe('f6f-hellcat') // sortie forms A4: the game now draws the same model
  })

  it('a ship model and a vehicle model go through the display loader too', async () => {
    const c = nodeHangarContent()
    const cruiser = { ...c.library.find((e) => e.id === 'cleveland-cl')!, model: { kind: 'ship' as const, id: 'essex-cv' } }
    const seenShip: unknown[] = []
    const shipEntry = buildCatalog({ ...c, library: [cruiser] })[0]!
    await loadHangarModel(shipEntry, undefined, undefined, undefined, async (ref) => { seenShip.push(ref); return instance().inst })
    expect(seenShip).toEqual([{ kind: 'ship', id: 'essex-cv' }])

    const tank = { ...c.library.find((e) => e.id === 'type97-chi-ha')!, model: { kind: 'vehicle' as const, id: 'type97-chi-ha' } }
    const seenVehicle: unknown[] = []
    const vehicleEntry = buildCatalog({ ...c, library: [tank] })[0]!
    await loadHangarModel(vehicleEntry, undefined, undefined, undefined, async (ref) => { seenVehicle.push(ref); return instance().inst })
    expect(seenVehicle).toEqual([{ kind: 'vehicle', id: 'type97-chi-ha' }])
  })

  it('displayModelUrl resolves ships and static models through their registries, and refuses an aircraft', () => {
    expect(displayModelUrl({ kind: 'ship', id: 'essex-cv' })).toBe(shipModelUrl('essex-cv'))
    expect(displayModelUrl({ kind: 'building', id: 'hangar' })).toBe(staticModelUrl('building', 'hangar'))
    expect(() => displayModelUrl({ kind: 'building', id: 'nope' })).toThrow(/no building model "nope"/)
    expect(() => displayModelUrl({ kind: 'aircraft', id: 'wildcat' })).toThrow(/airframe registry/)
  })
})
