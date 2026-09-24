import { describe, expect, it } from 'vitest'
import { Object3D, Vector3 } from 'three'
import { applyGearFraction, GEAR_DOWN, GEAR_UP, WILDCAT_TO_SIM_ROTATION_Y, WILDCAT_SCALE } from '../../src/render/scene/wildcat.js'

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
