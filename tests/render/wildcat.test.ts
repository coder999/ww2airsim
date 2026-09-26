// tests/render/wildcat.test.ts
import { describe, expect, it, vi } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three'
import { applyGearFraction, GEAR_DOWN, GEAR_UP, loadWildcat, WILDCAT_DATUM_PITCH_RAD, WILDCAT_TO_SIM_ROTATION_Y, WILDCAT_SCALE, wildcatToSimMatrix } from '../../src/render/scene/wildcat.js'
import { WILDCAT_CORRECTION_NAME } from '../../src/render/scene/wildcatFrame.js'
import { createModelCache } from '../../src/render/models/modelCache.js'
import { ordnanceModelUrl, WILDCAT_MODEL_URL } from '../../src/render/content.js'
import { loadAircraftSpec } from '../../tools/content/load.js'

const f6fMounts = loadAircraftSpec('f6f-hellcat').stores!

describe('applyGearFraction', () => {
  it('fraction 1 (extended) matches the measured gear-down pose', () => {
    const node = new Object3D()
    applyGearFraction(node, GEAR_DOWN.der, GEAR_UP.der, 1)
    expect(node.position.distanceTo(GEAR_DOWN.der.pos)).toBeLessThan(1e-6)
    expect(node.quaternion.angleTo(GEAR_DOWN.der.quat)).toBeLessThan(1e-6)
  })

  it('fraction 0 (retracted) matches the measured gear-up pose', () => {
    const node = new Object3D()
    applyGearFraction(node, GEAR_DOWN.der, GEAR_UP.der, 0)
    expect(node.position.distanceTo(GEAR_UP.der.pos)).toBeLessThan(1e-6)
    expect(node.quaternion.angleTo(GEAR_UP.der.quat)).toBeLessThan(1e-6)
  })

  it('interpolates continuously mid-travel (gear.travelSeconds is 7s, not instant)', () => {
    const node = new Object3D()
    applyGearFraction(node, GEAR_DOWN.der, GEAR_UP.der, 0.3)
    const at30 = node.position.clone()
    applyGearFraction(node, GEAR_DOWN.der, GEAR_UP.der, 0.7)
    const at70 = node.position.clone()
    // 0.7 is closer to the down (fraction=1) pose than 0.3 is
    expect(at70.distanceTo(GEAR_DOWN.der.pos)).toBeLessThan(at30.distanceTo(GEAR_DOWN.der.pos))
    expect(at30.distanceTo(GEAR_UP.der.pos)).toBeLessThan(at70.distanceTo(GEAR_UP.der.pos))
  })
})

describe('basis correction constants', () => {
  it('maps the model\'s native +Z (nose) onto sim +X forward', () => {
    const v = new Vector3(0, 0, 1).applyAxisAngle(new Vector3(0, 1, 0), WILDCAT_TO_SIM_ROTATION_Y)
    expect(v.distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-6)
  })

  it('scales the model\'s native 15.658 m wingspan down to the content wingSpanM (13.06 m)', () => {
    expect(WILDCAT_SCALE * 15.658001068688918).toBeCloseTo(13.06, 3)
  })
})

/** A cache whose "parse" is a synthetic scene holding the three nodes wildcat.ts requires,
 *  or, for an ordnance URL, one store mesh (O1). */
function syntheticCache(opts: { failOrdnance?: boolean } = {}) {
  return createModelCache(async (url) => {
    const root = new Group()
    if (url.includes('/ordnance/')) {
      if (opts.failOrdnance) throw new Error(`404 ${url}`)
      const m = new Mesh(new BoxGeometry(1, 0.2, 0.2), new MeshStandardMaterial())
      m.name = url
      root.add(m)
      return root
    }
    for (const name of ['Helice', 'GRP_Rueda_Der', 'GRP_Rueda_Izq']) {
      const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
      m.name = name
      root.add(m)
    }
    root.getObjectByName('Helice')!.rotation.z = 0.25
    return root
  })
}

describe('loadWildcat through the model cache (Z1)', () => {
  const still = { roll: 0, pitch: 0, yaw: 0 }

  it('its correction group is exactly wildcatToSimMatrix(), the transform models:mounts slices the wing through (O1)', async () => {
    const cache = syntheticCache()
    const a = await loadWildcat(f6fMounts, (url) => cache.acquire(url))
    const correction = a.root.getObjectByName(WILDCAT_CORRECTION_NAME)!
    expect(correction, 'the correction group').toBeDefined()
    // The correction group hangs straight off root and carries the drawn model.
    expect(correction.parent).toBe(a.root)
    expect(correction.getObjectByName('Helice')).toBeDefined()
    a.root.updateMatrixWorld(true)
    // Relative to root (the sim body frame), not merely the group's own local matrix.
    const toSim = a.root.matrixWorld.clone().invert().multiply(correction.matrixWorld)
    const expected = wildcatToSimMatrix()
    toSim.elements.forEach((v, i) => expect(v, `element ${i}`).toBeCloseTo(expected[i]!, 12))
  })

  it('declares prop, gear and stores, and no flaps', async () => {
    const cache = syntheticCache()
    const a = await loadWildcat(f6fMounts, (url) => cache.acquire(url))
    expect(a.parts).toEqual(['prop', 'gear', 'stores'])
  })

  it('update turns the prop from its authored angle and poses both gear legs', async () => {
    const cache = syntheticCache()
    const a = await loadWildcat(f6fMounts, (url) => cache.acquire(url))
    a.update({ gearFraction: 0, flapFraction: 0, throttle: 1, controls: still, frameS: 0.01, cameraDistanceM: 50 })
    expect(a.root.getObjectByName('Helice')!.rotation.z).toBeCloseTo(0.25 + 0.4, 12)
    expect(a.root.getObjectByName('GRP_Rueda_Der')!.position.distanceTo(GEAR_UP.der.pos)).toBeLessThan(1e-6)
    expect(a.root.getObjectByName('GRP_Rueda_Izq')!.position.distanceTo(GEAR_UP.izq.pos)).toBeLessThan(1e-6)
  })

  it('two Wildcats share one parse; disposing one releases only its own instance, once', async () => {
    const cache = syntheticCache()
    const a = await loadWildcat(f6fMounts, (url) => cache.acquire(url))
    const b = await loadWildcat(f6fMounts, (url) => cache.acquire(url))
    expect(cache.refCount(WILDCAT_MODEL_URL)).toBe(2)
    a.dispose()
    a.dispose()
    expect(cache.refCount(WILDCAT_MODEL_URL)).toBe(1)
    b.dispose()
    expect(cache.refCount(WILDCAT_MODEL_URL)).toBe(0)
  })
})

describe('loadWildcat stores (O1)', () => {
  it('hangs the ordnance models at the spec\'s mounts, pitched to the drawn datum, and releases them on dispose', async () => {
    const cache = syntheticCache()
    const a = await loadWildcat(f6fMounts, (url) => cache.acquire(url))
    expect(a.parts).toContain('stores')
    const rack = a.root.getObjectByName(f6fMounts.racks[0]!.id) as Mesh
    expect(rack.position.toArray()).toEqual([...f6fMounts.racks[0]!.offset])
    expect(rack.rotation.z).toBe(WILDCAT_DATUM_PITCH_RAD)
    expect(cache.refCount(ordnanceModelUrl('an-m65'))).toBe(1)
    a.dispose()
    expect(cache.refCount(ordnanceModelUrl('an-m65'))).toBe(0)
    expect(cache.refCount(ordnanceModelUrl('hvar'))).toBe(0)
  })

  it('a spec with no stores (the Zero) draws none and does not list the part', async () => {
    const cache = syntheticCache()
    const a = await loadWildcat(undefined, (url) => cache.acquire(url))
    expect(a.parts).not.toContain('stores')
    expect(a.root.getObjectByName('left-rack')).toBeUndefined()
    expect(() => a.setStores(0, 0)).not.toThrow()
    a.dispose()
  })

  it('a store model that fails to load falls back to primitive stores; the airframe still loads', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const cache = syntheticCache({ failOrdnance: true })
      const a = await loadWildcat(f6fMounts, (url) => cache.acquire(url))
      expect(warn).toHaveBeenCalledOnce()
      expect(String(warn.mock.calls[0]![0])).toMatch(/store models failed \(404 .*\/ordnance\/.*\); hanging primitive stand-ins/)
      // Nothing of the failed load is still held.
      expect(cache.refCount(ordnanceModelUrl('an-m65'))).toBe(0)
      expect(cache.refCount(ordnanceModelUrl('hvar'))).toBe(0)
      const rack = a.root.getObjectByName(f6fMounts.racks[0]!.id) as Mesh
      expect(rack.geometry.type).toBe('BoxGeometry')
      expect(rack.rotation.z).toBe(0)
      a.dispose()
      expect(cache.refCount(WILDCAT_MODEL_URL)).toBe(0)
    } finally {
      warn.mockRestore()
    }
  })
})
