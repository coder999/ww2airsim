import { describe, expect, it, vi } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three'
import {
  AIRFRAME_LOD_ENTER_M,
  AIRFRAME_LOD_EXIT_M,
  AIRFRAME_LOD_PROXY_NAME,
  createAirframeLod,
} from '../../src/render/scene/airframeLod.js'

const model = (): { root: Group; body: Group; gear: Mesh; store: Mesh } => {
  const root = new Group()
  const body = new Group()
  const skin = new Mesh(new BoxGeometry(8, 2, 10), new MeshStandardMaterial({ color: 0x315b35 }))
  const trim = new Mesh(new BoxGeometry(2, 1, 3), new MeshStandardMaterial({ color: 0xd9d1b8 }))
  trim.position.x = 4
  const gear = new Mesh(new BoxGeometry(1, 3, 1), new MeshStandardMaterial({ color: 0x222222 }))
  gear.name = 'GearL'
  body.add(skin, trim, gear)
  const store = new Mesh(new BoxGeometry(2, 1, 1), new MeshStandardMaterial({ color: 0x555555 }))
  store.visible = false
  root.add(body, store)
  return { root, body, gear, store }
}

describe('airframe far LOD', () => {
  it('bakes many materials into one lit mesh, excluding gear, then switches with hysteresis', () => {
    const a = model()
    const body = (a.body.children[0] as Mesh).geometry
    const trim = (a.body.children[1] as Mesh).geometry
    const bodyVertices = body.getAttribute('position').count
    const trimVertices = trim.getAttribute('position').count
    const lod = createAirframeLod('lod-one', a.root, a.body, [a.body, a.store], [a.gear])
    const proxy = a.root.getObjectByName(AIRFRAME_LOD_PROXY_NAME) as Mesh
    expect(proxy).toBeDefined()
    expect(proxy.geometry.getAttribute('position').count).toBe(bodyVertices + trimVertices)
    expect(proxy.geometry.getIndex()!.count).toBe(body.getIndex()!.count + trim.getIndex()!.count)
    expect(proxy.geometry.getAttribute('color')).toBeDefined()

    lod.update(AIRFRAME_LOD_ENTER_M, false)
    expect([a.body.visible, a.store.visible, proxy.visible]).toEqual([false, false, true])
    lod.update((AIRFRAME_LOD_ENTER_M + AIRFRAME_LOD_EXIT_M) / 2, false)
    expect(proxy.visible, 'hysteresis holds the far representation').toBe(true)
    lod.update(AIRFRAME_LOD_EXIT_M, false)
    expect([a.body.visible, a.store.visible, proxy.visible]).toEqual([true, false, false])
    lod.dispose()
  })

  it('remembers store visibility changed while far and damage immediately forces the full model', () => {
    const a = model()
    const lod = createAirframeLod('lod-two', a.root, a.body, [a.body, a.store], [a.gear])
    const proxy = a.root.getObjectByName(AIRFRAME_LOD_PROXY_NAME) as Mesh
    lod.update(AIRFRAME_LOD_ENTER_M, false)
    lod.mutateFull(() => { a.store.visible = true })
    expect(a.store.visible, 'the far model still hides a newly selected store').toBe(false)
    lod.update(AIRFRAME_LOD_ENTER_M, true)
    expect([a.body.visible, a.store.visible, proxy.visible]).toEqual([true, true, false])
    lod.dispose()
  })

  it('shares the baked geometry and frees it only after the last instance', () => {
    const a = model(), b = model()
    const one = createAirframeLod('lod-shared', a.root, a.body, [a.body], [a.gear])
    const two = createAirframeLod('lod-shared', b.root, b.body, [b.body], [b.gear])
    const pa = a.root.getObjectByName(AIRFRAME_LOD_PROXY_NAME) as Mesh
    const pb = b.root.getObjectByName(AIRFRAME_LOD_PROXY_NAME) as Mesh
    expect(pa.geometry).toBe(pb.geometry)
    expect(pa.material).toBe(pb.material)
    const dispose = vi.spyOn(pa.geometry, 'dispose')
    one.dispose()
    expect(dispose).not.toHaveBeenCalled()
    two.dispose()
    expect(dispose).toHaveBeenCalledOnce()
  })
})
