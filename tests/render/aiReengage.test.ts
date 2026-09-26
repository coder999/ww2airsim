import { describe, expect, it } from 'vitest'
import { loadScenarioBundle } from '../../tools/content/load.js'
import { loadFixtureScenarioBundle } from '../fixtures/scenarios.js'
import { CURSORS_4, flyFrames, passive, rangeBetween, replicaWorld } from '../../tools/ai/replica.js'
import type { ScenarioBundle } from '../../src/sim/scenario.js'

/**
 * The gunnery handoff's open item 1, and the track ledger's required 7c
 * acceptance test: after the head-on merge, the pursuer must come back and
 * fight. At HEAD (2026-09-25), with a passive player, both skills sat in
 * `extend` for good: 4.4 km away at 120 s and 0 rounds fired (clean loadout;
 * 3.5-3.7 km with `both`). Mark, 2026-09-25: no stopgap, 7c fixes it.
 *
 * Measured 2026-09-26 with the committed implementation (7c Task 6: R8 full-
 * power rejoin + full-power pursuit beyond gun range), first post-merge
 * shot, seconds from spawn, clean / both, 4 cursors each:
 *   pursuit-range (green)      88.9-110.0 / 68.8-83.9
 *   pursuit-range-veteran      90.0-111.7 / 70.2-72.9
 *   zero-merge (AI Zero)      104.9-118.9 / 75.8-90.9
 * Every run went on to kill the passive player, all within the 150 s budget
 * (worst case 118.9 s, zero-merge clean).
 *
 * Re-measured 2026-09-26 after 7c Task 11 (the veteran's Immelmann): every
 * row above is unchanged, to 0.1 s. The veteran flew 0 Immelmann ticks in
 * all 8 pursuit-range-veteran runs: its only otherwise-qualifying rejoin
 * rescores are in Extend's dive, at -42.0° to -13.1°, below
 * IMMELMANN_MIN_PATH_RAD (-5°). Without that term every veteran run flew
 * one, fired first at 133.4-138.1 / 122.4-130.0 s, and clean cursor 23757
 * never fired within the budget.
 */
const REENGAGE_BUDGET_S = 150
const PURSUER = 'pursuer-1'
const MERGE_WINDOW_S = 15

const CASES: readonly (readonly [string, ScenarioBundle])[] = [
  ['pursuit-range', loadScenarioBundle('pursuit-range')],
  ['pursuit-range-veteran', loadScenarioBundle('pursuit-range-veteran')],
  ['zero-merge', loadFixtureScenarioBundle('zero-merge')],
]

describe('after a missed head-on pass, the pursuer re-engages and fires again', () => {
  for (const [name, bundle] of CASES) {
    it.each(['clean', 'both'] as const)(`${name}, %s: fires after the merge and hits the player, inside ${REENGAGE_BUDGET_S} s`, (loadout) => {
      for (const cursor of CURSORS_4) {
        const m = { closest: Infinity, shotsAtMerge: 0, firstShotS: null as number | null, hitS: null as number | null, structureAtShot: 0 }
        flyFrames(replicaWorld(bundle, loadout, cursor), passive, REENGAGE_BUDGET_S, (f, i) => {
          const rec = f.world.combat.aircraft[PURSUER]!
          if (i <= MERGE_WINDOW_S * 60) {
            m.closest = Math.min(m.closest, rangeBetween(f, f.world.player, PURSUER))
            m.shotsAtMerge = rec.shots
            return false
          }
          if (m.firstShotS === null && rec.shots > m.shotsAtMerge) {
            m.firstShotS = f.world.tick / 60
            m.structureAtShot = rec.damage.structure
          }
          if (m.firstShotS !== null && f.world.combat.aircraft[f.world.player]!.damage.structure < 1) {
            m.hitS = f.world.tick / 60
            return true
          }
          return false
        })
        const label = `${name} ${loadout} cursor ${cursor} (merge ${m.closest.toFixed(0)} m)`
        expect(m.closest, `${label}: there was no merge to miss`).toBeLessThan(200)
        expect(m.firstShotS, `${label}: never fired again`).not.toBeNull()
        expect(m.structureAtShot, `${label}: came back damaged`).toBe(1)
        expect(m.hitS, `${label}: fired but never hit`).not.toBeNull()
      }
    })
  }
})
