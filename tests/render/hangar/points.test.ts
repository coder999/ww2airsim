// tests/render/hangar/points.test.ts
import { describe, expect, it } from 'vitest'
import { missionScore, pointsForTargetType, targetLabel } from '../../../src/render/debrief.js'
import { TARGET_TYPES, zeroKillsByType } from '../../../src/sim/weapons/targetType.js'

describe('the hangar and the debrief agree on points (Hangar spec §5)', () => {
  it.each(TARGET_TYPES)('%s: one kill in a landed debrief scores pointsForTargetType', (t) => {
    const kills = { ...zeroKillsByType(), [t]: 1 }
    const rows = missionScore(kills, 'landed').rows
    const row = rows.find((r) => r.destroyed === 1)
    expect(row?.score).toBe(pointsForTargetType(t))
    expect(row?.target).toBe(targetLabel(t))
  })
})
