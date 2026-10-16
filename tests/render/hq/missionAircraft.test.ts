import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { launchSortie, describeAircraft, type Faction } from '../../../src/campaign/index.js'
import { aircraftGate } from '../../../src/render/hq/launchRules.js'
import { MISSION_AIRCRAFT, formAircraft, withMissionAircraft } from '../../../src/render/hq/missionAircraft.js'
import { parseLibraryEntry } from '../../../src/render/hangar/library.js'
import { flyableAircraft } from '../../../src/render/sortie/flyable.js'
import { SCENARIO_OPTIONS } from '../../../src/render/titleScreen.js'
import type { FlowContext } from '../../../src/render/sortieFlow.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { makeCampaign } from '../../fixtures/campaign.js'
import { shippedCatalog } from '../../fixtures/catalog.js'
import { NOW } from '../../campaign/helpers.js'

const library = readdirSync('content/library').map((f) => parseLibraryEntry(JSON.parse(readFileSync(`content/library/${f}`, 'utf8'))))
const specs = readdirSync('content/aircraft').filter((f) => f.endsWith('.json')).map((f) => loadAircraftSpec(f.slice(0, -5)))
const flyable = flyableAircraft(specs, library)
const ctx = (dev: boolean): FlowContext => ({ options: SCENARIO_OPTIONS, flyable, dev })
const catalog = shippedCatalog()

describe('per-mission aircraft lists (plan F5B, Mark 2026-10-15)', () => {
  it('every pooled mission has a list, led by its authored airplane, naming only airplanes that exist', () => {
    const pooled = SCENARIO_OPTIONS.filter((o) => o.pool === 'noncampaign' && !o.dev)
    expect(pooled.length).toBe(11) // pinned: an empty filter must not pass vacuously
    for (const o of pooled) {
      const list = MISSION_AIRCRAFT[o.value]
      expect(list, o.value).toBeDefined()
      expect(list![0], `${o.value} leads with its authored airplane`).toBe(o.aircraft)
      for (const id of list!) expect(specs.some((s) => s.id === id), `${o.value}: ${id} has a spec`).toBe(true)
    }
    expect(Object.keys(MISSION_AIRCRAFT).sort()).toEqual(pooled.map((o) => o.value).sort()) // no stale entries either
  })

  it('the catalog descriptor carries exactly the list, so the reducer and the form read one table', () => {
    for (const m of catalog) expect(m.aircraftIds, m.id).toEqual(MISSION_AIRCRAFT[m.id])
    expect(withMissionAircraft([{ ...catalog[0]!, id: 'not-listed', aircraftIds: ['x'] }])[0]!.aircraftIds).toEqual(['x'])
  })

  it('every aircraft Form 5 offers (Dev off) is accepted by launchSortie for an eligible pilot, and Form 5 never offers outside the list', () => {
    let checked = 0
    for (const m of catalog) {
      const faction: Faction = m.faction
      const c = makeCampaign({ faction, tiers: [6, 6, 6, 6, 6] }) // eligible for anything: rank is not what is under test
      const offered = formAircraft(ctx(false), m.id)
      expect(offered.length, `${m.id} offers something`).toBeGreaterThan(0)
      for (const f of offered) {
        expect(MISSION_AIRCRAFT[m.id], `${m.id}: form offers ${f.spec.id} outside the list`).toContain(f.spec.id)
        const r = launchSortie(c, { pilotId: c.roster.live[0]!, mission: m, aircraft: describeAircraft(f.spec.id), difficulty: 'normal', loadout: 'clean', now: NOW })
        expect(r.ok, `${m.id} / ${f.spec.id}: ${r.ok ? '' : r.error.message}`).toBe(true)
        checked++
      }
    }
    expect(checked).toBeGreaterThanOrEqual(20)
  })

  it('and the rank gate on the form and the reducer agree for a tier 1 and a tier 3 pilot, for every offered aircraft', () => {
    for (const m of catalog) {
      for (const tier of [1, 3] as const) {
        const c = makeCampaign({ faction: m.faction, tiers: [tier, tier, tier, tier, tier] })
        const gate = aircraftGate(c, m, c.roster.live[0]!, true)
        for (const f of formAircraft(ctx(false), m.id)) {
          const r = launchSortie(c, { pilotId: c.roster.live[0]!, mission: m, aircraft: describeAircraft(f.spec.id), difficulty: 'normal', loadout: 'clean', now: NOW })
          expect(r.ok, `${m.id} / ${f.spec.id} / tier ${tier}`).toBe(gate(f.spec.id).ok)
        }
      }
    }
  })

  it('Dev widens the form but the list does not move: those extra airplanes are exactly the ones launchSortie would refuse', () => {
    const m = catalog.find((x) => x.id === 'convoy-strike')!
    const plain = formAircraft(ctx(false), m.id).map((f) => f.spec.id)
    const dev = formAircraft(ctx(true), m.id).map((f) => f.spec.id)
    expect(dev.length).toBeGreaterThan(plain.length)
    const c = makeCampaign({ faction: 'us', tiers: [6, 6, 6, 6, 6] })
    const extra = dev.find((id) => !plain.includes(id))!
    expect(launchSortie(c, { pilotId: c.roster.live[0]!, mission: m, aircraft: describeAircraft(extra), difficulty: 'normal', loadout: 'clean', now: NOW })).toMatchObject({ ok: false, error: { code: 'aircraft-not-offered' } })
  })

  it('Mark\'s case: Convoy Strike offers the Avenger and the reducer accepts it', () => {
    const m = catalog.find((x) => x.id === 'convoy-strike')!
    expect(formAircraft(ctx(false), m.id).map((f) => f.spec.id)).toContain('tbm-3-avenger')
    const c = makeCampaign({ faction: 'us' })
    expect(launchSortie(c, { pilotId: c.roster.live[0]!, mission: m, aircraft: describeAircraft('tbm-3-avenger'), difficulty: 'normal', loadout: 'clean', now: NOW }).ok).toBe(true)
  })
})
