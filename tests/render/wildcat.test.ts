// tests/render/wildcat.test.ts
import { describe, expect, it, vi } from 'vitest'
import { Box3, Matrix4, Mesh, Object3D, Vector3 } from 'three'
import { applyGearFraction, GEAR_DOWN, GEAR_UP, loadWildcat, wildcatGearStretch, wildcatHinge, WILDCAT_SURFACES, WILDCAT_TO_SIM_ROTATION_Y, WILDCAT_SCALE, wildcatToSimMatrix } from '../../src/render/scene/wildcat.js'
import { WILDCAT_CORRECTION_NAME } from '../../src/render/scene/wildcatFrame.js'
import { syntheticCache, wildcatGlbScene } from './_wildcatCache.js'
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

  it('scales the model\'s native 15.658 m wingspan to f4f-wildcat.json\'s real span (W1: 11.582 m)', () => {
    expect(WILDCAT_SCALE * 15.658001068688918).toBeCloseTo(loadAircraftSpec('f4f-wildcat').geometry.wingSpanM, 6)
  })
})

describe('wildcatGearStretch (W1 R5)', () => {
  it('names the gear group it finds no strut under, rather than drawing an unstretched leg', () => {
    const der = new Object3D(); der.name = 'GRP_Rueda_Der'
    const izq = new Object3D(); izq.name = 'GRP_Rueda_Izq'
    expect(() => wildcatGearStretch(der, izq)).toThrow(/no strut under GRP_Rueda_Der/)
  })
})

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

  it('declares prop, gear, flaps, control surfaces and stores (C1 batch 2)', async () => {
    const cache = syntheticCache()
    const a = await loadWildcat(f6fMounts, (url) => cache.acquire(url))
    expect(a.parts).toEqual(['prop', 'gear', 'flaps', 'surfaces', 'stores'])
  })

  it('update turns the prop from its authored angle and poses both gear legs', async () => {
    const cache = syntheticCache()
    const a = await loadWildcat(f6fMounts, (url) => cache.acquire(url))
    const rest = (await wildcatGlbScene()).getObjectByName('Helice')!.rotation.z
    a.update({ gearFraction: 0, flapFraction: 0, throttle: 1, controls: still, frameS: 0.01, cameraDistanceM: 50 })
    expect(a.root.getObjectByName('Helice')!.rotation.z).toBeCloseTo(rest + 0.4, 12)
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
  it('hangs the ordnance models at the spec\'s mounts, level with the leveled datum, and releases them on dispose', async () => {
    const cache = syntheticCache()
    const a = await loadWildcat(f6fMounts, (url) => cache.acquire(url))
    expect(a.parts).toContain('stores')
    const rack = a.root.getObjectByName(f6fMounts.racks[0]!.id) as Mesh
    expect(rack.position.toArray()).toEqual([...f6fMounts.racks[0]!.offset])
    expect(rack.rotation.z).toBe(0)
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

describe('the Wildcat control surfaces and split flaps (C1 batch 2)', () => {
  /** `o`'s vertices in the sim body frame (`root`), the frame aircraftRigs.test.ts checks the rigged models in. */
  const simPoints = (o: Object3D, root: Object3D): Vector3[] => {
    root.updateMatrixWorld(true)
    const toRoot = root.matrixWorld.clone().invert()
    const out: Vector3[] = []
    o.traverse((m) => {
      if (!(m instanceof Mesh)) return
      const mat = new Matrix4().multiplyMatrices(toRoot, m.matrixWorld)
      const a = m.geometry.getAttribute('position')
      for (let i = 0; i < a.count; i++) out.push(new Vector3().fromBufferAttribute(a, i).applyMatrix4(mat))
    })
    return out
  }
  const mean = (ps: Vector3[]): Vector3 => ps.reduce((s, p) => s.add(p), new Vector3()).divideScalar(ps.length)
  const still = { roll: 0, pitch: 0, yaw: 0 }

  it.each(Object.entries(WILDCAT_SURFACES))('%s (%s): hinged on its leading edge, and a +1 input moves its trailing edge the right way', async (source, name) => {
    const cache = syntheticCache()
    const a = await loadWildcat(undefined, (url) => cache.acquire(url))
    const node = a.root.getObjectByName(source)!
    // Leading edge: nothing stands more than 3% of the chord ahead of the hinge (+z, the model's nose). The
    // ailerons' leading edges bow forward between the ends the hinge is taken at: 2.35% of the chord,
    // measured 2026-10-08. A hinge at mid-chord would read about 50%.
    const h = wildcatHinge(node, name === 'Rudder')
    node.parent!.updateMatrixWorld(true)
    const own = new Box3().setFromObject(node)
    expect(own.isEmpty()).toBe(false)
    const local = simPoints(node, node.parent!)
    const chord = Math.max(...local.map((p) => p.z)) - Math.min(...local.map((p) => p.z))
    const ahead = Math.max(...local.map((p) => p.z - (h.point.z + h.axis.z * (h.axis.dot(p.clone().sub(h.point)))) ))
    expect(ahead / chord, `${source} ahead of its hinge, as a fraction of its chord`).toBeLessThan(0.03)
    // Direction, in the sim body frame (+y up, +z right): the trailing edge is the aft tenth.
    const rest = simPoints(node, a.root)
    const minX = Math.min(...rest.map((p) => p.x)), maxX = Math.max(...rest.map((p) => p.x))
    const te = (ps: Vector3[]) => mean(ps.filter((_, i) => rest[i]!.x < minX + 0.1 * (maxX - minX)))
    const before = te(rest)
    const input = name === 'Rudder' ? { ...still, yaw: 1 } : name.startsWith('Elevator') ? { ...still, pitch: 1 } : { ...still, roll: 1 }
    a.update({ gearFraction: 1, flapFraction: 0, throttle: 0, controls: input, frameS: 0, cameraDistanceM: 50 })
    const after = te(simPoints(node, a.root))
    const [axis, want] = name === 'Rudder' ? ['z', 1] : name === 'AileronL' ? ['y', -1] : ['y', 1]
    expect(Math.sign(after[axis as 'y' | 'z'] - before[axis as 'y' | 'z']), `${source} trailing edge along ${axis}`).toBe(want)
    a.dispose()
  })

  it.each(['AileronR', 'AileronL'])('%s, cut from the outer wing, is a closed solid: no hollow shows when it deflects (C1 batch 2)', async (name) => {
    const cache = syntheticCache()
    const a = await loadWildcat(undefined, (url) => cache.acquire(url))
    const node = a.root.getObjectByName(name)!
    const key = (p: Vector3): string => p.toArray().map((c) => Math.round(c * 1e4)).join(',')
    const edges = new Map<string, number>()
    node.traverse((m) => {
      if (!(m instanceof Mesh)) return
      const pos = m.geometry.getAttribute('position'), idx = m.geometry.getIndex()!
      for (let t = 0; t < idx.count; t += 3) for (let k = 0; k < 3; k++) {
        const ka = key(new Vector3().fromBufferAttribute(pos, idx.getX(t + k))), kb = key(new Vector3().fromBufferAttribute(pos, idx.getX(t + (k + 1) % 3)))
        if (ka === kb) continue
        const e = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
        edges.set(e, (edges.get(e) ?? 0) + 1)
      }
    })
    expect(edges.size).toBeGreaterThan(100)
    expect([...edges.values()].filter((c) => c === 1).length, `${name} open edges`).toBe(0)
    a.dispose()
  })

  it('the split flaps are hidden up, and hang below the wing with their trailing edges down when lowered; one mesh', async () => {
    const cache = syntheticCache()
    const a = await loadWildcat(undefined, (url) => cache.acquire(url))
    const flaps = a.root.getObjectByName('Flaps') as Mesh
    expect(flaps.visible).toBe(false)
    a.update({ gearFraction: 1, flapFraction: 1, throttle: 0, controls: still, frameS: 0, cameraDistanceM: 50 })
    expect(flaps.visible).toBe(true)
    const ps = simPoints(flaps, a.root)
    for (const plate of [ps.slice(0, 4), ps.slice(4, 8)]) {
      const front = Math.max(...plate.map((p) => p.x))
      const lead = mean(plate.filter((p) => p.x > front - 1e-3)), trail = mean(plate.filter((p) => p.x <= front - 1e-3))
      expect(trail.y, 'trailing edge below the hinge').toBeLessThan(lead.y - 0.2)
    }
    a.dispose()
  })

  it('the three hinge pins are one mesh, so the flaps cost no extra draw call over the 47 the model had', async () => {
    const cache = syntheticCache()
    const a = await loadWildcat(undefined, (url) => cache.acquire(url))
    a.update({ gearFraction: 1, flapFraction: 1, throttle: 0, controls: still, frameS: 0, cameraDistanceM: 50 })
    let draws = 0
    a.root.traverse((o) => { if (o instanceof Mesh && o.visible) draws++ })
    expect(draws).toBeLessThanOrEqual(47)
    a.dispose()
  })
})
