// tests/render/pivotedAirframe.test.ts
import { describe, expect, it } from 'vitest'
import { Group, Object3D, Quaternion, Vector3 } from 'three'
import type { ModelInstance } from '../../src/render/models/modelCache.js'
import { DEBRIS_S, debrisFlight, gearAngleRad, loadPivotedAirframe, pivotAxisOf, rigParts, slewToward, SURFACE_SWEEP_S, surfaceAngleRad, turnedAbout, turretAim, TURRET_SLEW_DEG_S } from '../../src/render/scene/pivotedAirframe.js'
import { AIRFRAME_RIGS, PART_NAME, SURFACE_MAX_DEG, type AirframeRig, type TurretArc } from '../../src/render/scene/airframeRigs.js'
import { propAngle } from '../../src/render/scene/airframe.js'

const RIG: AirframeRig = {
  props: [{ node: 'Prop', blades: 3 }],
  gear: [
    { node: 'GearL', upAngleDeg: -90, retracts: 'inboard', source: 'test' },
    { node: 'GearR', upAngleDeg: 90, retracts: 'inboard', source: 'test' },
  ],
  turrets: [],
}

/** A synthetic instance: one Object3D per name, with the pivot axis the build would bake. */
function fake(axes: Record<string, number[] | undefined>): { inst: ModelInstance; released: () => number } {
  const root = new Group()
  for (const [name, axis] of Object.entries(axes)) {
    const o = new Object3D()
    o.name = name
    if (axis) o.userData.pivotAxis = axis
    root.add(o)
  }
  let n = 0
  return {
    inst: { root, node: (name) => { const o = root.getObjectByName(name); if (!o) throw new Error(`no node "${name}"`); return o }, release: () => { n++ } },
    released: () => n,
  }
}
const zero = { flapFraction: 0, bayDoorFraction: 0, controls: { roll: 0, pitch: 0, yaw: 0 }, cameraDistanceM: 0 }

/**
 * `q` and `want` are one rotation, component by component (q and -q are the same rotation).
 * Not `angleTo`: it is 2 acos(|dot|), which cannot resolve below about 3e-8, so a quaternion
 * compared with itself reads 0 or 3e-8 depending on the last bit of |q|^2 (measured 2026-09-27:
 * 216 of 1,000 rest angles read 3e-8), and a tight angleTo bound passes or fails by rounding.
 */
function expectRotation(q: Quaternion, want: Quaternion, label: string): void {
  const s = q.dot(want) < 0 ? -1 : 1
  const d = Math.max(Math.abs(q.x - s * want.x), Math.abs(q.y - s * want.y), Math.abs(q.z - s * want.z), Math.abs(q.w - s * want.w))
  expect(d, label).toBeLessThan(1e-12)
}

describe('the pivoted airframe (R3)', () => {
  it('gearAngleRad: down (1) is 0, up (0) is the rig angle, and it clamps', () => {
    const g = RIG.gear[1]!
    expect(gearAngleRad(g, 1)).toBe(0)
    expect(gearAngleRad(g, 0)).toBeCloseTo(Math.PI / 2, 12)
    expect(gearAngleRad(g, -3)).toBeCloseTo(Math.PI / 2, 12)
    expect(gearAngleRad(g, 7)).toBe(0)
  })

  it('rigParts: props and gear only, never stores', () => {
    expect(rigParts(RIG)).toEqual(['prop', 'gear'])
    expect(rigParts({ props: [{ node: 'Prop', blades: 3 }], gear: [], turrets: ['Turret1'] })).toEqual(['prop'])
    expect(rigParts({ props: [], gear: [], turrets: [] })).toEqual([])
  })

  it('turns each leg about its own baked axis, from its rest pose, and spins the prop by propAngle', async () => {
    // Three different baked axes, so a leg turned about the prop's axis, or about another leg's,
    // lands somewhere else and fails.
    const { inst } = fake({ Prop: [1, 0, 0], GearL: [0, 1, 0], GearR: [0, 0, 1] })
    const rest = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.2)
    inst.node('GearR').quaternion.copy(rest)
    const a = await loadPivotedAirframe('toy', 'toy.glb', RIG, undefined, async () => inst)
    expect(a.parts).toEqual(['prop', 'gear'])
    a.update({ ...zero, gearFraction: 1, throttle: 0, frameS: 0 })
    expectRotation(inst.node('GearR').quaternion, rest, 'GearR')
    a.update({ ...zero, gearFraction: 0, throttle: 1, frameS: 0.05 })
    const want = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2).multiply(rest)
    expectRotation(inst.node('GearR').quaternion, want, 'GearR')
    const wantL = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2)
    expectRotation(inst.node('GearL').quaternion, wantL, 'GearL')
    const spun = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), propAngle(0, 1, 0.05))
    expectRotation(inst.node('Prop').quaternion, spun, 'Prop')
    a.update({ ...zero, gearFraction: 0, throttle: 0, frameS: 1 })
    expectRotation(inst.node('Prop').quaternion, spun, 'Prop') // throttle 0: the prop stops
  })

  it('destroyed in the air, the prop flies off and tumbles, the legs stay; scrubbed back, it is whole (damage stages)', async () => {
    const { inst } = fake({ Prop: [1, 0, 0], GearL: [0, 1, 0], GearR: [0, 0, 1] })
    inst.node('Prop').position.set(4, 0, 0)
    const a = await loadPivotedAirframe('toy', 'toy.glb', RIG, undefined, async () => inst)
    a.update({ ...zero, gearFraction: 1, throttle: 0, frameS: 0, debris: { ageS: 0, seed: 7 } })
    expect(inst.node('Prop').position.distanceTo(new Vector3(4, 0, 0))).toBeLessThan(1e-9)
    a.update({ ...zero, gearFraction: 1, throttle: 0, frameS: 0, debris: { ageS: 3, seed: 7 } })
    const flown = debrisFlight(3, (7 + Math.imul(1, 0x9e3779b1)) >>> 0)
    expect(inst.node('Prop').position.distanceTo(new Vector3(4, 0, 0).add(flown.offset))).toBeLessThan(1e-9)
    expect(flown.offset.length()).toBeGreaterThan(5)
    expect(inst.node('GearL').position.length()).toBe(0)
    a.update({ ...zero, gearFraction: 1, throttle: 0, frameS: 0, debris: { ageS: DEBRIS_S + 1, seed: 7 } })
    expect(inst.node('Prop').visible).toBe(false)
    a.update({ ...zero, gearFraction: 1, throttle: 0, frameS: 0, debris: null })
    expect(inst.node('Prop').visible).toBe(true)
    expect(inst.node('Prop').position.distanceTo(new Vector3(4, 0, 0))).toBeLessThan(1e-9)
  })

  it('a part with no baked pivot axis throws, naming the model and node, and releases the instance (Review Focus 1)', async () => {
    const { inst, released } = fake({ Prop: undefined, GearL: [1, 0, 0], GearR: [1, 0, 0] })
    await expect(loadPivotedAirframe('toy', 'toy.glb', RIG, undefined, async () => inst)).rejects.toThrow(/toy: node "Prop" has no pivotAxis/)
    expect(released()).toBe(1)
  })

  it('hangs a spec\'s stores from its mounts on the level model, and hides spent ones (sortie forms A4)', async () => {
    const mounts = {
      racks: [{ id: 'left-rack', offset: [-0.306, -0.664, -2.6] as [number, number, number], store: 'an-m65' }],
      rails: [{ id: 'left-rail-1', offset: [-0.581, -0.471, -3.6] as [number, number, number], store: 'hvar' }],
    }
    const airframe = fake({ Prop: [1, 0, 0], GearL: [1, 0, 0], GearR: [1, 0, 0] })
    // No store glb in Node: the loader falls back to primitive stand-ins, as the Wildcat's does.
    const a = await loadPivotedAirframe('toy', 'toy.glb', RIG, mounts, async (url) => (url === 'toy.glb' ? airframe.inst : Promise.reject(new Error('no store model in Node'))))
    expect(a.parts).toContain('stores')
    const rack = a.root.getObjectByName('left-rack')!
    expect(rack.position.toArray()).toEqual([-0.306, -0.664, -2.6])
    expect(rack.rotation.z).toBe(0) // an R3 model is built level (R3 P13): no datum pitch
    a.setStores(0, 1)
    expect(rack.visible).toBe(false)
    expect(a.root.getObjectByName('left-rail-1')!.visible).toBe(true)
    a.dispose()
    expect(a.root.getObjectByName('left-rack')).toBeUndefined()
    expect(airframe.released()).toBe(1)
  })

  it('a spec with no stores hangs none and has no stores part', async () => {
    const a = await loadPivotedAirframe('toy', 'toy.glb', RIG, undefined, async () => fake({ Prop: [1, 0, 0], GearL: [1, 0, 0], GearR: [1, 0, 0] }).inst)
    expect(a.parts).not.toContain('stores')
  })

  it('pivotAxisOf rejects a non-unit axis; dispose releases once', async () => {
    const o = new Object3D()
    o.name = 'Prop'
    o.userData.pivotAxis = [2, 0, 0]
    expect(() => pivotAxisOf(o, 'toy')).toThrow(/not a unit vector/)
    const { inst, released } = fake({ Prop: [1, 0, 0], GearL: [1, 0, 0], GearR: [1, 0, 0] })
    const a = await loadPivotedAirframe('toy', 'toy.glb', RIG, undefined, async () => inst)
    a.dispose()
    a.dispose()
    expect(released()).toBe(1)
  })

  it('rigParts: flap surfaces add flaps, stick surfaces add surfaces (C1)', () => {
    expect(rigParts({ ...RIG, surfaces: ['AileronL', 'AileronR', 'Flap1L', 'Flap1R', 'ElevatorL', 'ElevatorR', 'Rudder'] })).toEqual(['prop', 'gear', 'flaps', 'surfaces'])
    expect(rigParts({ ...RIG, surfaces: ['Flap1L', 'Flap1R'] })).toEqual(['prop', 'gear', 'flaps'])
  })

  it('slewToward: a full sweep takes SURFACE_SWEEP_S at any frame step, never overshoots, and dt 0 snaps (C1)', () => {
    for (const dt of [1 / 144, 1 / 60, 1 / 30, 0.07]) {
      let v = -1, t = 0
      while (v < 1) { v = slewToward(v, 1, dt); t += dt; expect(v).toBeLessThanOrEqual(1) }
      expect(t, `dt ${dt}`).toBeGreaterThanOrEqual(SURFACE_SWEEP_S - 1e-9)
      expect(t, `dt ${dt}`).toBeLessThan(SURFACE_SWEEP_S + dt + 1e-9)
    }
    expect(slewToward(0.2, -0.4, 0)).toBe(-0.4)
    expect(slewToward(0.5, 0.5, 0.1)).toBe(0.5)
  })

  it('surfaceAngleRad: full input is full travel, clamped; a flap only goes down (C1)', () => {
    expect(surfaceAngleRad('AileronR', 1)).toBeCloseTo((SURFACE_MAX_DEG.roll * Math.PI) / 180, 12)
    expect(surfaceAngleRad('AileronL', 1)).toBeCloseTo((-SURFACE_MAX_DEG.roll * Math.PI) / 180, 12)
    expect(surfaceAngleRad('ElevatorL', -3)).toBeCloseTo((-SURFACE_MAX_DEG.pitch * Math.PI) / 180, 12)
    expect(surfaceAngleRad('Flap2R', 1)).toBeCloseTo((-SURFACE_MAX_DEG.flap * Math.PI) / 180, 12)
    expect(surfaceAngleRad('Flap2R', -1)).toBe(-0)
  })

  it('poses a surface from the stick through the slew, and a flap from flapFraction directly (C1)', async () => {
    const { inst } = fake({ Prop: [1, 0, 0], GearL: [0, 1, 0], GearR: [0, 0, 1], AileronR: [0, 0, -1], Flap1R: [0, 0, -1] })
    const a = await loadPivotedAirframe('toy', 'toy.glb', { ...RIG, surfaces: ['AileronR', 'Flap1R'] }, undefined, async () => inst)
    const at = (name: string): number => 2 * Math.atan2(new Vector3(inst.node(name).quaternion.x, inst.node(name).quaternion.y, inst.node(name).quaternion.z).dot(new Vector3(0, 0, -1)), inst.node(name).quaternion.w)
    a.update({ ...zero, gearFraction: 1, throttle: 0, frameS: 0.1, flapFraction: 1, controls: { roll: 1, pitch: 0, yaw: 0 } })
    // 0.1 s of a 0.3 s sweep from 0 covers 2/3 of the stick's way to 1.
    expect(at('AileronR')).toBeCloseTo(((2 / 3) * SURFACE_MAX_DEG.roll * Math.PI) / 180, 9)
    expect(at('Flap1R')).toBeCloseTo((-SURFACE_MAX_DEG.flap * Math.PI) / 180, 9)
  })

  it('turnedAbout turns in the parent frame (premultiplies the rest pose)', () => {
    const rest = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.3)
    const q = turnedAbout(rest, new Vector3(1, 0, 0), 0.5)
    // The wrong order (post-multiply) differs by about 0.07 in a component (0.148 rad).
    expectRotation(q, new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.5).multiply(rest), 'premultiplied')
  })
})

describe('AIRFRAME_RIGS (R3)', () => {
  it('names parts by the convention, numbers props and turrets 1..N, and gives sane blade counts and angles', () => {
    for (const [id, rig] of Object.entries(AIRFRAME_RIGS)) {
      for (const n of [...rig.props.map((p) => p.node), ...rig.gear.map((g) => g.node), ...rig.turrets]) expect(n, id).toMatch(PART_NAME)
      expect(rig.turrets, id).toEqual(rig.turrets.map((_, i) => `Turret${i + 1}`))
      const props = rig.props.map((p) => p.node)
      expect(props, id).toEqual(props.length === 1 ? ['Prop'] : props.map((_, i) => `Prop${i + 1}`))
      for (const p of rig.props) expect(Number.isInteger(p.blades) && p.blades >= 2 && p.blades <= 6, `${id} ${p.node}`).toBe(true)
      for (const g of rig.gear) expect(Math.abs(g.upAngleDeg) > 0 && Math.abs(g.upAngleDeg) <= 180, `${id} ${g.node}`).toBe(true)
    }
  })
})

describe('turret aim (2026-10-09)', () => {
  const deg = (r: number): number => (r * 180) / Math.PI
  const full: TurretArc = { traverseDeg: null, elevationDeg: [-90, 90], restElevationDeg: 0, source: 'test' }
  const aim = (d: readonly [number, number, number], a: readonly [number, number, number], e: readonly [number, number, number], arc = full): [number, number] => {
    const r = turretAim(d, a, e, arc)
    return [deg(r.traverseRad), deg(r.elevationRad)]
  }

  it('a dorsal turret facing forward: ahead is rest, starboard a quarter turn, 45 deg up is its elevation', () => {
    const a = [0, 1, 0] as const, e = [0, 0, 1] as const
    expect(aim([1, 0, 0], a, e).map((v) => v + 0)).toEqual([0, 0])
    expect(aim([0, 0, 1], a, e)[0]).toBeCloseTo(-90, 9) // -90 deg about +y takes +x to +z
    expect(aim([1, 1, 0], a, e)[1]).toBeCloseTo(45, 9)
  })

  it('a ventral turret (axis down) turns the other way for the same bearing, and depresses for a target below', () => {
    const a = [0, -1, 0] as const, e = [0, 0, 1] as const
    expect(aim([0, 0, 1], a, e)[0]).toBeCloseTo(90, 9)
    expect(aim([1, -1, 0], a, e)[1]).toBeCloseTo(-45, 9)
  })

  it('an aft-facing turret: heading is up x trunnion, so dead astern is rest', () => {
    expect(aim([-1, 0, 0], [0, 1, 0], [0, 0, -1])[0]).toBeCloseTo(0, 9)
  })

  it('clamps to the arc, and turns the guns from their modeled elevation', () => {
    const arc = { traverseDeg: 30, elevationDeg: [-10, 20] as const, restElevationDeg: 10, source: 'test' }
    const [tr, el] = aim([0, -1, 1], [0, 1, 0], [0, 0, 1], arc)
    expect(tr).toBeCloseTo(-30, 9)
    expect(el).toBeCloseTo(-20, 9) // clamped to -10 deg, which is 20 below the modeled +10
  })

  it('loads a turret with its guns hung under it, slews toward the aim and stows without one', async () => {
    const { inst } = fake({ Turret1: [0, 1, 0], Turret1Guns: [0, 0, 1] })
    const rig: AirframeRig = { props: [], gear: [], turrets: ['Turret1'], turretArcs: { Turret1: full } }
    const a = await loadPivotedAirframe('test', 'x', rig, undefined, async () => inst)
    const turret = inst.node('Turret1'), guns = inst.node('Turret1Guns')
    expect(guns.parent).toBe(turret)
    const u = { gearFraction: 1, flapFraction: 0, bayDoorFraction: 0, throttle: 0, controls: { roll: 0, pitch: 0, yaw: 0 }, cameraDistanceM: 0 }
    const angle = (o: Object3D, axis: Vector3): number => deg(2 * Math.atan2(new Vector3(o.quaternion.x, o.quaternion.y, o.quaternion.z).dot(axis), o.quaternion.w))
    a.update({ ...u, frameS: 0.5, aim: { x: 0, y: 0, z: 1 } })
    expect(angle(turret, new Vector3(0, 1, 0))).toBeCloseTo(-TURRET_SLEW_DEG_S * 0.5, 6)
    a.update({ ...u, frameS: 0, aim: { x: 1, y: 1, z: 0 } })
    expect(angle(turret, new Vector3(0, 1, 0))).toBeCloseTo(0, 6)
    expect(angle(guns, new Vector3(0, 0, 1))).toBeCloseTo(45, 6)
    a.update({ ...u, frameS: 0, aim: null })
    expect(angle(guns, new Vector3(0, 0, 1))).toBeCloseTo(0, 6)
  })
})
