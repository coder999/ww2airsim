import { describe, expect, it } from 'vitest'
import { LIGHT_TIERS } from '../../src/render/lights/tiers.js'
import { limitGlows, selectLit } from '../../src/render/lights/select.js'
import { INTENSITY_CD, LIGHT_CAPS, LIGHT_RGB, type LightRuntime } from '../../src/sim/lights/lights.js'
import { v3 } from '../../src/sim/math/vec3.js'

const order = ['high', 'medium', 'low', 'off'] as const
const light = (i: number, kind: 'pot' | 'nav'): LightRuntime => ({
  id: `${kind}-${i}`, kind, positionM: v3(i * 20, 1, 0), intensityCd: INTENSITY_CD[kind], color: LIGHT_RGB.warm, radiusM: 200, blackoutExempt: false,
})

describe('night-light quality tiers (F6A Task 10)', () => {
  it('High is exactly the plan\'s caps, and every cap is non-increasing down the tiers to off, which is zero', () => {
    expect(LIGHT_TIERS.high).toEqual({ litSlots: LIGHT_CAPS.litSlots, glowSprites: LIGHT_CAPS.glowSprites, navSprites: LIGHT_CAPS.navSprites, beams: LIGHT_CAPS.searchlights })
    for (const key of ['litSlots', 'glowSprites', 'navSprites', 'beams'] as const) {
      for (let i = 1; i < order.length; i++) expect(LIGHT_TIERS[order[i]!][key], `${key}: ${order[i]} <= ${order[i - 1]}`).toBeLessThanOrEqual(LIGHT_TIERS[order[i - 1]!][key])
      expect(LIGHT_TIERS.off[key]).toBe(0)
      expect(LIGHT_TIERS.low[key], `${key}: low still draws something`).toBeGreaterThan(0)
    }
    // Strictly smaller somewhere between each pair, so a tier is not a duplicate of the one above it.
    for (let i = 1; i < 3; i++) expect(Object.values(LIGHT_TIERS[order[i]!]).some((v, k) => v < Object.values(LIGHT_TIERS[order[i - 1]!])[k]!)).toBe(true)
  })

  it('selection and the sprite budget honor each tier', () => {
    const pots = Array.from({ length: 60 }, (_, i) => light(i, 'pot'))
    const navs = Array.from({ length: 80 }, (_, i) => light(i, 'nav'))
    for (const name of order) {
      const t = LIGHT_TIERS[name]
      const lit = selectLit(pots, v3(0, 50, 0), new Set(), t.litSlots)
      expect(lit.length, `${name} lit slots`).toBe(Math.min(t.litSlots, pots.length))
      const g = limitGlows([...pots, ...navs], v3(0, 50, 0), t.glowSprites, t.navSprites)
      expect(g.filter((l) => l.kind === 'nav').length, `${name} nav sprites`).toBe(Math.min(t.navSprites, navs.length))
      expect(g.filter((l) => l.kind !== 'nav').length, `${name} glow sprites`).toBe(Math.min(t.glowSprites, pots.length))
    }
  })
})
