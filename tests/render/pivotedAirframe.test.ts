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
