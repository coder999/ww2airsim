import { describe, expect, it } from 'vitest'
import { BAILOUT_TUNING } from '../../src/sim/bailoutTuning.js'
import { exitRuleText, jumpPrompt, refusalText } from '../../src/render/bailoutText.js'

describe('bailout text is built from the tuning, in imperial (F7A Task 2)', () => {
  it('states the accepted defaults in feet and feet per second, and says they are estimates', () => {
    const text = exitRuleText()
    expect(text).toContain('49 ft')
    expect(text).toContain('246 ft')
    expect(text).toContain('18 ft/s')
    expect(text).toContain('estimates')
    expect(text).not.toMatch(/\bm\/s\b|\bkm\b|\d m\b/)
  })

  it('changes when a tunable changes, and never carries the old number', () => {
    const doubled = { ...BAILOUT_TUNING, minExitAglM: 30, safeOpenAglM: 150, sinkMps: 11 }
    expect(exitRuleText(doubled)).toContain('98 ft')
    expect(exitRuleText(doubled)).toContain('492 ft')
    expect(exitRuleText(doubled)).toContain('36 ft/s')
    expect(exitRuleText(doubled)).not.toContain('49 ft')
    expect(refusalText('too-low', doubled)).toContain('98 FT')
    expect(jumpPrompt(100, doubled)).toContain('492 FT')
  })

  it('refuses with a message that names the height, for the too-low press', () => {
    expect(refusalText('too-low')).toBe('TOO LOW TO BAIL OUT · ABOUT 49 FT NEEDED')
  })

  it('warns below the safe-descent height but still lets the press through (the jump itself is allowed)', () => {
    expect(jumpPrompt(60)).toContain('BELOW 246 FT')
    expect(jumpPrompt(300)).toBe('J BAIL OUT')
  })
})
