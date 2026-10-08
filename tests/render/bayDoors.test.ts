import { describe, expect, it } from 'vitest'
import { Box3, MeshStandardMaterial, type Object3D } from 'three'
import { buildBayDoors, BAY_DOOR_OPEN_DEG, DOOR_OFFSET_M } from '../../src/render/scene/bayDoors.js'

/** The procedural bay doors (C2): shut they lie just outside the belly; open they hang down outboard. */
const BAY = { x0: -1.5, x1: 1.5, halfWidthM: 0.6, keelY: -1.45, hingeY: -1.32 }

function doorBox(group: Object3D, name: string): Box3 {
  group.updateMatrixWorld(true)
  return new Box3().setFromObject(group.getObjectByName(name)!)
}

describe('bay doors, drawn in code (C2)', () => {
  it('shut, each door lies under the belly between keel and hinge; open, it swings down beside its hinge, not up into the fuselage', () => {
    const d = buildBayDoors([BAY], new MeshStandardMaterial())
    d.set(0)
    for (const [name, side] of [['BayDoor1L', -1], ['BayDoor1R', 1]] as const) {
      const shut = doorBox(d.group, name)
      // Outside the keel-to-hinge chord by DOOR_OFFSET_M, so its lowest point is below the keel.
      expect(shut.min.y).toBeLessThan(BAY.keelY - DOOR_OFFSET_M * 0.5)
      expect(shut.max.y).toBeLessThan(BAY.hingeY + 0.01)
      expect(side * (shut.min.z + shut.max.z) / 2).toBeGreaterThan(0)
      d.set(1)
      const open = doorBox(d.group, name)
      // Hanging about straight down from the hinge: as tall as the door is wide, all of it outboard-ish of the keel.
      expect(open.min.y).toBeLessThan(BAY.hingeY - 0.8 * BAY.halfWidthM * Math.sin((BAY_DOOR_OPEN_DEG * Math.PI) / 180))
      expect(open.max.y).toBeLessThan(BAY.hingeY + 0.05)
      expect(Math.abs(open.max.z - open.min.z)).toBeLessThan(0.25)
      d.set(0)
    }
    // A NaN fraction draws them shut rather than at a NaN angle.
    d.set(Number.NaN)
    expect(d.group.getObjectByName('BayDoor1R')!.rotation.x).toBe(-0)
    d.dispose()
  })
})
