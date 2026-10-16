import { describe, expect, it } from 'vitest'
import { pickerRows, type PickerOption } from '../../../src/render/hq/model.js'
import { pilotSights } from '../../../src/render/hq/launchRules.js'
import { SCENARIO_OPTIONS } from '../../../src/render/titleScreen.js'
import { sightsAllowed } from '../../../src/sim/sortie.js'
import { makeCampaign } from '../../fixtures/campaign.js'
import { shippedCatalog } from '../../fixtures/catalog.js'

/**
 * F6B: the rank gate through the REAL headquarters picker rows (Mark 2026-10-15). `pilotSights` is what `bootHq` puts on
 * the launch (`CampaignSortie.sights`, `SortieChoice.sights`, `facts.sights`); `sightsAllowed` is what the flight applies,
 * keyed by the row's own pool. Dev and every Training Ground row (the Basic Flying tutorial included) are always open; a
 * scored or single mission follows the assigned pilot's tier. Weapons release is never gated.
 */
const options = SCENARIO_OPTIONS as readonly PickerOption[]
const poolOf = (id: string) => SCENARIO_OPTIONS.find((o) => o.value === id)!.pool

describe('the rank gate through the headquarters picker', () => {
  const c = makeCampaign({ faction: 'us', tiers: [1, 2, 3, 4, 5] })
  const pilots = c.roster.live
  it('pilotSights: tiers 1 to 3 closed, 4 and 5 open', () => {
    expect(pilots.map((p) => pilotSights(c, p))).toEqual([false, false, false, true, true])
    expect(pilotSights(c, 'nobody')).toBe(false)
  })
  const rows = pickerRows(c, shippedCatalog(), options, true)
  it('the picker has all the sections the gate must cover (not vacuous)', () => {
    expect(new Set(rows.map((r) => r.section))).toEqual(new Set(['noncampaign', 'training', 'single']))
    expect(rows.find((r) => r.id === 'tutorial')?.section).toBe('training')
  })
  it('every row, every pilot: Dev open; a Training Ground row open; a scored or single mission by that pilot\'s tier', () => {
    for (const r of rows) for (const p of pilots) {
      const sights = pilotSights(c, p)
      expect(sightsAllowed({ dev: true, pool: poolOf(r.id), sights }), `${r.id} dev`).toBe(true)
      const expected = r.section === 'training' ? true : sights
      expect(sightsAllowed({ dev: false, pool: poolOf(r.id), sights }), `${r.id} ${p}`).toBe(expected)
    }
  })
  it('a rookie (tier 1) loses the marker on every scored and single mission and keeps it on every Training Ground row', () => {
    const rookie = pilots[0]!
    const closed = rows.filter((r) => !sightsAllowed({ dev: false, pool: poolOf(r.id), sights: pilotSights(c, rookie) }))
    expect(closed.length).toBeGreaterThan(3)
    expect(closed.every((r) => r.section !== 'training')).toBe(true)
    const lcdr = pilots[3]!
    expect(rows.every((r) => sightsAllowed({ dev: false, pool: poolOf(r.id), sights: pilotSights(c, lcdr) }))).toBe(true)
  })
})
