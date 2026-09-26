import { describe, it, expect } from 'vitest'
import { parseScenario, scenarioAircraftSpecIds, scenarioShipSpecIds } from '../../../src/sim/scenario.js'
import { parseAirfield } from '../../../src/sim/world/airfields.js'
import { bundleForScenario, loadAirfield } from '../../../tools/content/load.js'
import { BASE, REACH_FAR, scenario } from './fixture.js'

const WAVE = { id: 'wave-1', aircraft: [{ id: 'raid-2', spec: 'f6f-hellcat', tags: ['raid'], airborneAt: { position: [-20000, 3000, -16479], headingDeg: 90, speedMps: 130 } }] }
const SPAWN_WAVE = { id: 'launch', when: { at: 60 }, then: [{ spawn: 'wave-1' }] }
const parse = (patch: Record<string, unknown>) => parseScenario(scenario(patch))

describe('the mission vocabulary (spec 2026-09-25 §2)', () => {
  it('accepts every objective kind, every trigger condition, held groups, a badge and tags', () => {
    const s = parse({
      objectives: [
        { id: 'up', label: 'Launch', priority: 'primary', kind: 'takeoff', from: 'cv-1' },
        { id: 'gate', label: 'Gate', priority: 'primary', kind: 'reach', point: { x: 1000, z: 0 }, radiusM: 500, altitudeM: [100, 600], after: 'up' },
        { id: 'cap', label: 'CAP', priority: 'primary', kind: 'hold', point: { x: 0, z: 0 }, radiusM: 3000, seconds: 180, after: 'gate' },
        { id: 'convoy', label: 'Convoy', priority: 'primary', kind: 'destroy', targets: ['convoy'], count: 2 },
        { id: 'hangars', label: 'Hangars', priority: 'secondary', kind: 'destroy', targets: ['dulag-hangar-1'] },
        { id: 'carrier', label: 'Carrier', priority: 'primary', kind: 'protect', targets: ['cv-1'], maxLost: 0 },
        { id: 'screen', label: 'Screen', priority: 'primary', kind: 'deny', hostiles: ['raid'], around: 'cv-1', radiusM: 5000 },
        { id: 'trap', label: 'Trap', priority: 'primary', kind: 'land', at: 'cv-1', count: 3 },
      ],
      triggers: [
        SPAWN_WAVE,
        { id: 'well-done', when: { completed: 'convoy' }, then: [{ message: 'Convoy stopped' }] },
        { id: 'lost', when: { failed: 'carrier' }, then: [{ message: 'Carrier lost' }] },
        { id: 'over-dulag', when: { enters: { point: { x: -31629, z: -16479 }, radiusM: 3000 } }, then: [{ message: 'Bandits scrambling' }] },
      ],
      heldGroups: [WAVE],
      badge: { id: 'carrier-qualified', name: 'Carrier Qualified' },
      aircraft: [{ id: 'f6f-1', spec: 'f6f-hellcat', parkedAt: { ship: 'cv-1', spot: { x: 0, z: -110 } }, chocked: false }, BASE.aircraft[1]],
    })
    expect(s.objectives).toHaveLength(8)
    expect(s.heldGroups![0]!.aircraft![0]!.tags).toEqual(['raid'])
    expect(s.ships.find((sh) => sh.id === 'maru-1')!.tags).toEqual(['convoy'])
  })

  it('a scenario without objectives parses exactly as before, with no mission keys', () => {
    const s = parse({})
    expect(s.objectives).toBeUndefined()
    expect(s.triggers).toBeUndefined()
  })

  it.each([
    ['triggers without objectives', { triggers: [SPAWN_WAVE] }, /triggers need objectives/],
    ['a badge without objectives', { badge: { id: 'b', name: 'B' } }, /badge needs objectives/],
    ['a duplicate objective id', { objectives: [REACH_FAR, REACH_FAR] }, /duplicate objective id "far"/],
    ['after naming a later objective', { objectives: [{ ...REACH_FAR, after: 'near' }, { ...REACH_FAR, id: 'near' }] }, /after must name an earlier objective/],
    ['after naming nothing', { objectives: [{ ...REACH_FAR, after: 'nope' }] }, /after must name an earlier objective/],
    ['takeoff from where the player is not', { objectives: [{ id: 'up', label: 'Up', priority: 'primary', kind: 'takeoff', from: 'cv-1' }] }, /takeoff\.from must be where the player starts \(airborne\)/],
    ['land at an unknown base', { objectives: [{ id: 'home', label: 'Home', priority: 'primary', kind: 'land', at: 'henderson' }] }, /land\.at "henderson" is neither one of airfields nor a starting ship/],
    ['deny around an unknown entity', { objectives: [{ id: 'd', label: 'D', priority: 'primary', kind: 'deny', hostiles: ['raid'], around: 'cv-9', radiusM: 5000 }] }, /deny\.around "cv-9" is not a starting aircraft or ship/],
    ['an inverted altitude band', { objectives: [{ ...REACH_FAR, altitudeM: [3000, 2000] }] }, /altitudeM must be \[min, max\] with min < max/],
    ['an unknown objective key', { objectives: [{ ...REACH_FAR, radius: 5 }] }, /Unrecognized key/],
    ['an unknown objective kind', { objectives: [{ ...REACH_FAR, kind: 'escort' }] }, /kind/],
    ['a completed trigger naming nothing', { objectives: [REACH_FAR], triggers: [{ id: 't', when: { completed: 'nope' }, then: [{ message: 'x' }] }] }, /when\.completed names "nope", which is not an objective/],
    ['a failed trigger naming a kind that cannot fail', { objectives: [REACH_FAR], triggers: [{ id: 't', when: { failed: 'far' }, then: [{ message: 'x' }] }] }, /when\.failed names "far", a reach objective, which can never fail/],
    ['a spawn naming no held group', { objectives: [REACH_FAR], triggers: [{ id: 't', when: { at: 1 }, then: [{ spawn: 'wave-9' }] }] }, /spawn names "wave-9", which is not a held group/],
    ['a held group nothing spawns', { objectives: [REACH_FAR], heldGroups: [WAVE] }, /held group "wave-1" is spawned by 0 trigger actions/],
    ['a held group spawned twice', { objectives: [REACH_FAR], heldGroups: [WAVE], triggers: [SPAWN_WAVE, { ...SPAWN_WAVE, id: 'again' }] }, /held group "wave-1" is spawned by 2 trigger actions/],
    ['a held id reusing a starting id', { objectives: [REACH_FAR], triggers: [SPAWN_WAVE], heldGroups: [{ id: 'wave-1', ships: [{ id: 'maru-1', spec: 'type-b-maru', waypoints: [[0, 0]], speedMps: 0 }] }] }, /entity id "maru-1" is already used/],
    ['a parked held aircraft', { objectives: [REACH_FAR], triggers: [SPAWN_WAVE], heldGroups: [{ id: 'wave-1', aircraft: [{ id: 'raid-2', spec: 'f6f-hellcat', parkedAt: { airfield: 'dulag', spot: 'runwayCenter' }, chocked: false }] }] }, /a held aircraft must start airborne/],
    ['a held pilot targeting an unknown aircraft', { objectives: [REACH_FAR], triggers: [SPAWN_WAVE], heldGroups: [{ id: 'wave-1', aircraft: [{ ...WAVE.aircraft[0], pilot: { target: 'nobody' } }] }] }, /a held pilot must target a starting aircraft or one in its own group/],
    ['a starting pilot targeting a held aircraft', { objectives: [REACH_FAR], triggers: [SPAWN_WAVE], heldGroups: [WAVE], aircraft: [BASE.aircraft[0], { ...BASE.aircraft[1], pilot: { target: 'raid-2' } }] }, /pilot target must name an aircraft in this scenario/],
    ['an empty held group', { objectives: [REACH_FAR], triggers: [SPAWN_WAVE], heldGroups: [{ id: 'wave-1' }] }, /a held group must hold at least one aircraft or ship/],
  ])('rejects %s', (_name, patch, message) => {
    expect(() => parse(patch)).toThrow(message)
  })

  it('a held pilot may target a starting aircraft or its own groupmate', () => {
    const twoShip = { id: 'wave-1', aircraft: [{ ...WAVE.aircraft[0], pilot: { target: 'f6f-1' } }, { ...WAVE.aircraft[0], id: 'raid-3', pilot: { target: 'raid-2' } }] }
    expect(() => parse({ objectives: [REACH_FAR], triggers: [SPAWN_WAVE], heldGroups: [twoShip] })).not.toThrow()
  })

  it('an airfield building may carry tags', () => {
    const dulag = loadAirfield('dulag')
    const tagged = parseAirfield({ ...dulag, buildings: dulag.buildings.map((b) => ({ ...b, tags: ['dulag-hangars'] })) })
    expect(tagged.buildings.every((b) => b.tags?.[0] === 'dulag-hangars')).toBe(true)
    expect(() => parseAirfield({ ...dulag, buildings: dulag.buildings.map((b) => ({ ...b, tags: [] })) })).toThrow()
  })

  it('the bundle loads the specs a held group names, even ones no starting entity uses', () => {
    const s = parse({
      objectives: [REACH_FAR],
      triggers: [{ id: 't', when: { at: 1 }, then: [{ spawn: 'escort' }] }],
      heldGroups: [{ id: 'escort', ships: [{ id: 'dd-9', spec: 'fletcher-dd', waypoints: [[-24000, -9000], [-23000, -9000]], speedMps: 7 }] }],
    })
    expect(scenarioShipSpecIds(s)).toContain('fletcher-dd')
    expect(scenarioAircraftSpecIds(s)).toEqual(['f6f-hellcat', 'f6f-hellcat'])
    expect(bundleForScenario(s).shipSpecs['fletcher-dd']).toBeDefined()
  })
})
