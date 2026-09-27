import { describe, expect, it } from 'vitest'
import { SHIP_PALETTES, SHIP_ROLES } from '../../src/render/scene/shipPalette.js'

describe('ship palettes', () => {
  it('has the R2 IJN palette and every palette defines every role as an RGB color', () => {
    expect(Object.keys(SHIP_PALETTES)).toEqual(['usn-1944', 'ijn'])
    for (const [id, palette] of Object.entries(SHIP_PALETTES)) {
      expect(Object.keys(palette).sort(), id).toEqual([...SHIP_ROLES].sort())
      for (const [role, color] of Object.entries(palette)) {
        expect(Number.isInteger(color), `${id}.${role}`).toBe(true)
        expect(color, `${id}.${role}`).toBeGreaterThanOrEqual(0)
        expect(color, `${id}.${role}`).toBeLessThanOrEqual(0xffffff)
      }
    }
  })
})
