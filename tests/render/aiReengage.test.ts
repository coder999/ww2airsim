import { describe, expect, it } from 'vitest'
import { loadScenarioBundle } from '../../tools/content/load.js'
import { loadFixtureScenarioBundle } from '../fixtures/scenarios.js'
import { CURSORS_4, flyFrames, passive, rangeBetween, replicaWorld } from '../../tools/ai/replica.js'
import type { ScenarioBundle } from '../../src/sim/scenario.js'
import { VETERAN_SKILL, type PilotSkill } from '../../src/sim/ai/pilot.js'

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
 * What is asserted, per run: a merge under 200 m, a shot after the merge
 * window, the pursuer undamaged when it fires, and a hit on the player (its
 * structure below 1) within the 150 s budget. A kill is not asserted. First
 * hit, measured 2026-09-26 (7c Task 14), clean / both:
 *   pursuit-range (green)      92.7-112.1 / 69.5-89.3
 *   pursuit-range-veteran      95.6-118.8 / 81.7-83.1
 *   zero-merge (AI Zero)      106.9-125.2 / 86.7-100.3
 *
 * 7c Task 14 (Mark, 2026-09-26): green lost lag pursuit, and the Zero's
 * content excludes the Immelmann. Every first-shot figure above is unchanged
 * by either, to 0.1 s (.superpowers/7c/t14re.ts): none of these runs flew a
 * lag-pursuit or Immelmann tick before. The first-hit figures were first
 * measured after Task 14; no earlier first-hit baseline was recorded.
 *
 * The last row, zero-merge flown as a veteran, is the one the Zero's
 * exclusion fixes. With the Immelmann (final review, 2026-09-26) the clean
 * loadout flew it at every cursor and 0 of 4 runs fired again inside 150 s.
 * Measured 2026-09-26 with the exclusion (.superpowers/7c/t14vetzero.ts), 0
 * Immelmann ticks, first post-merge shot, cursors 0 / 7919 / 15838 / 23757:
 *   clean 102.9 / 113.5 / 113.7 / 108.7 s, then 0 of 4 hit inside 150 s
 *   both  105.3 / 104.8 / 103.5 / 89.7 s, then 4 of 4 hit (101.8-117.9 s)
 * So that row asserts the shot, not the hit: the veteran Zero's clean runs
 * come back and fire but do not connect. That is not the Immelmann (the final
 * review measured the same 0 of 4 with it merely removed from the
 * repertoire); it is an open item in the 7c handoff.
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

/** name, bundle, skill override (undefined: the scenario's own), and whether
 *  the hit is asserted. */
const CASES: readonly (readonly [string, ScenarioBundle, PilotSkill | undefined, boolean])[] = [
  ['pursuit-range', loadScenarioBundle('pursuit-range'), undefined, true],
  ['pursuit-range-veteran', loadScenarioBundle('pursuit-range-veteran'), undefined, true],
  ['zero-merge', loadFixtureScenarioBundle('zero-merge'), undefined, true],
  // Fires only: see the header. The hit is not what the Zero's content
  // exclusion restores.
  ['zero-merge flown as a veteran', loadFixtureScenarioBundle('zero-merge'), VETERAN_SKILL, false],
]

describe('after a missed head-on pass, the pursuer re-engages and fires again', () => {
  for (const [name, bundle, skill, assertHit] of CASES) {
    const title = assertHit ? `fires after the merge and hits the player, inside ${REENGAGE_BUDGET_S} s` : `fires after the merge, inside ${REENGAGE_BUDGET_S} s`
    it.each(['clean', 'both'] as const)(`${name}, %s: ${title}`, (loadout) => {
      for (const cursor of CURSORS_4) {
        const m = { closest: Infinity, shotsAtMerge: 0, firstShotS: null as number | null, hitS: null as number | null, structureAtShot: 0 }
        flyFrames(replicaWorld(bundle, loadout, cursor, skill), passive, REENGAGE_BUDGET_S, (f, i) => {
          const rec = f.world.combat.aircraft[PURSUER]!
          if (i <= MERGE_WINDOW_S * 60) {
            m.closest = Math.min(m.closest, rangeBetween(f, f.world.player, PURSUER))
            m.shotsAtMerge = rec.shots
            return false
          }
          if (m.firstShotS === null && rec.shots > m.shotsAtMerge) {
            m.firstShotS = f.world.tick / 60
            m.structureAtShot = rec.damage.structure
            if (!assertHit) return true
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
        if (assertHit) expect(m.hitS, `${label}: fired but never hit`).not.toBeNull()
      }
    })
  }
})
