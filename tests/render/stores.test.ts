import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, MeshStandardMaterial, type Mesh } from 'three'
import { attachStores, primitiveStoreVisuals, type StoreMounts, type StoreVisuals } from '../../src/render/scene/stores.js'
import { railOrder } from '../../src/sim/weapons/combat.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const mounts: StoreMounts = loadAircraftSpec('f6f-hellcat').stores!
const visuals = (): StoreVisuals => {
  const material = new MeshStandardMaterial()
  return { byStore: new Map([['an-m65', { geometry: new BoxGeometry(1, 1, 1), material }], ['hvar', { geometry: new BoxGeometry(2, 1, 1), material }]]), pitchRad: 0.128 }
}
const mesh = (root: Group, id: string): Mesh => root.getObjectByName(id) as Mesh

describe('attachStores (O1): the flying spec\'s mounts, the store models, the drawn datum', () => {
  it('one mesh per mount, named for it, at its offset, pitched, sharing the store\'s geometry', () => {
    const root = new Group(), v = visuals()
    attachStores(root, mounts, v)
    expect(root.children).toHaveLength(mounts.racks.length + mounts.rails.length)
    for (const m of [...mounts.racks, ...mounts.rails]) {
      const o = mesh(root, m.id)
      expect(o.position.toArray()).toEqual([...m.offset])
      expect(o.rotation.z).toBe(0.128)
      expect(o.geometry).toBe(v.byStore.get(m.store)!.geometry)
    }
  })

  it('bombs leave in rack order; rockets leave in the SIM\'s railOrder even when content lists rails shuffled', () => {
    const shuffled: StoreMounts = { racks: mounts.racks, rails: [...mounts.rails].reverse() }
    const root = new Group()
    const { setStores } = attachStores(root, shuffled, visuals())
    setStores(1, shuffled.rails.length - 2)
    expect(mesh(root, shuffled.racks[0]!.id).visible).toBe(false)
    expect(mesh(root, shuffled.racks[1]!.id).visible).toBe(true)
    const gone = railOrder(shuffled.rails).slice(0, 2).map((i) => shuffled.rails[i]!.id)
    for (const r of shuffled.rails) expect(mesh(root, r.id).visible, r.id).toBe(!gone.includes(r.id))
  })

  it('re-arming after empty shows every store again (restart)', () => {
    const root = new Group()
    const { setStores } = attachStores(root, mounts, visuals())
    setStores(0, 0)
    setStores(mounts.racks.length, mounts.rails.length)
    for (const c of root.children) expect(c.visible, c.name).toBe(true)
  })

  it('names a store with no visual', () => {
    const v: StoreVisuals = { byStore: new Map(), pitchRad: 0 }
    expect(() => attachStores(new Group(), mounts, v)).toThrow(/no visual for store "an-m65"/)
  })

  it('dispose removes its meshes and leaves the shared geometry alone', () => {
    const root = new Group(), v = visuals()
    let disposed = 0
    v.byStore.get('an-m65')!.geometry.addEventListener('dispose', () => { disposed++ })
    attachStores(root, mounts, v).dispose()
    expect(root.children).toHaveLength(0)
    expect(disposed).toBe(0)
  })

  it('primitive stand-ins cover every store id the mounts name, unpitched', () => {
    const p = primitiveStoreVisuals(mounts, new MeshStandardMaterial())
    expect([...p.byStore.keys()].sort()).toEqual(['an-m65', 'hvar'])
    expect(p.pitchRad).toBe(0)
    p.dispose()
  })
})
