import { describe, expect, it } from 'vitest'
import { loadAircraftSpec } from '../../tools/content/load.js'
import {
  advance,
  createWorld,
  playerAircraft,
  requestBailout,
  type World,
} from '../../src/sim/loop.js'
import { createState } from '../../src/sim/flight/state.js'
import { DT } from '../../src/sim/flight/model.js'
import { v3 } from '../../src/sim/math/vec3.js'
import { createTerrainField, type TerrainField } from '../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../src/sim/world/schema.js'
import {
  assessRecovery,
  resolveRecovery,
  type RecoveryFacts,
} from '../../src/sim/bailout.js'

const f6f = loadAircraftSpec('f6f-hellcat')
const controls = { pitch: 0, roll: 0, yaw: 0, throttle: 1 }
const header = parseTerrainHeader({
  centreLatDeg: 10.8,
  centreLonDeg: 125.3,
  halfExtentM: 1000,
  finestSamples: 3,
  levels: 1,
  encoding: 'int16-decimetres',
})
const flat = (heightM: number): TerrainField => createTerrainField(header, 0, new Int16Array(9).fill(heightM * 10))

const worldAt = (altitudeM: number, terrain = flat(10), wind = v3(0, 0, 0)): World<undefined> => ({
  ...createWorld(f6f, createState({ position: v3(0, altitudeM, 0), velocity: v3(45, 0, 0) }), controls),
  terrain,
  wind,
})

/** A jump with a fixed recorded seed (the sim never derives one). */
const jump = (world: World<undefined>) => requestBailout(world, world.player, undefined, 1)

const flyTicks = (world: World<undefined>, count: number): World<undefined> => {
  let current = world
  for (let tick = 0; tick < count; tick++) current = advance(current, DT).world
  return current
}

const contested = (seed: number): RecoveryFacts => ({
  seed,
  surface: 'land',
  control: 'contested',
  friendlySupportM: 25_000,
  enemySupportM: 25_000,
  friendlyRescuePresent: false,
  enemyPresence: false,
  daylight: 0.5,
  visibility: 0.5,
  weather: 0,
  seaState: 0,
})

describe('bailout simulation', () => {
  it('rejects a ground departure, an impossible exit, and a second bailout', () => {
    const parked = { ...worldAt(12), aircraft: [{ ...playerAircraft(worldAt(12)), parked: true }] }
    expect(jump(parked)).toMatchObject({ ok: false, reason: 'not-airborne' })
    expect(jump(worldAt(20))).toMatchObject({ ok: false, reason: 'too-low' })

    const first = jump(worldAt(200))
    expect(first.ok).toBe(true)
    if (!first.ok) return
    expect(jump(first.world)).toMatchObject({ ok: false, reason: 'already-bailed' })
  })

  it('separates the pilot, opens the canopy, drifts with wind, and leaves the airframe running uncontrolled', () => {
    const requested = jump(worldAt(410, flat(10), v3(12, 0, -4)))
    expect(requested.ok).toBe(true)
    if (!requested.ok) return
    const initialPilot = requested.parachutist.state.position
    const stepped = flyTicks(requested.world, 210)
    const pilot = stepped.parachutists![0]!
    expect(pilot.state.phase).toBe('canopy')
    expect(pilot.state.position.x).toBeGreaterThan(initialPilot.x + 20)
    expect(pilot.state.position.z).toBeLessThan(initialPilot.z)
    expect(pilot.state.velocity.y).toBeGreaterThan(-8)
    expect(playerAircraft(stepped).controls).toMatchObject({ pitch: 0, roll: 0, yaw: 0, throttle: 0 })
    expect(playerAircraft(stepped).state.position).not.toEqual(pilot.state.position)
  })

  it('kills a low-altitude bailout but permits a safely opened canopy to reach land', () => {
    const low = jump(worldAt(65))
    expect(low.ok).toBe(true)
    if (!low.ok) return
    const lowFinished = flyTicks(low.world, 600).parachutists![0]!
    expect(lowFinished.state.phase).toBe('dead')
    expect(lowFinished.state.outcome).toBe('killed')

    const high = jump(worldAt(210))
    expect(high.ok).toBe(true)
    if (!high.ok) return
    const highFinished = flyTicks(high.world, 2_400)
    const survivor = highFinished.parachutists![0]!
    expect(survivor.state.phase).toBe('down')
    expect(survivor.state.contact?.surface).toBe('land')
    expect(['rescued', 'captured']).toContain(survivor.state.outcome)
    expect(survivor.recovery?.facts.seed).toBe(survivor.recoverySeed)
    expect(survivor.recovery?.roll).toBeTypeOf('number') // nothing here is near a base or ship, so the area is contested and the die is rolled
    expect(survivor.recoverySeed).toBe(1)
  })

  it('records water contact as water rather than silently treating it as land', () => {
    const request = jump(worldAt(160, flat(0)))
    expect(request.ok).toBe(true)
    if (!request.ok) return
    const final = flyTicks(request.world, 2_400).parachutists![0]!
    expect(final.state.phase).toBe('down')
    expect(final.state.contact?.surface).toBe('water')
    expect(['rescued', 'captured']).toContain(final.state.outcome)
  })
})

describe('recovery resolver', () => {
  it('makes friendly rescue and unsupported enemy control deterministic extremes', () => {
    const friendly: RecoveryFacts = {
      ...contested(1),
      control: 'friendly',
      surface: 'water',
      friendlyRescuePresent: true,
    }
    expect(resolveRecovery(friendly)).toMatchObject({ outcome: 'rescued', roll: null })
    expect(assessRecovery(friendly).cue).toBe('rescue-likely')

    const enemy: RecoveryFacts = { ...contested(1), control: 'enemy', enemyPresence: true }
    expect(resolveRecovery(enemy)).toMatchObject({ outcome: 'captured', roll: null })
    expect(assessRecovery(enemy).cue).toBe('capture-likely')

    const unsupportedWater: RecoveryFacts = { ...contested(2), surface: 'water' }
    expect(resolveRecovery(unsupportedWater)).toMatchObject({ outcome: 'captured', roll: null })
    expect(assessRecovery(unsupportedWater).factors).toContain('no friendly rescue coverage')
  })

  it('repeats a contested result from the same seed and varies across seeds', () => {
    expect(resolveRecovery(contested(1944))).toEqual(resolveRecovery(contested(1944)))
    const outcomes = new Set(Array.from({ length: 32 }, (_, seed) => resolveRecovery(contested(seed)).outcome))
    expect(outcomes).toEqual(new Set(['rescued', 'captured']))
  })
})
