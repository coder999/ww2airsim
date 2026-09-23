import { describe, it, expect } from 'vitest'
import { createHellcat } from '../../src/render/scene/hellcat.js'

/**
 * The Hellcat's carried stores (Plan 6b Task 8): two bomb-shaped meshes at
 * `content/aircraft/f6f-hellcat.json`'s `stores.racks` offsets, six
 * rocket-shaped meshes at its `stores.rails` offsets, named after their
 * content ids so a test can address one directly.
 *
 * `setStores(bombsLeft, rocketsLeft)` hides them in Task 6's exact release
 * order (`src/sim/weapons/combat.ts`'s `releaseBomb`/`releaseRockets`): racks
 * empty left-first (array order), rails empty outermost-pair-first on each
 * side. This suite pins that order rather than just "some N are hidden",
 * because the whole point of the meshes is that the store missing on screen
 * is the one the sim actually released.
 */
describe('createHellcat stores (Plan 6b Task 8)', () => {
  it('adds 8 named store meshes -- 2 racks, 6 rails -- all visible at full load', () => {
    const { root, setStores } = createHellcat()
    const ids = ['left-rack', 'right-rack', 'left-rail-1', 'left-rail-2', 'left-rail-3', 'right-rail-1', 'right-rail-2', 'right-rail-3']
    for (const id of ids) expect(root.getObjectByName(id)).toBeDefined()
    setStores(2, 6)
    for (const id of ids) expect(root.getObjectByName(id)!.visible).toBe(true)
  })

  it('bombs empty left-rack first, then right-rack (array order, spec §3.2)', () => {
    const { root, setStores } = createHellcat()
    setStores(1, 6)
    expect(root.getObjectByName('left-rack')!.visible).toBe(false)
    expect(root.getObjectByName('right-rack')!.visible).toBe(true)
    setStores(0, 6)
    expect(root.getObjectByName('left-rack')!.visible).toBe(false)
    expect(root.getObjectByName('right-rack')!.visible).toBe(false)
  })

  it('rockets empty the outermost pair first, then the middle, then the innermost', () => {
    const { root, setStores } = createHellcat()
    setStores(2, 4) // one pair fired: the outermost, rail-3 on each side
    expect(root.getObjectByName('left-rail-3')!.visible).toBe(false)
    expect(root.getObjectByName('right-rail-3')!.visible).toBe(false)
    expect(root.getObjectByName('left-rail-1')!.visible).toBe(true)
    expect(root.getObjectByName('left-rail-2')!.visible).toBe(true)
    expect(root.getObjectByName('right-rail-1')!.visible).toBe(true)
    expect(root.getObjectByName('right-rail-2')!.visible).toBe(true)

    setStores(2, 2) // two pairs fired: outermost and middle
    expect(root.getObjectByName('left-rail-2')!.visible).toBe(false)
    expect(root.getObjectByName('right-rail-2')!.visible).toBe(false)
    expect(root.getObjectByName('left-rail-1')!.visible).toBe(true)
    expect(root.getObjectByName('right-rail-1')!.visible).toBe(true)

    setStores(2, 0) // all fired
    for (const id of ['left-rail-1', 'left-rail-2', 'left-rail-3', 'right-rail-1', 'right-rail-2', 'right-rail-3']) {
      expect(root.getObjectByName(id)!.visible).toBe(false)
    }
  })
})
