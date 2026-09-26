// tests/render/hangar/models.test.ts
import { describe, expect, it, vi } from 'vitest'
import { buildCatalog } from '../../../src/render/hangar/catalog.js'
import { flatField, loadHangarModel, partSpecsFor, sceneCounts } from '../../../src/render/hangar/models.js'
import { createHellcat } from '../../../src/render/scene/hellcat.js'
import { createShipMesh } from '../../../src/render/scene/ship.js'
import { heightAt } from '../../../src/sim/world/terrain.js'
import { nodeHangarContent } from './content.js'

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
    expect(rows.map((r) => [r.id, r.modeled])).toEqual([['gear', true], ['flaps', false], ['prop', true]])
  })
})

describe('loadHangarModel (Node, with a stub airframe)', () => {
  it("an aircraft loads by its spec's view.model, stands at its gear height, and drives update", async () => {
    const hellcat = createHellcat()
    const update = vi.spyOn(hellcat, 'update')
    const asked: string[] = []
    const entry = byId('f6f-hellcat')
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
    const m = await loadHangarModel(byId('f6f-hellcat'), async () => hellcat)
    m!.pose({ gearFraction: 0 })
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ gearFraction: 0, frameS: 0 }))
  })

  it('a ship and a building load with no articulated parts and a non-zero triangle count', async () => {
    for (const id of ['essex-cv', 'hangar']) {
      // The ship loader is the game's (S1); a stub keeps GLTFLoader out of Node.
      const m = await loadHangarModel(byId(id), undefined, async (spec) => createShipMesh(spec))
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
    expect(await loadHangarModel(catalog.find((e) => e.subject === null)!)).toBeNull()
  })

  it('the flat field is height 0 everywhere', () => {
    const f = flatField()
    expect([heightAt(f, 0, 0), heightAt(f, 123.4, -56.7), heightAt(f, 5e5, 0)]).toEqual([0, 0, 0])
  })
})
