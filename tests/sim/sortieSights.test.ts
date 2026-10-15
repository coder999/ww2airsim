import { describe, expect, it } from 'vitest'
import { abilities } from '../../src/campaign/ranks.js'
import { sightsAllowed, sightsOverrideFromQuery } from '../../src/sim/sortie.js'
import { SCENARIO_OPTIONS } from '../../src/render/titleScreen.js'

/**
 * F6B Task 8: the sight gate (Mark 2026-10-15). Dev and every Training Ground row (the Basic Flying tutorial is
 * `pool: 'training'`) always have the bombsight and torpedosight; the campaign and single missions follow the pilot's
 * rank. The gate hides an aid; it never blocks a release (the release code does not read it: it is not in src/sim/weapons).
 * AWAITS F5B: the tier reaches `SortieChoice.sights` through its `CampaignLaunch{pilotId, tier, facts}`; here the
 * tier is mapped by hand through the real `abilities(tier)`.
 */
describe('sightsAllowed', () => {
  it('by rank: tiers 1 to 3 closed, 4 to 6 open, on a campaign or single mission with Dev off', () => {
    for (const pool of ['noncampaign', 'single'] as const) {
      expect([1, 2, 3, 4, 5, 6].map((t) => sightsAllowed({ dev: false, pool, sights: abilities(t as 1).sights }))).toEqual([false, false, false, true, true, true])
    }
  })
  it('with no launch fact at all (nothing supplies one until F5B) a mission is closed', () => {
    expect(sightsAllowed({ dev: false, pool: 'noncampaign' })).toBe(false)
  })
  it('Dev always has them, whatever the rank', () => { expect(sightsAllowed({ dev: true, pool: 'noncampaign', sights: false })).toBe(true) })
  it('every Training Ground row has them with no rank, the tutorial included (enrolled over the picker, pinned)', () => {
    const training = SCENARIO_OPTIONS.filter((o) => o.pool === 'training')
    expect(training.length).toBeGreaterThan(10)
    expect(training.map((o) => o.value)).toContain('tutorial')
    for (const o of training) expect(sightsAllowed({ dev: false, pool: o.pool, sights: false }), o.value).toBe(true)
  })
  it('a campaign mission and a single mission never get them without the rank (the picker rows that are not training)', () => {
    const rest = SCENARIO_OPTIONS.filter((o) => o.pool !== 'training' && !o.dev)
    expect(rest.length).toBeGreaterThan(3)
    for (const o of rest) expect(sightsAllowed({ dev: false, pool: o.pool, sights: false }), o.value).toBe(false)
  })
  it('the DEV override forces the gate either way, and a typo throws', () => {
    expect(sightsAllowed({ dev: false, pool: 'noncampaign' }, 'on')).toBe(true)
    expect(sightsAllowed({ dev: true, pool: 'training', sights: true }, 'off')).toBe(false)
    expect(sightsOverrideFromQuery('?sights=off')).toBe('off')
    expect(sightsOverrideFromQuery('')).toBeUndefined()
    expect(() => sightsOverrideFromQuery('?sights=maybe')).toThrow(/not on or off/)
  })
})
