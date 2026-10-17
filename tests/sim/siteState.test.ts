import { describe, it, expect } from 'vitest'
import { expandScenario, SITE_OMIT_GROUPS, siteStateFromQuery, withSiteNames } from '../../src/sim/world/sites.js'
import { loadScenario, loadSite } from '../../tools/content/load.js'
import { parseScenario } from '../../src/sim/scenario.js'
import { BASE } from './mission/fixture.js'

describe('DEV ?siteState (F8A Task 9)', () => {
  it('reads site:window pairs, in order', () => {
    expect(siteStateFromQuery('?x=1&siteState=tacloban:buildup,dulag:assault')).toEqual({
      sites: ['tacloban', 'dulag'], windows: { tacloban: 'buildup', dulag: 'assault' }, omit: [],
    })
  })
  it('is null when absent or empty', () => {
    expect(siteStateFromQuery('?spawnX=1')).toBeNull()
    expect(siteStateFromQuery('?siteState=')).toBeNull()
  })
  it('throws, naming the fault, for a malformed pair or an unknown window', () => {
    expect(() => siteStateFromQuery('?siteState=tacloban')).toThrow(/<site>:<window>/)
    expect(() => siteStateFromQuery('?siteState=tacloban:a:b')).toThrow(/<site>:<window>/)
    expect(() => siteStateFromQuery('?siteState=tacloban:midwar')).toThrow(/midwar/)
  })
  it('names the sites on a scenario once each', () => {
    const s = withSiteNames(withSiteNames(loadScenario('free-flight'), ['tacloban']), ['tacloban', 'dulag'])
    expect(s.sites).toEqual(['tacloban', 'dulag'])
  })
})

describe('DEV ?siteOmit (F8B Task B8): leave one source of a site-state out, for the differential budget arms', () => {
  it('reads a list of groups; none means none', () => {
    expect(SITE_OMIT_GROUPS).toEqual(['buildings', 'aircraft', 'vehicles', 'clutter'])
    expect(siteStateFromQuery('?siteState=buri:pre-invasion&siteOmit=aircraft,clutter')!.omit).toEqual(['aircraft', 'clutter'])
    expect(siteStateFromQuery('?siteState=buri:pre-invasion')!.omit).toEqual([])
  })
  it('throws, naming the group, for one that does not exist', () => {
    expect(() => siteStateFromQuery('?siteState=buri:pre-invasion&siteOmit=ships')).toThrow(/ships/)
  })

  const scenario = parseScenario({ ...BASE, id: 'omit-fixture', airfields: ['tacloban'], sites: ['buri'] })
  const sites = { buri: loadSite('buri') }
  const windows = { buri: 'j6-alternate' }
  const out = (omit?: readonly (typeof SITE_OMIT_GROUPS)[number][]) => expandScenario(scenario, sites, windows, omit)

  it('with nothing omitted the expansion is exactly the F8A one', () => {
    expect(JSON.stringify(out([]))).toBe(JSON.stringify(out()))
  })
  it('each group removes exactly its own content and nothing else', () => {
    const all = out()
    const field = (o: ReturnType<typeof out>) => o.airfields.buri!
    expect(all.scenario.aircraft.filter((a) => a.id.startsWith('buri-')).length).toBeGreaterThan(0)
    expect(out(['aircraft']).scenario.aircraft.filter((a) => a.id.startsWith('buri-'))).toHaveLength(0)
    expect(out(['aircraft']).scenario.vehicles.length).toBe(all.scenario.vehicles.length)
    expect(out(['vehicles']).scenario.vehicles.filter((v) => v.id.startsWith('buri-'))).toHaveLength(0)
    expect(out(['vehicles']).scenario.aircraft.length).toBe(all.scenario.aircraft.length)
    expect(field(out(['clutter'])).clutter).toBeUndefined()
    expect(field(all).clutter).toBeDefined()
    expect(field(out(['buildings'])).buildings).toHaveLength(1)
    expect(field(out(['buildings'])).clutter).toBeDefined()
    expect(field(all).buildings.length).toBeGreaterThan(5)
  })
})
