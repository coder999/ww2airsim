// tests/render/hangar/models.test.ts
import { describe, expect, it, vi } from 'vitest'
import { buildCatalog } from '../../../src/render/hangar/catalog.js'
import { flatField, loadHangarModel, partSpecsFor } from '../../../src/render/hangar/models.js'
import { createHellcat } from '../../../src/render/scene/hellcat.js'
import { heightAt } from '../../../src/sim/world/terrain.js'
import { nodeHangarContent } from './content.js'

const catalog = buildCatalog(nodeHangarContent())
const byId = (id: string) => catalog.find((e) => e.library.id === id)!

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
      const m = await loadHangarModel(byId(id))
      expect(m!.parts, id).toEqual([])
      expect(m!.counts().triangles, id).toBeGreaterThan(0)
      m!.dispose()
    }
  })

  it('"Not yet in service" loads nothing', async () => {
    expect(await loadHangarModel(catalog.find((e) => e.subject === null)!)).toBeNull()
  })

  it('the flat field is height 0 everywhere', () => {
    const f = flatField()
    expect([heightAt(f, 0, 0), heightAt(f, 123.4, -56.7), heightAt(f, 5e5, 0)]).toEqual([0, 0, 0])
  })
})
