// tests/render/pivotedAirframe.test.ts
import { describe, expect, it } from 'vitest'
import { Group, Object3D, Quaternion, Vector3 } from 'three'
import type { ModelInstance } from '../../src/render/models/modelCache.js'
import { gearAngleRad, loadPivotedAirframe, pivotAxisOf, rigParts, turnedAbout } from '../../src/render/scene/pivotedAirframe.js'
import { AIRFRAME_RIGS, PART_NAME, type AirframeRig } from '../../src/render/scene/airframeRigs.js'
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
const zero = { flapFraction: 0, controls: { roll: 0, pitch: 0, yaw: 0 }, cameraDistanceM: 0 }

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
    const { inst } = fake({ Prop: [1, 0, 0], GearL: [1, 0, 0], GearR: [1, 0, 0] })
    const rest = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.1)
    inst.node('GearR').quaternion.copy(rest)
    const a = await loadPivotedAirframe('toy', 'toy.glb', RIG, undefined, async () => inst)
    expect(a.parts).toEqual(['prop', 'gear'])
    a.update({ ...zero, gearFraction: 1, throttle: 0, frameS: 0 })
    expect(inst.node('GearR').quaternion.angleTo(rest)).toBeLessThan(1e-9)
    a.update({ ...zero, gearFraction: 0, throttle: 1, frameS: 0.05 })
    const want = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2).multiply(rest)
    expect(inst.node('GearR').quaternion.angleTo(want)).toBeLessThan(1e-9)
    const spun = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), propAngle(0, 1, 0.05))
    expect(inst.node('Prop').quaternion.angleTo(spun)).toBeLessThan(1e-9)
    a.update({ ...zero, gearFraction: 0, throttle: 0, frameS: 1 })
    expect(inst.node('Prop').quaternion.angleTo(spun)).toBeLessThan(1e-9) // throttle 0: the prop stops
  })

  it('a part with no baked pivot axis throws, naming the model and node, and releases the instance (Review Focus 1)', async () => {
    const { inst, released } = fake({ Prop: undefined, GearL: [1, 0, 0], GearR: [1, 0, 0] })
    await expect(loadPivotedAirframe('toy', 'toy.glb', RIG, undefined, async () => inst)).rejects.toThrow(/toy: node "Prop" has no pivotAxis/)
    expect(released()).toBe(1)
  })

  it('refuses stores before it fetches anything (Review Focus 2)', async () => {
    let fetched = 0
    const stores = { racks: [], rails: [] }
    await expect(loadPivotedAirframe('f6f-hellcat', 'x.glb', RIG, stores, async () => { fetched++; return fake({}).inst }))
      .rejects.toThrow(/f6f-hellcat: a rigged model hangs no stores/)
    expect(fetched).toBe(0)
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

  it('turnedAbout turns in the parent frame (premultiplies the rest pose)', () => {
    const rest = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.3)
    const q = turnedAbout(rest, new Vector3(1, 0, 0), 0.5)
    // 1e-6, not tighter: angleTo is 2 acos(|dot|), which cannot resolve below ~1e-8 (the same
    // product computed twice reads 4.2e-8). The wrong order (post-multiply) reads 0.148 rad.
    expect(q.angleTo(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.5).multiply(rest))).toBeLessThan(1e-6)
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
