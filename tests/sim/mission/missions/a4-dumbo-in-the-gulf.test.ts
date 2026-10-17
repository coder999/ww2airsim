/**
 * A4 Dumbo in the Gulf (F10B plan, F3 section 4): C1, the content contract. Written red, before the scenario existed.
 * The scenario plays in the Jinamoc `buildup` window (F3 section 5: the anchorage, its lamps and the rescue launch are there late Oct-Nov).
 */
import { describe, expect, it } from 'vitest'
import { loadScenarioBundle } from '../../../../tools/content/load.js'
import { worldFromScenario } from '../../../../src/sim/scenario.js'
import { playerAircraft } from '../../../../src/sim/loop.js'

const A4 = 'a4-dumbo-in-the-gulf'
const BUILDUP = { jinamoc: 'buildup' } as const
const YD = 0.9144

describe('A4 content', () => {
  const bundle = loadScenarioBundle(A4, BUILDUP)
  const { scenario } = bundle
  const w = worldFromScenario(bundle, null)

  it('the PBY-5A starts afloat at the San Pedro Bay anchorage, at night, with the anchorage declared as a recovery circle', () => {
    expect(playerAircraft(w).spec.id).toBe('pby-5a-catalina')
    expect(scenario.aircraft.find((a) => a.id === scenario.player)).toHaveProperty('afloatAt')
    expect(scenario.weather.timeOfDay).toBe(21)
    expect(scenario.anchorages).toHaveLength(1)
    expect(scenario.sites).toEqual(['jinamoc'])
  })

  it('one three-person raft group and one separated survivor; the 63-ft launch is the site\'s own, moored at the pier', () => {
    const rafts = w.vehicles.filter((v) => v.survivors !== undefined)
    expect(rafts.map((v) => [v.id, v.survivors])).toEqual([['raft-1', 3], ['survivor-1', 1]])
    expect(w.vehicles.find((v) => v.id === 'jinamoc-veh-launch')?.spec.id).toBe('usaaf-63ft-rescue-boat')
  })

  it('peak air population is three: the PBY and the two Ki-43s, who are held and do not exist at the start', () => {
    expect(scenario.population).toEqual({ airborne: 3, ships: 0 })
    // the site adds a moored PBY (`jinamoc-bu-pby-1`, dressing at a buoy, not airborne), which is not counted
    expect(w.aircraft.map((a) => a.id).filter((id) => !id.startsWith('jinamoc-'))).toEqual(['pby-1'])
    const recon = scenario.heldGroups!.find((g) => g.id === 'recon')!
    expect(recon.aircraft!.map((a) => a.spec)).toEqual(['ki-43-oscar', 'ki-43-oscar'])
  })

  it('the badge path: takeoff, search area, flare, a landing within 150 yd, a pickup of three, the return; the survivor is the secondary', () => {
    const o = scenario.objectives!
    expect(o.filter((x) => x.priority === 'primary').map((x) => x.kind)).toEqual(['takeoff', 'reach', 'state', 'landedNear', 'pickup', 'land'])
    expect(o.find((x) => x.kind === 'landedNear')).toMatchObject({ entity: 'raft-1', radiusM: expect.closeTo(150 * YD, 1) })
    expect(o.find((x) => x.id === 'pickup')).toMatchObject({ raft: 'raft-1', survivors: 3, withinM: expect.closeTo(100 * 0.3048, 1), dwellS: 20 })
    expect(o.find((x) => x.priority === 'secondary')).toMatchObject({ kind: 'pickup', raft: 'survivor-1', survivors: 1, after: 'pickup' })
    expect(scenario.freezeOnSuccess).toBe(true)
  })

  it('the Ki-43s spawn once, when the first pickup completes, and not earlier', () => {
    const t = scenario.triggers!.find((x) => x.then.some((a) => 'spawn' in a && a.spawn === 'recon'))!
    expect(t.when).toEqual({ completed: 'pickup' })
  })
})
