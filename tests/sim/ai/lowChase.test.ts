import { describe, expect, it } from 'vitest'
import { GREEN_SKILL, VETERAN_SKILL, type PilotSkill } from '../../../src/sim/ai/pilot.js'
import { PURSUIT_FLOOR_M, heightAboveGround } from '../../../src/sim/ai/safety.js'
import type { AircraftSpec } from '../../../src/sim/flight/schema.js'
import { createWorldOf } from '../../../src/sim/loop.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import { createTerrainField, heightAt, type TerrainField } from '../../../src/sim/world/terrain.js'
import { parseTerrainHeader } from '../../../src/sim/world/schema.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { holdHeight, level, pilotFor, runCanned } from './maneuverWorlds.js'

/**
 * 7c Task 15: Mark's decision of 2026-09-26, "ai chases you unless under 50
 * *feet*". While the intent is Pursue, the §3.2 floor follows the target
 * down to PURSUIT_FLOOR_M (15.24 m) above the ground under the AI. The final
 * review measured 0 shots in 90 s against a target at 150 m or 400 m.
 *
 * The world is the final review's (`.superpowers/7c/finalreview-low.ts`): the
 * AI 1.5 km behind and 1,200 m above the ground at 130 m/s, the target at
 * 110 m/s. The target here holds its height (`holdHeight`); the review's
 * hands-off `level()` target sank from 150 m to -52 m in 90 s.
 */
const f6f = loadAircraftSpec('f6f-hellcat')
const zero = loadAircraftSpec('a6m2-zero')
const CURSORS = [0, 7919, 15838, 23757] as const
const AIRFRAMES = [['F6F', f6f], ['Zero', zero]] as const
const SKILLS = [['green', GREEN_SKILL], ['veteran', VETERAN_SKILL]] as const
const CHASE_S = 90
/** How far below PURSUIT_FLOOR_M the AI may dip while the recovery takes
 *  hold. Measured 2026-09-26 over every world below (104 runs): the lowest
 *  point of any run was 17.10 m, so none was needed. */
const OVERSHOOT_M = 0

type Run = {
  shots: number; hits: number; minAglM: number; impacted: boolean
  /** The lowest height above the ground while over land (ground above 5 m). */
  minAglOverLandM: number
}
type ChaseSetup = {
  readonly terrain?: TerrainField | null
  /** The AI's starting height above the ground; the target's starting x. */
  readonly aiHeightM?: number
  readonly targetX?: number
  /** How far ahead the scripted target reads the ground (`holdHeight`). */
  readonly lookaheadS?: number
}

function lowChase(spec: AircraftSpec, skill: PilotSkill, cursor: number, targetHeightM: number, setup: ChaseSetup = {}): Run {
  const { terrain = null, aiHeightM = 1200, targetX = 1500, lookaheadS = 6 } = setup
  const groundAt = (x: number): number => terrain === null ? 0 : heightAt(terrain, x, 0)
  const pilot = pilotFor('t', skill)
  const world = createWorldOf({
    aircraft: [
      level('p', spec, v3(0, aiHeightM + groundAt(0), 0), v3(130, 0, 0),
        { ...pilot, decision: { ...pilot.decision, noiseCursor: cursor } }),
      level('t', f6f, v3(targetX, targetHeightM + groundAt(targetX), 0), v3(110, 0, 0)),
    ],
    player: 't', terrain,
  })
  let minAglM = Infinity
  let minAglOverLandM = Infinity
  const w = runCanned(world, { t: holdHeight(targetHeightM, terrain, lookaheadS) }, CHASE_S, (w) => {
    const p = w.aircraft.find((a) => a.id === 'p')!
    if (p.impact !== null) return
    const h = heightAboveGround(p.state, terrain, [])
    minAglM = Math.min(minAglM, h)
    if (groundAt(p.state.position.x) > 5) minAglOverLandM = Math.min(minAglOverLandM, h)
  })
  const p = w.aircraft.find((a) => a.id === 'p')!
  const rec = w.combat.aircraft['p']!
  return { shots: rec.shots, hits: rec.hits, minAglM, minAglOverLandM, impacted: p.impact !== null || minAglM <= 0 }
}

/** Every run's crash, over every world in this file: must be 0. */
const crashes: string[] = []

// Measured 2026-09-26 (`.superpowers/7c/t15r2-measure.ts`), 4 cursors each,
// hits / lowest height above the sea (the F6F's 12 hits is the kill):
// - 150 m: F6F 12 in every run, 140.5-146.0 m; Zero 11-30, 142.0-147.1 m.
// - 60 m: F6F 12 in every run, 48.5-71.5 m; Zero 9-30, 51.3-56.2 m.
// - 20 m: green F6F 0-12, veteran F6F 0 in all 4 (it holds about 25 m and
//   fires over the target; the cost of the acceleration term in
//   `needsFloorRecovery`), both at 24.2-26.7 m; Zero 4-28, 17.1-24.1 m.
describe('the low chase over the sea (7c Task 15)', () => {
  for (const [plane, spec] of AIRFRAMES) {
    for (const [skillName, skill] of SKILLS) {
      it.each([150, 60, 20])(`${skillName} ${plane} chasing a target at %i m: fires, never below 50 ft, never into the sea`, (h) => {
        for (const cursor of CURSORS) {
          const r = lowChase(spec, skill, cursor, h)
          const label = `${skillName} ${plane} ${h} m cursor ${cursor}: ${JSON.stringify(r)}`
          if (r.impacted) crashes.push(label)
          expect(r.shots, label).toBeGreaterThan(0)
          expect(r.minAglM, label).toBeGreaterThanOrEqual(PURSUIT_FLOOR_M - OVERSHOOT_M)
          expect(r.impacted, label).toBe(false)
        }
      })
    }
  }
})

// Measured 2026-09-26, target at 10 m, 4 cursors each: every run fires from
// above and holds 21.4-23.9 m; the F6F hits in none, the Zero in 7 of 8.
describe('a target below 50 ft is not chased lower (7c Task 15)', () => {
  for (const [plane, spec] of AIRFRAMES) {
    for (const [skillName, skill] of SKILLS) {
      it(`${skillName} ${plane} against a target at 10 m holds at its floor and does not crash`, () => {
        for (const cursor of CURSORS) {
          const r = lowChase(spec, skill, cursor, 10)
          const label = `${skillName} ${plane} 10 m cursor ${cursor}: ${JSON.stringify(r)}`
          if (r.impacted) crashes.push(label)
          expect(r.minAglM, label).toBeGreaterThanOrEqual(PURSUIT_FLOOR_M - OVERSHOOT_M)
          expect(r.impacted, label).toBe(false)
        }
      })
    }
  }
})

/** Synthetic terrain varying along x only, built like `safety.test.ts`'s
 *  plateau on a level of the shipped header's pyramid (level 4: 513 samples,
 *  390.6 m apart; level 3: 1,025 samples, 195.3 m apart). */
function terrainOf(level: 3 | 4, profile: (x: number) => number): TerrainField {
  const header = parseTerrainHeader({
    centreLatDeg: 10.8, centreLonDeg: 125.3, halfExtentM: 100000,
    finestSamples: 8193, levels: 13, encoding: 'int16-decimetres',
  })
  const n = level === 3 ? 1025 : 513
  const step = 200000 / (n - 1)
  const heights = new Int16Array(n * n)
  for (let c = 0; c < n; c++) {
    const h = Math.round(10 * profile(-100000 + c * step))
    for (let r = 0; r < n; r++) heights[r * n + c] = h
  }
  return createTerrainField(header, level, heights)
}

describe('the low chase over rising ground (7c Task 15, synthetic 8% ramp)', () => {
  // Sea to x = 5 km, then an 8% slope (80 m per km) to a 900 m plateau.
  // Measured 2026-09-26, 4 cursors: lowest 61.8-82.4 m, no impact.
  const ramp = terrainOf(4, (x) => Math.min(900, Math.max(0, (x - 5000) * 0.08)))
  for (const [plane, spec] of AIRFRAMES) {
    for (const [skillName, skill] of SKILLS) {
      it(`${skillName} ${plane} chasing a target 60 m above a rising slope does not fly into it`, () => {
        for (const cursor of CURSORS) {
          const r = lowChase(spec, skill, cursor, 60, { terrain: ramp })
          const label = `${skillName} ${plane} ramp cursor ${cursor}: ${JSON.stringify(r)}`
          if (r.impacted) crashes.push(label)
          expect(r.minAglM, label).toBeGreaterThanOrEqual(PURSUIT_FLOOR_M - OVERSHOOT_M)
          expect(r.impacted, label).toBe(false)
        }
      })
    }
  }
})

/**
 * Steep ground (controller's ruling, 2026-09-26: Leyte is hilly). A 30% ramp
 * (sea, then 300 m per km to a 450 m plateau) and a 300 m ridge with 30%
 * flanks. Both aircraft start 60 m over the sea. The target reads the ground
 * 24 s ahead, because a Hellcat at 110 m/s cannot climb 30% (33 m/s) and
 * would otherwise fly into it; flown alone it still dips to 7.8 m on the
 * ramp and 43.4 m on the ridge. Veteran F6F and veteran Zero, 4 cursors each,
 * measured 2026-09-26 (lowest height above the ground over land):
 * - ramp, target 1.5 km ahead, ramp foot 3.5 km: F6F 22.3-23.3 m (it fires
 *   636-684 rounds, 0-4 hits); Zero 170.9-180.0 m (it falls behind the
 *   climbing target and does not fire).
 * - ramp, target 600 m ahead, ramp foot 4.5 km: F6F 65.9-79.7 m, Zero
 *   71.3-72.3 m; both fire (1,038 / 414 rounds).
 * - ridge, target 600 m ahead, crest at 5.5 km: F6F 94.1-104.5 m, Zero
 *   117.7-118.9 m; both fire.
 * No terrain impact in any of the 24 runs.
 */
describe('the low chase over steep ground (7c Task 15, synthetic 30% ramp and 300 m ridge)', () => {
  const worlds = [
    ['a 30% ramp, target 1.5 km ahead', terrainOf(3, (x) => Math.min(450, Math.max(0, (x - 3500) * 0.3))), 1500],
    ['a 30% ramp, target 600 m ahead', terrainOf(3, (x) => Math.min(450, Math.max(0, (x - 4500) * 0.3))), 600],
    ['a 300 m ridge, target 600 m ahead', terrainOf(3, (x) => Math.max(0, 300 - Math.abs(x - 5500) * 0.3)), 600],
  ] as const
  for (const [world, terrain, targetX] of worlds) {
    for (const [plane, spec] of AIRFRAMES) {
      it(`veteran ${plane}, ${world}: no terrain impact, never below 50 ft, and it did cross the high ground`, () => {
        for (const cursor of CURSORS) {
          const r = lowChase(spec, VETERAN_SKILL, cursor, 60, { terrain, aiHeightM: 60, targetX, lookaheadS: 24 })
          const label = `veteran ${plane} ${world} cursor ${cursor}: ${JSON.stringify(r)}`
          if (r.impacted) crashes.push(label)
          expect(r.impacted, label).toBe(false)
          expect(r.minAglM, label).toBeGreaterThanOrEqual(PURSUIT_FLOOR_M - OVERSHOOT_M)
          expect(Number.isFinite(r.minAglOverLandM), `${label}: never over the high ground, so this proved nothing`).toBe(true)
        }
      })
    }
  }
})

describe('the crash count over every low-chase world and cursor (7c Task 15)', () => {
  it('is 0', () => {
    expect(crashes).toEqual([])
  })
})
