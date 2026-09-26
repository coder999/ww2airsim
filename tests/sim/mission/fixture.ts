import { createTerrainField, type TerrainField } from '../../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../../src/sim/world/schema.js'
import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { bundleForScenario } from '../../../tools/content/load.js'
import { advance, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import type { ObjectiveState } from '../../../src/sim/mission/state.js'

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
