import { describe, expect, it } from 'vitest'
import { GREEN_SKILL, VETERAN_SKILL } from '../../../src/sim/ai/pilot.js'

describe('pilot skill presets', () => {
  it('veteran reacts faster and holds the attack longer than green', () => {
    expect(VETERAN_SKILL.reactionS).toBeLessThan(GREEN_SKILL.reactionS)
    expect(VETERAN_SKILL.energyDiscipline).toBeGreaterThan(GREEN_SKILL.energyDiscipline)
  })

  it('green reproduces today\'s exact gun cone (gunneryAccuracy 1.0)', () => {
    expect(GREEN_SKILL.gunneryAccuracy).toBe(1.0)
  })

  it('both presets are plain, structured-clone-safe data', () => {
    expect(structuredClone(VETERAN_SKILL)).toEqual(VETERAN_SKILL)
    expect(structuredClone(GREEN_SKILL)).toEqual(GREEN_SKILL)
  })
})
