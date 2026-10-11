import { describe, expect, it } from 'vitest'
import { TARGET_TYPES, zeroKillsByType, type TargetType } from '../../../src/sim/weapons/targetType.js'

describe('TargetType', () => {
  it('has every scored target row, including tanks', () => {
    const expected: readonly TargetType[] = [
      'fighter', 'bomber', 'cruiser', 'battleship', 'destroyer', 'transport', 'aaa', 'runway', 'building', 'tank', 'carrier',
    ]
    expect([...TARGET_TYPES].sort()).toEqual([...expected].sort())
  })

  it('zeroKillsByType starts every type at zero', () => {
    const zero = zeroKillsByType()
    for (const t of TARGET_TYPES) expect(zero[t]).toBe(0)
  })
})
