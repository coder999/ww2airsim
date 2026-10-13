import { describe, expect, it } from 'vitest'
import { loadScenario } from '../../tools/content/load.js'
import { swarmFromQuery, withSwarm, SWARM_PROBE_ANCHOR, type Swarm, type SwarmAnchor } from '../../src/sim/swarm.js'
import { terrainOrSkip } from './mission/fly.js'
import { swarmWorld, timeTicks } from './swarmHarness.js'

/**
 * The entity-scaling swarm (plan 2026-10-10-entity-scaling). What it must get right for the
 * measurement to mean anything: the counts asked for, a real mix of airframes and sides with pilots
 * that pass the scenario rules, "tight" really in the camera's view, "mission" really spread out,
 * and ships on water.
 */
const MAX: Swarm = { aircraft: 60, ships: 20, layout: 'tight' }

/** (forward, right, up) of a world point from the anchor. */
function local(a: SwarmAnchor, x: number, y: number, z: number): [number, number, number] {
  const h = (a.headingDeg * Math.PI) / 180
  const [dx, dz] = [x - a.x, z - a.z]
  return [dx * Math.sin(h) - dz * Math.cos(h), dx * Math.cos(h) + dz * Math.sin(h), y - a.y]
}

describe('the swarm query', () => {
  it('is absent without a count, defaults to tight, and refuses a malformed value', () => {
    expect(swarmFromQuery('?spawnX=1')).toBeNull()
    expect(swarmFromQuery('?swarmAircraft=30')).toEqual({ aircraft: 30, ships: 0, layout: 'tight' })
    expect(swarmFromQuery('?swarmShips=5&swarmLayout=mission')).toEqual({ aircraft: 0, ships: 5, layout: 'mission' })
    expect(() => swarmFromQuery('?swarmAircraft=-1')).toThrow(/whole number/)
    expect(() => swarmFromQuery('?swarmAircraft=2.5')).toThrow(/whole number/)
    expect(() => swarmFromQuery('?swarmAircraft=')).toThrow(/whole number/)
    expect(() => swarmFromQuery('?swarmShips=1&swarmLayout=wide')).toThrow(/tight, mission/)
  })
})

describe('withSwarm', () => {
  const base = loadScenario('free-flight')
  const a = SWARM_PROBE_ANCHOR

  it('adds exactly what was asked, a mix of types on both sides, every pilot valid', () => {
    const s = withSwarm(base, MAX, a) // re-parsed: formation, ingress and side rules all ran
    const added = s.aircraft.filter((x) => x.id.startsWith('swarm-'))
    const ships = s.ships.filter((x) => x.id.startsWith('swarm-'))
    expect([added.length, ships.length]).toEqual([60, 20])
    expect(s.aircraft.length - added.length).toBe(base.aircraft.length)
    expect(new Set(added.map((x) => x.side))).toEqual(new Set(['allied', 'axis']))
    expect(new Set(ships.map((x) => x.side))).toEqual(new Set(['allied', 'axis']))
    const specs = new Set(added.map((x) => x.spec))
    for (const spec of ['f6f-hellcat', 'a6m2-zero', 'tbm-3-avenger', 'g4m-betty']) expect(specs).toContain(spec)
    expect(specs.size).toBeGreaterThanOrEqual(8)
    expect(new Set(ships.map((x) => x.spec)).size).toBeGreaterThanOrEqual(8)
    // Three wingmen per leader, and bombers sent at the other side's ships.
    expect(added.filter((x) => x.pilot?.leader !== undefined)).toHaveLength(45)
    expect(added.some((x) => x.pilot?.ingress?.destination !== undefined)).toBe(true)
  })

  it('tight: every airplane and hull starts inside the chase camera view (60 x 91 degrees)', () => {
    const s = withSwarm(base, MAX, a)
    for (const x of s.aircraft.filter((x) => x.id.startsWith('swarm-'))) {
      if (!('airborneAt' in x)) throw new Error('swarm aircraft is not airborne')
      const [f, r, u] = local(a, ...x.airborneAt.position)
      expect(f).toBeGreaterThan(200)
      expect(Math.abs(r) / f).toBeLessThan(Math.tan((45 * Math.PI) / 180))
      expect(Math.abs(u) / f).toBeLessThan(Math.tan((30 * Math.PI) / 180))
    }
    for (const x of s.ships.filter((x) => x.id.startsWith('swarm-'))) {
      const [f, r, u] = local(a, x.waypoints[0]![0], 0, x.waypoints[0]![1])
      expect(Math.abs(r) / f).toBeLessThan(1)
      expect(Math.abs(u) / f).toBeLessThan(Math.tan((30 * Math.PI) / 180))
    }
  })

  it('mission: the camera has one engagement near it, the rest of the sky is miles away', () => {
    const s = withSwarm(base, { ...MAX, layout: 'mission' }, a)
    const range = s.aircraft.filter((x) => x.id.startsWith('swarm-')).map((x) => {
      if (!('airborneAt' in x)) throw new Error('swarm aircraft is not airborne')
      const [f, r] = local(a, ...x.airborneAt.position)
      return Math.hypot(f, r)
    })
    expect(range.filter((d) => d < 2000)).toHaveLength(8)
    expect(range.filter((d) => d > 7000)).toHaveLength(52)
  })

  const terrain = terrainOrSkip()
  it.skipIf(terrain === null)('both layouts build over the real terrain with every ship loop on water, and fly', () => {
    for (const layout of ['tight', 'mission'] as const) {
      const { world, god } = swarmWorld({ ...MAX, layout }, terrain)
      expect(world.aircraft).toHaveLength(62)
      const { world: after } = timeTicks(world, god, 60)
      expect(after.tick).toBe(world.tick + 60)
    }
  })
})
