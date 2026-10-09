import { describe, expect, it } from 'vitest'
import { loadAircraftSpec, bundleForScenario } from '../../tools/content/load.js'
import { bayDoorDragN, bayDoorsAfter, bayDoorsShut } from '../../src/sim/bayDoors.js'
import { parseScenario, worldFromScenario } from '../../src/sim/scenario.js'
import { advance, aircraftById, createWorldOf, type AircraftEntity, type World } from '../../src/sim/loop.js'
import { createState } from '../../src/sim/flight/state.js'
import { length, v3 } from '../../src/sim/math/vec3.js'
import { DT } from '../../src/sim/flight/model.js'
import { BAY_DOORS_OPEN_RANGE_M } from '../../src/sim/ai/ingress.js'

/** Bomb-bay doors (C2): the lever's travel, the drag, the release gate's predicate, and the AI stub. */
const b29 = loadAircraftSpec('b-29-superfortress')
const f6f = loadAircraftSpec('f6f-hellcat')

describe('bay doors (C2)', () => {
  it("travel takes the spec's own travelSeconds each way, and an undefined lever holds", () => {
    const t = b29.bayDoors!.travelSeconds
    let f = 0, s = 0
    while (f < 1) { f = bayDoorsAfter(b29, f, true, DT); s += DT }
    expect(s).toBeCloseTo(t, 1)
    expect(bayDoorsAfter(b29, 0.4, undefined, DT)).toBe(0.4)
    expect(bayDoorsAfter(b29, 0.4, false, 10 * t)).toBe(0)
  })

  it('an airplane without doors never moves them, never drags them, and is never held by them', () => {
    expect(bayDoorsAfter(f6f, 0, true, 100)).toBe(0)
    expect(bayDoorDragN(f6f, 1, 5000)).toBe(0)
    expect(bayDoorsShut(f6f, 0)).toBe(false)
  })

  it('drag scales with the door fraction; only fully open lets a bomb go; NaN reads shut and drag-free', () => {
    const q = 5000
    expect(bayDoorDragN(b29, 0.5, q)).toBeCloseTo(0.5 * bayDoorDragN(b29, 1, q), 9)
    expect(bayDoorDragN(b29, 1, q)).toBeCloseTo(q * b29.bayDoors!.dragAreaM2, 9)
    expect(bayDoorDragN(b29, Number.NaN, q)).toBe(0)
    expect(bayDoorsShut(b29, 0.999)).toBe(true)
    expect(bayDoorsShut(b29, 1)).toBe(false)
    expect(bayDoorsShut(b29, Number.NaN)).toBe(true)
  })
})

describe('open doors cost speed through the real step (C2)', () => {
  it('a B-29 with its doors open from the start is slower after 10 s than one with them shut', () => {
    const speedAfter = (open: boolean): number => {
      const state = createState({ position: v3(0, 3000, 0), velocity: v3(110, 0, 0), fuelKg: 8000, bayDoorFraction: open ? 1 : 0 })
      const a: AircraftEntity = { id: 'b', spec: b29, state, previous: state, controls: { pitch: 0, roll: 0, yaw: 0, throttle: 0.8, bayDoorsOpen: open }, assistMemory: undefined, impact: null, parked: false }
      let w = createWorldOf({ aircraft: [a], player: 'b' })
      for (let i = 0; i < 10 / DT; i++) w = advance(w, DT).world
      expect(aircraftById(w, 'b')!.state.bayDoorFraction).toBe(open ? 1 : 0)
      return length(aircraftById(w, 'b')!.state.velocity)
    }
    expect(speedAfter(true)).toBeLessThan(speedAfter(false) - 0.1)
  })
})

// The AI stub, through production `advance`: a B-29 raider flying at a carrier.
const RAIDER = {
  id: 'raid-1', spec: 'b-29-superfortress', airborneAt: { position: [0, 3000, 0], headingDeg: 0, speedMps: 110 },
  // One waypoint 500 m ahead, reached at once (WAYPOINT_REACHED_M): the schema wants a route.
  pilot: { skill: 'green', ingress: { route: [{ x: 0, z: -500, altitudeM: 3000, speedMps: 110 }], destination: { ship: 'cv-1' } } },
}
const PLAYER_FAR = { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [60000, 3000, 60000], headingDeg: 90, speedMps: 120 } }
// The destination is a carrier steaming north-to-south far ahead, slowly: only its range matters.
const build = (destinationZ: number): World<undefined> => worldFromScenario(bundleForScenario(parseScenario({
  id: 'bay-doors-test', player: 'f6f-1', airfields: ['tacloban'], aircraft: [PLAYER_FAR, RAIDER],
  ships: [{ id: 'cv-1', spec: 'essex-cv', side: 'allied', waypoints: [[0, destinationZ], [0, destinationZ - 20000]], speedMps: 1 }],
  weather: { windFromDeg: 0, windMps: 0 },
})), null)
const run = (w: World<undefined>, seconds: number): World<undefined> => {
  for (let i = 0; i < seconds / DT; i++) w = advance(w, DT).world
  return w
}
const doors = (w: World<undefined>) => aircraftById(w, 'raid-1')!.state.bayDoorFraction

describe('the AI opens its bay doors near its destination (C2 stub)', () => {
  it('far out the doors stay shut; inside the range, with the destination ahead, they open fully', () => {
    const far = build(-4 * BAY_DOORS_OPEN_RANGE_M)
    expect(doors(run(far, 5))).toBe(0)
    const near = build(-(BAY_DOORS_OPEN_RANGE_M - 1500))
    const z0 = aircraftById(near, 'raid-1')!.state.position.z
    const w = run(near, b29.bayDoors!.travelSeconds + 1)
    // Heading 0 flies -z: the destination is ahead and inside the range the whole time.
    expect(aircraftById(w, 'raid-1')!.state.position.z).toBeLessThan(z0)
    expect(doors(w)).toBe(1)
  })
})
