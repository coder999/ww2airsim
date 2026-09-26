// tests/render/wildcat.test.ts
import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, Object3D, Vector3 } from 'three'
import { applyGearFraction, GEAR_DOWN, GEAR_UP, loadWildcat, WILDCAT_TO_SIM_ROTATION_Y, WILDCAT_SCALE } from '../../src/render/scene/wildcat.js'
import { createModelCache } from '../../src/render/models/modelCache.js'
import { WILDCAT_MODEL_URL } from '../../src/render/content.js'

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

describe('loadWildcat through the model cache (Z1)', () => {
  /** A cache whose "parse" is a synthetic scene holding the three nodes wildcat.ts requires. */
  function syntheticCache() {
    return createModelCache(async () => {
      const root = new Group()
      for (const name of ['Helice', 'GRP_Rueda_Der', 'GRP_Rueda_Izq']) {
        const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
        m.name = name
        root.add(m)
      }
      root.getObjectByName('Helice')!.rotation.z = 0.25
      return root
    })
  }
  const still = { roll: 0, pitch: 0, yaw: 0 }

  it('declares prop, gear and stores, and no flaps', async () => {
    const cache = syntheticCache()
    const a = await loadWildcat((url) => cache.acquire(url))
    expect(a.parts).toEqual(['prop', 'gear', 'stores'])
  })

  it('update turns the prop from its authored angle and poses both gear legs', async () => {
    const cache = syntheticCache()
    const a = await loadWildcat((url) => cache.acquire(url))
    a.update({ gearFraction: 0, flapFraction: 0, throttle: 1, controls: still, frameS: 0.01, cameraDistanceM: 50 })
    expect(a.root.getObjectByName('Helice')!.rotation.z).toBeCloseTo(0.25 + 0.4, 12)
    expect(a.root.getObjectByName('GRP_Rueda_Der')!.position.distanceTo(GEAR_UP.der.pos)).toBeLessThan(1e-6)
    expect(a.root.getObjectByName('GRP_Rueda_Izq')!.position.distanceTo(GEAR_UP.izq.pos)).toBeLessThan(1e-6)
  })

  it('two Wildcats share one parse; disposing one releases only its own instance, once', async () => {
    const cache = syntheticCache()
    const a = await loadWildcat((url) => cache.acquire(url))
    const b = await loadWildcat((url) => cache.acquire(url))
    expect(cache.refCount(WILDCAT_MODEL_URL)).toBe(2)
    a.dispose()
    a.dispose()
    expect(cache.refCount(WILDCAT_MODEL_URL)).toBe(1)
    b.dispose()
    expect(cache.refCount(WILDCAT_MODEL_URL)).toBe(0)
  })
})
