import { createTerrainField, type TerrainField } from '../../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../../src/sim/world/schema.js'
import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { bundleForScenario } from '../../../tools/content/load.js'
import { advance, withAircraftState, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import type { ObjectiveState } from '../../../src/sim/mission/state.js'
import { createState } from '../../../src/sim/flight/state.js'
import { v3, type Vec3 } from '../../../src/sim/math/vec3.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'

/**
 * One small mission world, inline so a test can read it on one screen. Not
 * shipped content (content/scenarios/ gets its missions in M3).
 *
 * - the player flies east from the origin at 3,000 m
 * - `bandit-1` (tag `raid`) flies east 20 km north of it, so the two never meet
 * - an Essex (`cv-1`) and two marus (tag `convoy`) lie at anchor
 * - Tacloban and Dulag are both loaded, so structure ids resolve
 * - no pilots: the controls are authoritative, so no AI moves anything
 *   unasked
 */
export const BASE = {
  id: 'mission-fixture',
  player: 'f6f-1',
  airfields: ['tacloban', 'dulag'],
  aircraft: [
    { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 } },
    { id: 'bandit-1', spec: 'f6f-hellcat', tags: ['raid'], airborneAt: { position: [0, 3000, -20000], headingDeg: 90, speedMps: 120 } },
  ],
  ships: [
    { id: 'cv-1', spec: 'essex-cv', waypoints: [[-25629, -16479]], speedMps: 0 },
    { id: 'maru-1', spec: 'type-b-maru', tags: ['convoy'], waypoints: [[-25000, -10000]], speedMps: 0 },
    { id: 'maru-2', spec: 'type-b-maru', tags: ['convoy'], waypoints: [[-25000, -9000]], speedMps: 0 },
  ],
  weather: { windFromDeg: 0, windMps: 0 },
}

/** `BASE` with top-level keys replaced. Returns raw JSON for `parseScenario`. */
export const scenario = (patch: Record<string, unknown>): Record<string, unknown> => ({ ...BASE, ...patch })

/** An objective the player never completes (a station 90 km away). For
 *  tests that need a mission to exist without anything happening in it. */
export const REACH_FAR = { id: 'far', label: 'Far', priority: 'primary', kind: 'reach', point: { x: 90000, z: 90000 }, radiusM: 100 }

/** A terrain field flat at `heightM` over the whole 200 km box: 0 is sea,
 *  100 is land. The same construction as tests/render/landing.test.ts. */
export function flatField(heightM: number): TerrainField {
  return createTerrainField(
    parseTerrainHeader({ centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000, finestSamples: 8193, levels: 13, encoding: 'int16-decimetres' }),
    12,
    new Int16Array(9).fill(heightM * 10),
  )
}

/** The world `worldFromScenario` builds for `BASE` + `patch`. */
export function missionWorld(patch: Record<string, unknown>, terrain: TerrainField | null = null): World<undefined> {
  return worldFromScenario(bundleForScenario(parseScenario(scenario(patch))), terrain)
}

/** `n` production ticks, one `advance(world, DT)` each. */
export function steps<M>(world: World<M>, n: number): World<M> {
  let w = world
  for (let i = 0; i < n; i++) w = advance(w, DT).world
  return w
}

export function progressOf<M>(world: World<M>, id: string): ObjectiveState {
  const m = world.mission!
  return m.progress[m.objectives.findIndex((o) => o.id === id)]!
}

/** As tests/sim/loop.test.ts: `advance` must not write into what it is handed. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value) && !ArrayBuffer.isView(value)) {
    Object.freeze(value)
    for (const key of Object.getOwnPropertyNames(value)) deepFreeze((value as Record<string, unknown>)[key])
  }
  return value
}

/** Nose north (-z): a yaw of pi/2 about +y, as `worldFromScenario` does. */
export const NORTH = qFromAxisAngle(v3(0, 1, 0), Math.PI / 2)

/** Replaces the player's state (and `previous`): flying north at `speed`,
 *  sinking at `sink`, gear and flaps at `gear` (1 down, 0 up). */
export function putPlayer<M>(w: World<M>, position: Vec3, speed: number, sink: number, gear = 0): World<M> {
  return withAircraftState(w, w.player, createState({
    position, velocity: v3(0, -sink, -speed), attitude: NORTH, gearFraction: gear, flapFraction: gear, tick: w.tick,
  }))
}

/** Places aircraft `id` at `position`, level, flying north at 120 m/s. */
export function moveAircraft<M>(w: World<M>, id: string, position: Vec3): World<M> {
  return withAircraftState(w, id, createState({ position, velocity: v3(0, 0, -120), attitude: NORTH, tick: w.tick }))
}

export function destroyShip<M>(w: World<M>, id: string): World<M> {
  const rec = w.combat.ships[id]!
  return { ...w, combat: { ...w.combat, ships: { ...w.combat.ships, [id]: { ...rec, hp: 0, destroyedTick: w.tick, attacker: 'f6f-1' } } } }
}

export function destroyStructure<M>(w: World<M>, id: string): World<M> {
  const rec = w.combat.structures[id]!
  return { ...w, combat: { ...w.combat, structures: { ...w.combat.structures, [id]: { ...rec, hp: 0, destroyedTick: w.tick, attacker: 'f6f-1' } } } }
}

export function destroyAircraft<M>(w: World<M>, id: string): World<M> {
  const rec = w.combat.aircraft[id]!
  return { ...w, combat: { ...w.combat, aircraft: { ...w.combat.aircraft, [id]: { ...rec, damage: { ...rec.damage, destroyedAt: w.tick, attacker: 'f6f-1' } } } } }
}

/**
 * One landing at (x, z) on ground `groundY`, stepped through production
 * `advance` the way tests/render/landing.test.ts steps it through the frame
 * (measured 2026-09-25: a touchdown after 7 ticks on land and on the Essex):
 * latch airborne 50 m up; settle from 0.4 m (wheels) at 30 m/s and 1 m/s
 * sink; then come to rest. Returns the world one tick after the rest, when
 * the mission has recorded the landing.
 */
export function landOnce<M>(w: World<M>, x: number, groundY: number, z: number): World<M> {
  const gearM = w.aircraft.find((a) => a.id === w.player)!.spec.gear.heightM
  let world = steps(putPlayer(w, v3(x, groundY + gearM + 50, z), 45, 0, 1), 1)
  world = putPlayer(world, v3(x, groundY + gearM + 0.4, z), 30, 1, 1)
  for (let i = 0; i < 120 && world.mission!.recovery.touchdown === null; i++) world = steps(world, 1)
  if (world.mission!.recovery.touchdown === null) throw new Error('landOnce: no touchdown within 120 ticks')
  return steps(putPlayer(world, v3(x, groundY + gearM, z), 0, 0, 1), 1)
}
