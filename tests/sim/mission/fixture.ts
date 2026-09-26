import { createTerrainField, type TerrainField } from '../../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../../src/sim/world/schema.js'

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
