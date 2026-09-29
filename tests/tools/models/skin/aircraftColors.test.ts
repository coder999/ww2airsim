// tests/tools/models/skin/aircraftColors.test.ts
import { describe, expect, it } from 'vitest'
import { MARKING_COLORS } from '../../../../tools/models/skin/colors.js'

describe('USAAF marking colors', () => {
  it.each(['usaaInsigniaBlue', 'usaaInsigniaWhite', 'usaaInsigniaRed', 'propTipYellow'] as const)('%s is a valid sRGB triple', (k) => {
    const c = MARKING_COLORS[k]
    expect(c).toHaveLength(3)
    for (const v of c) {
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(255)
    }
  })
})
