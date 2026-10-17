import { describe, expect, it } from 'vitest'
import { loadAircraftSpec } from '../../tools/content/load.js'
import { advance, createWorld, playerAircraft, playerParachutist, type World } from '../../src/sim/loop.js'
import { createState } from '../../src/sim/flight/state.js'
import { DT } from '../../src/sim/flight/model.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { createTerrainField } from '../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../src/sim/world/schema.js'
import { dropStick, isPilotJump } from '../../src/sim/bailout.js'
import { TEST_DROP_TICK, withTestDrop } from '../../src/sim/scenario.js'
import { worldChecksum } from '../../src/flightRecorder/checksum.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const header = parseTerrainHeader({ centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 1000, finestSamples: 3, levels: 1, encoding: 'int16-decimetres' })
const flat = createTerrainField(header, 0, new Int16Array(9).fill(100))

/** 150 m over a 10 m plain: above the 75 m "canopy cannot fill" height, so a dropped man can live. */
const world = (drops?: World<undefined>['drops']): World<undefined> => ({
  ...createWorld(f6f, createState({ position: v3(-400, 160, 0), velocity: v3(45, 0, 0) }), { pitch: 0, roll: 0, yaw: 0, throttle: 1 }),
  terrain: flat,
  ...(drops === undefined ? {} : { drops }),
})
const fly = (w: World<undefined>, ticks: number): World<undefined> => {
  let current = w
  for (let i = 0; i < ticks; i++) current = advance(current, DT).world
  return current
}
const stick = (count = 6) => [{ tick: 30, aircraft: 'player', count, kind: 'trooper' as const }]

describe('F7B dropStick', () => {
  const aircraft = playerAircraft(world())
  const a = dropStick(aircraft, 'allied', 6, 'trooper', false)

  it('releases exactly `count` distinct men, strung out behind the track, and is repeatable', () => {
    expect(a).toHaveLength(6)
    expect(new Set(a.map((m) => m.id)).size).toBe(6)
    expect(dropStick(aircraft, 'allied', 6, 'trooper', false)).toEqual(a)
    const xs = a.map((m) => m.state.position.x)
    for (let i = 1; i < xs.length; i++) expect(xs[i]!).toBeLessThan(xs[i - 1]!)
    // 0.5 s apart at 45 m/s is 22.5 m between men (the scatter is sideways only)
    expect(xs[0]! - xs[1]!).toBeCloseTo(22.5, 5)
  })

  it('is not a pilot jump, so it carries no rescue roll', () => {
    expect(a.every((m) => !isPilotJump(m) && m.kind === 'trooper' && m.recovery === null)).toBe(true)
  })
})

describe('F7B scheduled drop in the loop', () => {
  it('releases the stick on its tick and leaves the transport flying (it is not an abandoned airframe)', () => {
    const dropped = fly(world(stick()), 40)
    const control = fly(world(), 40)
    expect(dropped.parachutists).toHaveLength(6)
    expect(playerParachutist(dropped)).toBeNull()
    expect(playerAircraft(dropped).state.position).toEqual(playerAircraft(control).state.position)
    expect(control.parachutists).toBeUndefined()
  })

  it('does not release before its tick', () => {
    expect(fly(world(stick()), 29).parachutists).toBeUndefined()
  })

  it('men land alive with no rescue outcome; bundles land and sink faster', () => {
    const w = fly(world([...stick(3), { tick: 30, aircraft: 'player', count: 2, kind: 'bundle' }]), 4_200)
    const men = w.parachutists!.filter((m) => m.kind === 'trooper')
    const bundles = w.parachutists!.filter((m) => m.kind === 'bundle')
    expect(men.map((m) => m.state.phase)).toEqual(['down', 'down', 'down'])
    expect(men.every((m) => m.state.outcome === null && m.recovery === null)).toBe(true)
    expect(bundles.map((m) => m.state.phase)).toEqual(['down', 'down'])
    expect(bundles[0]!.state.contact!.tick).toBeLessThan(men[0]!.state.contact!.tick)
  })

  it('a dropped world replays to the identical checksum', () => {
    expect(worldChecksum(fly(world(stick()), 600))).toBe(worldChecksum(fly(world(stick()), 600)))
  })

  it('a drop from an aircraft that does not exist releases nothing', () => {
    expect(fly(world([{ tick: 30, aircraft: 'nobody', count: 6, kind: 'trooper' }]), 40).parachutists).toBeUndefined()
  })
})

describe('F7B DEV ?paradrop query', () => {
  const base = world()
  it('adds men then bundles on the player at the test tick', () => {
    expect(withTestDrop(base, '6,2').drops).toEqual([
      { tick: TEST_DROP_TICK, aircraft: 'player', count: 6, kind: 'trooper' },
      { tick: TEST_DROP_TICK, aircraft: 'player', count: 2, kind: 'bundle' },
    ])
    expect(withTestDrop(base, '18').drops).toHaveLength(1)
  })
  it('leaves the world untouched for anything unparseable or zero', () => {
    for (const bad of ['', 'x', '0', '0,0', '-3', '123']) expect(withTestDrop(base, bad)).toBe(base)
  })
})
