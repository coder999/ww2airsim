import { describe, expect, it } from 'vitest'
import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { bundleForScenario, loadAirfield } from '../../../tools/content/load.js'
import { aircraftById, type World } from '../../../src/sim/loop.js'
import { localToWorld, parkedAttitude, runwayHeadingRad } from '../../../src/sim/world/airfields.js'
import { deckParkSpots, runwayParkSpots } from '../../../src/sim/ai/parkSpots.js'
import { createState } from '../../../src/sim/flight/state.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { deckFor, span } from './parkSpotFixtures.js'

/** 7g spec §7: `pilot.home`, each rejection rule by name and the id-ranked
 *  resolution to plain data. Raw scenario JSON through
 *  parseScenario/bundleForScenario/worldFromScenario, so the content path is
 *  exercised too, same as formationSchema.test.ts. */

const PLAYER = { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0] as [number, number, number], headingDeg: 90, speedMps: 120 } }

const aiAirborne = (id: string) => ({
  id, spec: 'f6f-hellcat', side: 'axis' as const,
  airborneAt: { position: [0, 3000, 0] as [number, number, number], headingDeg: 90, speedMps: 120 },
})

/** A destroyer with no flightDeck (content/ships/fletcher-dd.json), the same
 *  ship id and spec content/scenarios/deck-quals.json uses for its own
 *  no-flight-deck ship. The default starting ship for `build`'s scenarios. */
const DEFAULT_SHIPS = [{ id: 'dd-1', spec: 'fletcher-dd', side: 'allied' as const, waypoints: [[0, 0] as [number, number]], speedMps: 0 }]

/** An anchored Casablanca-class CVE (single waypoint, speedMps 0; Plan 6b's
 *  maru rule). */
const cve = (id: string) => ({ id, spec: 'casablanca-cve', side: 'allied' as const, waypoints: [[0, 0] as [number, number]], speedMps: 0 })

function build(aircraft: unknown[], extra: Record<string, unknown> = {}): World<undefined> {
  return worldFromScenario(bundleForScenario(parseScenario({
    id: 'recovery-schema', player: 'f6f-1', airfields: ['tacloban'],
    aircraft: [PLAYER, ...aircraft], ships: DEFAULT_SHIPS, weather: { windFromDeg: 0, windMps: 0 }, ...extra,
  })), null)
}

describe('pilot.home (7g spec §7)', () => {
  it.each([
    ['an unknown airfield', { airfield: 'nowhere' }, 'home airfield "nowhere" is not one of airfields'],
    ['an unknown ship', { ship: 'cv-9' }, 'home ship "cv-9" is not a starting ship'],
    ['a ship with no flight deck', { ship: 'dd-1' }, 'home ship "dd-1" has no flight deck'],
  ])('rejects %s', (_label, home, message) => {
    expect(() => build([{ ...aiAirborne('ai-1'), pilot: { home } }])).toThrow(message)
  })

  it('rejects more aircraft homed to one deck than it has park spots', () => {
    const n = deckParkSpots(deckFor('casablanca-cve'), span).length
    const many = Array.from({ length: n + 1 }, (_, i) => ({ ...aiAirborne(`ai-${i}`), pilot: { home: { ship: 'cve-1' } } }))
    expect(() => build(many, { ships: [cve('cve-1')] })).toThrow(`home ship "cve-1" parks ${n}`)
  })

  it('resolves a runway home to its approach geometry and the id-ranked park spot', () => {
    const w = build([
      { ...aiAirborne('ai-b'), pilot: { home: { airfield: 'tacloban' } } },
      { ...aiAirborne('ai-a'), pilot: { home: { airfield: 'tacloban' } } },
    ])
    const a = loadAirfield('tacloban')
    const spots = runwayParkSpots(a, span)
    const homeA = aircraftById(w, 'ai-a')!.pilot!.home!
    const homeB = aircraftById(w, 'ai-b')!.pilot!.home!
    expect(homeA).toMatchObject({ kind: 'runway', airfieldId: 'tacloban', parkSpot: spots[0] })
    expect(homeB).toMatchObject({ parkSpot: spots[1] }) // id order, not array order
    expect(homeA.kind === 'runway' && homeA.headingRad).toBe(runwayHeadingRad(a))
    const aim = localToWorld(a, 0, a.runway.lengthM / 4)
    expect(homeA.kind === 'runway' && [homeA.aimX, homeA.aimZ]).toEqual([aim.x, aim.z])
  })

  it('home is plain data: the world survives structuredClone', () => {
    const w = build([{ ...aiAirborne('ai-1'), pilot: { home: { airfield: 'tacloban' } } }])
    expect(structuredClone(w).aircraft[1]!.pilot!.home).toEqual(w.aircraft[1]!.pilot!.home)
  })

  it("a runway home's parkWorld resolves to the same attitude parkedAttitude builds", () => {
    const w = build([{ ...aiAirborne('ai-1'), pilot: { home: { airfield: 'tacloban' } } }])
    const home = aircraftById(w, 'ai-1')!.pilot!.home!
    if (home.kind !== 'runway') throw new Error('expected a runway home')
    const state = createState({
      position: v3(home.parkWorld.x, 0, home.parkWorld.z),
      velocity: v3(0, 0, 0),
      attitude: qFromAxisAngle(v3(0, 1, 0), Math.PI / 2 - home.parkWorld.headingRad),
    })
    expect(state.attitude).toEqual(parkedAttitude(loadAirfield('tacloban')))
  })

  it('allows home alongside leader and slot (a wingman has a home)', () => {
    expect(() => build([
      { ...aiAirborne('wing-1'), side: 'allied' as const, pilot: { leader: 'f6f-1', slot: 1, home: { airfield: 'tacloban' } } },
    ])).not.toThrow()
  })

  it('allows home alongside ingress (a raider may have a home)', () => {
    const route = { route: [{ x: 0, z: -9000, altitudeM: 3000, speedMps: 120 }] }
    expect(() => build([
      { ...aiAirborne('raider-1'), pilot: { ingress: route, home: { airfield: 'tacloban' } } },
    ])).not.toThrow()
  })
})
