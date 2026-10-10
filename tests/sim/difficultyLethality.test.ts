import { describe, expect, it } from 'vitest'
import { loadFixtureScenarioBundle } from '../fixtures/scenarios.js'
import { CURSORS_4, LOADOUTS, passiveClose, replicaWorld } from '../../tools/ai/replica.js'
import { applyDifficulty, type Difficulty } from '../../src/sim/difficulty.js'
import { sweep } from './weapons/aaHarness.js'

/**
 * M5 (Mark, 2026-10-10): Recruit clearly survivable for a new player, Ace clearly harder, neither
 * absurd, and Veteran today's game exactly (Veteran's own numbers are pinned where they always were:
 * tests/render/aiLethality.test.ts item 1 and tests/sim/weapons/aaLethality.test.ts).
 *
 * Measured 2026-10-10 on ryzen (`tools/ai/difficultySweep.ts 32`; the full table is in
 * docs/handoff/2026-10-10-m5-difficulty.md). Exact and repeatable, so the bands are tolerances for the
 * next retune to read: tighten them, never widen to whatever passes.
 *
 *   passive player v a veteran, tail chase, 16 runs:  Recruit 9 of 16 killed before point-blank
 *                                                     Veteran 16 of 16, median 15.3 s; Ace 16 of 16, median 7.4 s
 *   AA orbit at 300 ft over a Fletcher, 32 seeds:     Recruit median 45.2 s; Veteran 21.1 s; Ace 16.4 s
 *   AA fast straight pass, 32 seeds:                  Recruit 0 lost; Veteran 2; Ace 9
 */
const tailChase = loadFixtureScenarioBundle('pursuit-tail-chase')

function passive(d: Difficulty): { readonly kills: number; readonly medianS: number | null } {
  const times: number[] = []
  for (const loadout of LOADOUTS) {
    for (const cursor of CURSORS_4) {
      const r = passiveClose(applyDifficulty(replicaWorld(tailChase, loadout, cursor), d), 'pursuer-1')
      if (r.outcome === 'killed') times.push(r.tick / 60)
    }
  }
  times.sort((a, b) => a - b)
  return { kills: times.length, medianS: times.length === 0 ? null : times[Math.floor(times.length / 2)]! }
}

describe('Recruit: clearly survivable', () => {
  it('a veteran on the tail of a player who does nothing kills him before point-blank only about half the time', () => {
    const p = passive('easy')
    expect(p.kills).toBeGreaterThanOrEqual(4)
    expect(p.kills).toBeLessThanOrEqual(13)
  }, 60_000)
  it('lingering low over a destroyer lasts about twice as long, and a fast pass always comes through', () => {
    const orbit = sweep('orbit', 32, 'fletcher-dd', 'easy')
    expect(orbit.runs).toBe(32)
    expect(orbit.medianLostS!).toBeGreaterThan(38)
    expect(orbit.medianLostS!).toBeLessThan(55)
    const pass = sweep('pass', 32, 'fletcher-dd', 'easy')
    expect(pass.lost).toBe(0)
    expect(pass.meanLightHits + pass.meanBursts).toBeGreaterThan(20) // the guns still fire
  }, 120_000)
})

describe('Ace: clearly harder, not absurd', () => {
  it('a veteran kills a player who does nothing in every run, in about half Veteran\'s time', () => {
    const p = passive('hard')
    expect(p.kills).toBe(16)
    expect(p.medianS!).toBeGreaterThan(6)
    expect(p.medianS!).toBeLessThan(10)
  }, 60_000)
  it('lingering low costs the airplane sooner, and a fast pass is lost more often but still usually survives', () => {
    const orbit = sweep('orbit', 32, 'fletcher-dd', 'hard')
    expect(orbit.lost).toBe(32)
    expect(orbit.medianLostS!).toBeGreaterThan(13)
    expect(orbit.medianLostS!).toBeLessThan(19)
    const pass = sweep('pass', 32, 'fletcher-dd', 'hard')
    expect(pass.lost).toBeGreaterThan(2) // more than Veteran's 2 of 32
    expect(pass.lost).toBeLessThanOrEqual(14)
  }, 120_000)
})
