import { describe, expect, it } from 'vitest'
import { duelSweep } from './duelHarness.js'

/**
 * M4's big-gun lethality (Mark, 2026-10-10: "a heavy shell takes a real bite of hull points; a destroyer
 * dies to a few, a battleship to many"), measured, not guessed: two warships on parallel courses at
 * 15 knots, main batteries on, an open sea (tests/sim/weapons/duelHarness.ts).
 *
 * Measured 2026-10-10 on ryzen with these 8 seeds (a seed is the fire control's luck): Fletcher against
 * Kagero at 3 miles, the Fletcher won 6 and the Kagero 2, median 97 s to the first sinking, 11.9 hits to sink
 * the loser; Pennsylvania against Kagero at 8 miles, the battleship won all 8, median 187 s, 2.5 hits to
 * sink; Cleveland against Mogami at 5 miles, 3 and 5, median 125 s, 12.5 hits. The fuller 16-seed tables
 * are in the M4 handoff. Exact and repeatable (every draw is a hash), so the bands are tolerances for the next
 * retune to read: tighten them, never widen to whatever passes. Every tuning number is `MAIN_BATTERY`
 * (mainBattery.ts); `npx tsx tools/ai/duelSweep.ts` re-runs a sweep with an override.
 */
const SEEDS = 8

describe('main-battery duels (M4)', () => {
  it('two destroyers at 3 miles: one sinks in a minute or two, after about a dozen 5-inch hits', () => {
    const s = duelSweep('fletcher-dd', 'kagero-dd', 4828, SEEDS)
    expect(s.runs).toBe(SEEDS) // not a vacuous pass
    expect(s.draws).toBe(0)
    expect(s.medianSinkS!).toBeGreaterThan(70)
    expect(s.medianSinkS!).toBeLessThan(130)
    expect(s.meanHitsToSink!).toBeGreaterThan(10)
    expect(s.meanHitsToSink!).toBeLessThan(14)
  }, 60_000)

  it('a battleship against a destroyer at 8 miles: the destroyer, to two or three 14-inch hits', () => {
    const s = duelSweep('pennsylvania-bb', 'kagero-dd', 12_875, SEEDS)
    expect(s.aWins).toBe(SEEDS)
    expect(s.meanHitsToSink!).toBeGreaterThanOrEqual(2)
    expect(s.meanHitsToSink!).toBeLessThan(3.5)
    expect(s.medianSinkS!).toBeGreaterThan(130)
    expect(s.medianSinkS!).toBeLessThan(260)
  }, 60_000)

  it('cruisers at 5 miles: a few minutes, both sides landing hits', () => {
    const s = duelSweep('cleveland-cl', 'mogami-ca', 8047, SEEDS)
    expect(s.draws).toBe(0)
    expect(s.aWins).toBeGreaterThan(0)
    expect(s.bWins).toBeGreaterThan(0)
    expect(s.medianSinkS!).toBeGreaterThan(90)
    expect(s.medianSinkS!).toBeLessThan(180)
    expect(s.hitsPerSalvoA).toBeGreaterThan(0.1)
    expect(s.hitsPerSalvoB).toBeGreaterThan(0.1)
  }, 60_000)
})
