import { describe, expect, it } from 'vitest'
import { sweepPasses } from './gunnerHarness.js'

/**
 * E3's default gunner lethality, Mark's "noticeable, not deadly" (2026-10-10), measured, not guessed: a
 * scripted Hellcat that never fires makes one pass on a B-17 at 8,200 ft, alone or leading four
 * (tests/sim/weapons/gunnerHarness.ts). "Hits" are .50-hit equivalents of structure lost (a Hellcat burns
 * at 36); "lost" is on fire, destroyed or down.
 *
 * Measured 2026-10-10 on ryzen with these 16 seeds (`tools/ai/gunnerSweep.ts 16`, the full table is in
 * docs/handoff/2026-10-10-e3-bombers-gunners.md): dead astern on four veteran-gunned B-17s, mean 20.3
 * hits, 2 of 16 lost; the same on one B-17, 8.9 hits, none lost; green gunners 7.0 and 5.2; every high-side
 * and head-on pass under 1 hit, none lost. The draws are hashes, so the numbers are exact and repeatable:
 * the bands are for the next retune to read. Tighten them; never widen to whatever passes. Every tuning
 * number is `GUNNER_TUNING` (gunners.ts); the skill comes from `PilotSkill` (M5 scales it).
 */
const SEEDS = 16

describe('gunners are noticeable, not deadly', () => {
  it('a sloppy pass from dead astern on a veteran formation takes hits, and sometimes the airplane', () => {
    const s = sweepPasses('astern', 'veteran', SEEDS, true)
    expect(s.runs).toBe(SEEDS)
    expect(s.meanHits).toBeGreaterThan(14)
    expect(s.meanHits).toBeLessThan(27)
    expect(s.lost).toBeGreaterThanOrEqual(1)
    expect(s.lost).toBeLessThanOrEqual(4)
  }, 240_000)

  it('green gunners hit less than veterans, and one bomber less than four', () => {
    const green = sweepPasses('astern', 'green', SEEDS, true)
    const single = sweepPasses('astern', 'veteran', SEEDS, false)
    expect(green.meanHits).toBeGreaterThan(2) // they do shoot
    expect(green.meanHits).toBeLessThan(12)
    expect(single.meanHits).toBeGreaterThan(2)
    expect(single.meanHits).toBeLessThan(14)
    expect(green.lost + single.lost).toBe(0)
  }, 240_000)

  it('a good high-side or head-on pass on the veteran formation mostly comes through clean', () => {
    for (const g of ['high-side', 'head-on'] as const) {
      const s = sweepPasses(g, 'veteran', SEEDS, true)
      expect(s.meanSalvos, g).toBeGreaterThan(100) // the gunners do fire at it
      expect(s.meanHits, g).toBeLessThan(2)
      expect(s.lost, g).toBe(0)
    }
  }, 240_000)
})
