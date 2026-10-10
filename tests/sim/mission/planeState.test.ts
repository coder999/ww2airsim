/**
 * B4's condition kind: a test on the player's own airplane (gear, flaps, bay
 * doors, air-relative speed, altitude, throttle), as an objective (`kind:
 * 'state'`) and as a trigger (`when: { state }`). Pure sim, so everything here
 * runs through production `advance`.
 */
import { describe, it, expect } from 'vitest'
import { parseScenario } from '../../../src/sim/scenario.js'
import { advance, withAircraftState, withControls, playerAircraft, type World } from '../../../src/sim/loop.js'
import { DT, createState } from '../../../src/sim/flight/model.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { planeStateHolds } from '../../../src/sim/mission/step.js'
import { ticksFor, radioMessages } from '../../../src/sim/mission/state.js'
import { BASE, NORTH, REACH_FAR, destroyAircraft, missionWorld, progressOf, scenario, steps } from './fixture.js'

const objective = (want: Record<string, unknown>) => ({ id: 's', label: 'State', priority: 'primary', kind: 'state', ...want })
const world = (want: Record<string, unknown>, patch: Record<string, unknown> = {}): World<undefined> =>
  missionWorld({ objectives: [objective(want)], ...patch })

/** The player 3,000 m up at 120 m/s, nose north, with `over` replacing any state field. */
function fly(w: World<undefined>, over: { gear?: number; flaps?: number; bay?: number; y?: number; speed?: number } = {}): World<undefined> {
  return withAircraftState(w, w.player, createState({
    position: v3(0, over.y ?? 3000, 0), velocity: v3(0, 0, -(over.speed ?? 120)), attitude: NORTH,
    gearFraction: over.gear ?? 0, flapFraction: over.flaps ?? 0, bayDoorFraction: over.bay ?? 0, tick: w.tick,
  }))
}
const done = (w: World<undefined>): boolean => progressOf(w, 's').status === 'complete'

describe('schema', () => {
  const parse = (o: Record<string, unknown>, extra: Record<string, unknown> = {}) => parseScenario(scenario({ objectives: [o], ...extra }))
  it('accepts every field, singly and together', () => {
    for (const want of [
      { gear: 'up' }, { gear: 'down' }, { flaps: 'down' }, { bayDoors: 'open' }, { bayDoors: 'shut' },
      { airspeedMps: [0, 53.6] }, { altitudeM: [457, 1524] }, { throttle: [0.9, 1] },
      { gear: 'down', flaps: 'down', airspeedMps: [0, 53.6], altitudeM: [0, 900], throttle: [0, 0.5] },
    ]) expect(() => parse(objective(want)), JSON.stringify(want)).not.toThrow()
  })
  it('rejects an empty test, an inverted range, a throttle outside 0..1, a bad word and an unknown key', () => {
    for (const bad of [{}, { altitudeM: [900, 100] }, { airspeedMps: [50, 50] }, { throttle: [0.5, 1.2] }, { throttle: [-0.1, 0.5] }, { gear: 'half' }, { flaps: 20 }, { rpm: [1, 2] }]) {
      expect(() => parse(objective(bad)), JSON.stringify(bad)).toThrow()
    }
  })
  it('names the empty objective, and rejects an empty trigger test too', () => {
    expect(() => parse(objective({}))).toThrow(/needs at least one of/)
    expect(() => parse(REACH_FAR, { triggers: [{ id: 't', when: { state: {} }, then: [{ message: 'x' }] }] })).toThrow(/needs at least one of/)
    expect(() => parse(REACH_FAR, { triggers: [{ id: 't', when: { state: { gear: 'up' } }, then: [{ message: 'x' }] }] })).not.toThrow()
  })
})

describe('each field passes and fails in production advance', () => {
  // [field, the test, a state that satisfies it, a state that does not]
  const cases = [
    ['gear down', { gear: 'down' }, { gear: 1 }, { gear: 0 }],
    ['gear down, still in transit', { gear: 'down' }, { gear: 1 }, { gear: 0.6 }],
    ['gear up', { gear: 'up' }, { gear: 0 }, { gear: 1 }],
    ['gear up, still in transit', { gear: 'up' }, { gear: 0 }, { gear: 0.4 }],
    ['flaps down', { flaps: 'down' }, { flaps: 1 }, { flaps: 0 }],
    ['flaps up', { flaps: 'up' }, { flaps: 0 }, { flaps: 1 }],
    ['altitude band', { altitudeM: [457, 1524] }, { y: 900 }, { y: 200 }],
    ['altitude band, above it', { altitudeM: [457, 1524] }, { y: 900 }, { y: 3000 }],
    ['below 120 mph', { airspeedMps: [0, 53.6] }, { speed: 50 }, { speed: 60 }],
    ['above 200 mph', { airspeedMps: [89.4, 400] }, { speed: 100 }, { speed: 80 }],
  ] as const
  it.each(cases)('%s', (_name, want, good, bad) => {
    expect(done(steps(fly(world(want), good), 1))).toBe(true)
    const w = steps(fly(world(want), bad), 1)
    expect(done(w)).toBe(false)
    expect(progressOf(w, 's').status).toBe('active')
  })

  it('throttle reads the lever, not the engine', () => {
    const w = world({ throttle: [0.9, 1] })
    expect(done(steps(withControls(fly(w), w.player, { pitch: 0, roll: 0, yaw: 0, throttle: 0.2 }), 5))).toBe(false)
    expect(done(steps(withControls(fly(w), w.player, { pitch: 0, roll: 0, yaw: 0, throttle: 1 }), 1))).toBe(true)
  })

  it('airspeed is air-relative: a 20 m/s headwind makes 40 m/s of ground speed 60 m/s of air', () => {
    const want = { airspeedMps: [0, 53.6] }
    const calm = fly(world(want), { speed: 40 })
    expect(done(steps(calm, 1))).toBe(true)
    // Wind from the north (000) blows toward +z, into a nose pointing north (-z).
    const windy = fly(missionWorld({ objectives: [objective(want)], weather: { windFromDeg: 0, windMps: 20 } }), { speed: 40 })
    expect(windy.wind).not.toBeNull()
    expect(done(steps(windy, 1))).toBe(false)
    expect(done(steps(fly(missionWorld({ objectives: [objective({ airspeedMps: [50, 70] })], weather: { windFromDeg: 0, windMps: 20 } }), { speed: 40 }), 1))).toBe(true)
  })

  it('the bay doors open for real: the objective completes the tick the doors reach fully open, not before', () => {
    const w0 = missionWorld({
      aircraft: [{ ...BASE.aircraft[0]!, spec: 'b-17-flying-fortress' }, BASE.aircraft[1]],
      objectives: [objective({ bayDoors: 'open' })],
    })
    const travel = playerAircraft(w0).spec.bayDoors!.travelSeconds
    let w = w0
    let ticks = 0
    while (!done(w) && ticks < ticksFor(travel) + 120) {
      w = advance(withControls(w, w.player, { pitch: 0, roll: 0, yaw: 0, throttle: 0.6, bayDoorsOpen: true }), DT).world
      ticks++
    }
    expect(done(w)).toBe(true)
    expect(playerAircraft(w).state.bayDoorFraction).toBeGreaterThanOrEqual(1)
    expect(ticks).toBeGreaterThanOrEqual(ticksFor(travel) - 1)
    expect(ticks).toBeLessThanOrEqual(ticksFor(travel) + 1)
  })

  it('shut is the state of an airplane with no doors', () => {
    expect(done(steps(fly(world({ bayDoors: 'shut' })), 1))).toBe(true)
    expect(done(steps(fly(world({ bayDoors: 'open' })), 1))).toBe(false)
  })

  it('the gear comes down for real: the objective completes when the gear is fully out, and the wrong lever never completes it', () => {
    let w = fly(world({ gear: 'down' }))
    for (let i = 0; i < 600; i++) w = advance(withControls(w, w.player, { pitch: 0, roll: 0, yaw: 0, throttle: 0.6, gearDown: false }), DT).world
    expect(done(w)).toBe(false)
    let ticks = 0
    while (!done(w) && ticks < 1200) {
      w = advance(withControls(w, w.player, { pitch: 0, roll: 0, yaw: 0, throttle: 0.6, gearDown: true }), DT).world
      ticks++
    }
    expect(done(w)).toBe(true)
    expect(playerAircraft(w).state.gearFraction).toBe(1)
    expect(ticks).toBeGreaterThan(60)
  })
})

describe('combining and gating', () => {
  const want = { gear: 'down', flaps: 'down', airspeedMps: [0, 53.6] }
  it('every field must hold at once', () => {
    const w = world(want)
    expect(done(steps(fly(w, { gear: 1, flaps: 1, speed: 50 }), 1))).toBe(true)
    expect(done(steps(fly(w, { gear: 0, flaps: 1, speed: 50 }), 1)), 'gear missing').toBe(false)
    expect(done(steps(fly(w, { gear: 1, flaps: 0, speed: 50 }), 1)), 'flaps missing').toBe(false)
    expect(done(steps(fly(w, { gear: 1, flaps: 1, speed: 60 }), 1)), 'too fast').toBe(false)
  })

  it('a dead player completes nothing', () => {
    const w = destroyAircraft(fly(world(want), { gear: 1, flaps: 1, speed: 50 }), 'f6f-1')
    expect(done(steps(w, 30))).toBe(false)
  })

  it('waits for its `after`, then reads the state of that tick', () => {
    const w = missionWorld({ objectives: [
      { ...REACH_FAR, id: 'first' }, { ...objective({ gear: 'down' }), after: 'first' },
    ] })
    expect(progressOf(steps(fly(w, { gear: 1 }), 5), 's').status).toBe('inactive')
  })

  it('is a trigger too: fires once, the tick the airplane matches, and never for a dead player', () => {
    const trig = { objectives: [REACH_FAR], triggers: [{ id: 'gear', when: { state: { gear: 'down' } }, then: [{ message: 'Gear down' }] }] }
    let w = steps(fly(missionWorld(trig), { gear: 0 }), 3)
    expect(w.mission!.fired).toEqual([])
    w = steps(fly(w, { gear: 1 }), 1)
    expect(w.mission!.fired).toEqual(['gear'])
    w = steps(fly(w, { gear: 0 }), 5)
    w = steps(fly(w, { gear: 1 }), 5)
    expect(radioMessages(w.mission!).map((m) => m.text)).toEqual(['Gear down'])
    const dead = steps(destroyAircraft(fly(missionWorld(trig), { gear: 1 }), 'f6f-1'), 10)
    expect(dead.mission!.fired).toEqual([])
  })

  it('is deterministic: two identical runs agree to the last bit', () => {
    const run = () => {
      let w = fly(world(want))
      for (let i = 0; i < 300; i++) w = advance(withControls(w, w.player, { pitch: 0, roll: 0, yaw: 0, throttle: 0.1, gearDown: true, flapDown: true }), DT).world
      return w
    }
    expect(run()).toEqual(run())
  })
})

describe('planeStateHolds (the function itself)', () => {
  it('has no opinion on a field it was not asked about', () => {
    const w = fly(world({ gear: 'up' }))
    expect(planeStateHolds({}, playerAircraft(w), null)).toBe(true)
  })
})
