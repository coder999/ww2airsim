import { describe, it, expect } from 'vitest'
import { siteStateFromQuery, withSiteNames } from '../../src/sim/world/sites.js'
import { loadScenario } from '../../tools/content/load.js'

describe('DEV ?siteState (F8A Task 9)', () => {
  it('reads site:window pairs, in order', () => {
    expect(siteStateFromQuery('?x=1&siteState=tacloban:buildup,dulag:assault')).toEqual({
      sites: ['tacloban', 'dulag'], windows: { tacloban: 'buildup', dulag: 'assault' },
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
