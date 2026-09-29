import { describe, expect, it } from 'vitest'
import { TARGET_TYPES, zeroKillsByType, type TargetType } from '../../../src/sim/weapons/targetType.js'

describe('TargetType', () => {
  it("has master spec §8's eight rows plus destroyer and transport (Mark, 2026-09-28)", () => {
    const expected: readonly TargetType[] = [
      'fighter', 'bomber', 'cruiser', 'battleship', 'destroyer', 'transport', 'aaa', 'runway', 'building', 'carrier',
    ]
    expect([...TARGET_TYPES].sort()).toEqual([...expected].sort())
  })

  it('zeroKillsByType starts every type at zero', () => {
    const zero = zeroKillsByType()
    for (const t of TARGET_TYPES) expect(zero[t]).toBe(0)
  })
})
