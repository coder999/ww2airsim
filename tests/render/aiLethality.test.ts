import { describe, expect, it } from 'vitest'
import { loadFixtureScenarioBundle } from '../fixtures/scenarios.js'
import {
  CURSORS_4, EVASION, LOADOUTS, aircraftOf, diagOf, flyFrames, gunsSafe, passive, passiveClose, playerDestroyed, rangeBetween, replicaWorld,
} from '../../tools/ai/replica.js'
import { GREEN_SKILL } from '../../src/sim/ai/pilot.js'
import { MIN_ENGAGEMENT_RANGE_M } from '../../src/sim/ai/decision.js'
import { isBehind } from '../e2e/pursuitGeometry.js'

/**
 * 7c spec §3.1: the lethality instrument, and the regression gate for every
 * later maneuver change. Reads the frozen tail-chase fixture (ruling R1): the
 * shipped `pursuit-range` became a green head-on merge on 2026-09-25.
 */
const tailChase = loadFixtureScenarioBundle('pursuit-tail-chase')
const PURSUER = 'pursuer-1'

describe('a passive player is shot down before point-blank range (7c spec §3.1, item 1; E1)', () => {
  // Until E1 this asserted the opposite: the veteran, toned down to
  // controlNoise 0.01 because its aim ignored drop (Mark's ruling 2026-09-25),
  // reached point-blank in 16 of 16 runs with 1 hit among them. With E1's
  // honest gunnery the veteran killed in 2.6-3.4 s; Mark's retune the same day
  // ("tone veterans down", median about 8 s) set VETERAN_SKILL.aimErrorRad.
  // Measured 2026-10-09, kill tick at cursors 0 / 7919 / 15838 / 23757, the
  // same in every loadout to 2 ticks:
  //   veteran: 834 / 485 / 413 / 436 (6.9-13.9 s, median 8.1 s), 12 hits each.
  //   green:   8 of 16 killed (6.2-19.4 s); the other 8 reached point-blank
  //            with 0-5 hits.
  it('the veteran kills in every run, at a median near 8 s, and green kills fewer', () => {
    const ticks: number[] = []
    let greenKills = 0
    for (const loadout of LOADOUTS) {
      for (const cursor of CURSORS_4) {
        const veteran = passiveClose(replicaWorld(tailChase, loadout, cursor), PURSUER)
        expect(veteran.outcome, `${loadout}, cursor ${cursor}: veteran, tick ${veteran.tick}, ${veteran.pursuerHits} hits`).toBe('killed')
        ticks.push(veteran.tick)
        if (passiveClose(replicaWorld(tailChase, loadout, cursor, GREEN_SKILL), PURSUER).outcome === 'killed') greenKills++
      }
    }
    const median = [...ticks].sort((a, b) => a - b)[ticks.length / 2]! / 60
    expect(median).toBeGreaterThanOrEqual(6)
    expect(median).toBeLessThanOrEqual(12)
    expect(greenKills).toBeLessThan(ticks.length)
  })
})

describe('the point-blank break-off, replicating ai-maneuver.spec.ts on the fixture (item 2)', () => {
  // E1: with the pursuer's guns safe (`gunsSafe`), so it tests the break-off
  // and not lethality, as the 7c spec's Decisions item 2 asked: an honest
  // veteran kills the passive player first (item 1).
  // Spec §3.1, measured with the retune: crossings at ticks 1147-1202,
  // closest 78.0-84.3 m, range reopening 2.6-2.8 s after the crossing.
  it.each(LOADOUTS)('%s: closes under 120 m within 30 s alive, stays above 50 m, and opens within 6 s', (loadout) => {
    const m = { crossing: null as number | null, crossingRange: 0, closest: Infinity, reopened: null as number | null }
    flyFrames(gunsSafe(replicaWorld(tailChase, loadout, 0), PURSUER), passive, 36, (f, i) => {
      if (playerDestroyed(f)) throw new Error(`${loadout}: player destroyed at tick ${f.world.tick}`)
      const r = rangeBetween(f, f.world.player, PURSUER)
      if (m.crossing === null) {
        if (r < MIN_ENGAGEMENT_RANGE_M) { m.crossing = i; m.crossingRange = r; m.closest = r }
        return false
      }
      m.closest = Math.min(m.closest, r)
      if (m.reopened === null && r > m.crossingRange) m.reopened = i
      return i - m.crossing >= 6 * 60
    })
    expect(m.crossing, `${loadout} never closed`).not.toBeNull()
    expect(m.crossing!).toBeLessThanOrEqual(30 * 60)
    expect(m.closest).toBeGreaterThan(50)
    expect(m.reopened, `${loadout} never reopened`).not.toBeNull()
    expect(m.reopened! - m.crossing!).toBeLessThanOrEqual(6 * 60)
  })
})

describe('the 7d bar: a scripted evasion gets behind a green pursuer (item 3)', () => {
  // Measured 2026-09-25 at HEAD and with the prototype envelope: behind at
  // 18-19 s in all four loadouts, pursuer structure 1.000 at that moment.
  // Stronger than the E2E original, which cannot tell a live pursuer
  // from a wreck frozen in the air.
  //
  // All four noise cursors since 7c Task 14 (2026-09-26). Until then this ran
  // cursor 0 only, and missed that green's lag pursuit (7c Task 8) had already
  // broken the bar: at cursors 7919 and 23757 green selected lag at 6.0 s and
  // the evasion was never behind it in 40 s (final review, 2026-09-26). Mark
  // then removed lag from green ("green pilots should be beaten easily").
  // Re-measured 2026-09-26 with that change (.superpowers/7c/t14bar.ts),
  // behind at, in seconds, cursors 0 / 7919 / 15838 / 23757:
  //   clean 18 / 18 / 18 / 18      bombs 19 / 19 / 19 / 19
  //   rockets 19 / 19 / 18 / 19    both 19 / 20 / 19 / 20
  // Pursuer structure 1.000 at that moment in all 16 runs.
  // The 40 s budget leaves 20 s of headroom over the worst (20 s).
  it.each(LOADOUTS)('%s: behind within 40 s at every noise cursor, the player alive and the pursuer alive', (loadout) => {
    for (const cursor of CURSORS_4) {
      const m = { behindS: null as number | null, structure: 0, destroyed: true }
      flyFrames(replicaWorld(tailChase, loadout, cursor, GREEN_SKILL), EVASION, 40, (f, i) => {
        if (playerDestroyed(f)) throw new Error(`${loadout}, cursor ${cursor}: player destroyed at tick ${f.world.tick}`)
        if (i < 7 * 60 || i % 60 !== 0) return false
        if (!isBehind(diagOf(aircraftOf(f, f.world.player)), diagOf(aircraftOf(f, PURSUER)), 400, 45)) return false
        const rec = f.world.combat.aircraft[PURSUER]!
        m.behindS = i / 60
        m.structure = rec.damage.structure
        m.destroyed = rec.damage.destroyedAt !== null
        return true
      })
      expect(m.behindS, `${loadout}, cursor ${cursor}: never behind`).not.toBeNull()
      expect(m.destroyed, `${loadout}, cursor ${cursor}: pursuer destroyed`).toBe(false)
      expect(m.structure, `${loadout}, cursor ${cursor}: pursuer structure`).toBeGreaterThan(0)
    }
  })
})
