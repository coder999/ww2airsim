// tests/tools/models/buildingGeometry.test.ts
import { describe, expect, it } from 'vitest'
import { coplanarOverlaps, scriptConstant, type Tri } from './buildingGeometry.js'

describe('scriptConstant (R4)', () => {
  const src = 'FOOTPRINT_X_M = 10.0\nBASE_Y_M = -0.3  # pad\n    HEIGHT_M = 4.0\nDEPTH_M = 2 * 5\n'
  it('reads a top-level literal, with or without a trailing comment', () => {
    expect(scriptConstant(src, 'FOOTPRINT_X_M')).toBe(10)
    expect(scriptConstant(src, 'BASE_Y_M')).toBe(-0.3)
  })
  it('refuses an indented line, an expression, and a missing name, naming it', () => {
    expect(() => scriptConstant(src, 'HEIGHT_M')).toThrow(/HEIGHT_M/)
    expect(() => scriptConstant(src, 'DEPTH_M')).toThrow(/DEPTH_M/)
    expect(() => scriptConstant(src, 'NOPE_M')).toThrow(/NOPE_M/)
  })
})

describe('coplanarOverlaps (R4, R2 deck lesson)', () => {
  const wall: Tri = [[0, 0, 0], [4, 0, 0], [0, 4, 0]]           // faces +z
  const door: Tri = [[0.5, 0.5, 0], [1.5, 0.5, 0], [0.5, 1.5, 0]] // faces +z, inside the wall
  const at = (t: Tri, dx: number, dz: number): Tri => t.map(([x, y, z]) => [x + dx, y, z + dz]) as Tri
  const flip = (t: Tri): Tri => [t[0], t[2], t[1]]
  const run = (a: Tri, b: Tri, la = 'concrete', lb = 'dark') => coplanarOverlaps([{ label: la, where: 'wall', tri: a }, { label: lb, where: 'door', tri: b }])

  it('flags a differently painted face lying on another, facing the same way', () => {
    expect(run(wall, door)).toEqual(['wall (concrete) / door (dark) at 0.83, 0.83, 0.00'])
  })
  it('passes the same paint, a face resting against another (opposite facing), a 1 cm offset and a disjoint face', () => {
    expect(run(wall, door, 'concrete', 'concrete')).toEqual([])
    expect(run(wall, flip(door))).toEqual([])
    expect(run(wall, at(door, 0, 0.01))).toEqual([])
    expect(run(wall, at(door, 10, 0))).toEqual([])
  })
})
