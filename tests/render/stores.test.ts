import { describe, expect, it } from 'vitest'
import { Group, MeshStandardMaterial } from 'three'
import { attachStores, RACK_OFFSETS, RAIL_OFFSETS } from '../../src/render/scene/stores.js'

describe('attachStores', () => {
  it('adds one mesh per rack and rail to root', () => {
    const root = new Group()
    attachStores(root, new MeshStandardMaterial())
    expect(root.children).toHaveLength(RACK_OFFSETS.length + RAIL_OFFSETS.length)
  })

  it('setStores hides dropped bombs left-rack-first', () => {
    const root = new Group()
    const { setStores } = attachStores(root, new MeshStandardMaterial())
    setStores(1, RAIL_OFFSETS.length)
    const bomb0 = root.getObjectByName(RACK_OFFSETS[0]!.id)!
    const bomb1 = root.getObjectByName(RACK_OFFSETS[1]!.id)!
    expect(bomb0.visible).toBe(false)
    expect(bomb1.visible).toBe(true)
  })

  it('setStores hides fired rockets outermost-pair-first', () => {
    const root = new Group()
    const { setStores } = attachStores(root, new MeshStandardMaterial())
    setStores(RACK_OFFSETS.length, RAIL_OFFSETS.length - 2)
    // left-rail-3 (z=-5.0) has the largest |z| on the left side -- outermost,
    // fires first, matching RAIL_DROP_ORDER's descending-|z| sort. left-rail-1
    // (z=-3.6) is innermost, nearest the fuselage, fires last.
    const outerLeft = root.getObjectByName('left-rail-3')!
    const innerLeft = root.getObjectByName('left-rail-1')!
    expect(outerLeft.visible).toBe(false)
    expect(innerLeft.visible).toBe(true)
  })
})
