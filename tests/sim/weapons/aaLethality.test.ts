import { describe, expect, it } from 'vitest'
import { sweep } from './aaHarness.js'

/**
 * M2's Moderate lethality (Mark, 2026-10-10), measured, not guessed: a scripted Hellcat at 300 ft over
 * an anchored Fletcher-class destroyer (tests/sim/weapons/aaHarness.ts; the shipped `aa-range`
 * scenario with only the destroyer firing).
 *
 *   orbit  circling 1,640 ft out at 195 kn: "lingering low over a destroyer costs the player a Hellcat in
 *          roughly 20 seconds"
 *   pass   a straight run over the ship at 290 kn: "usually survives"
 *   high   circling at 6,000 ft, 6,600 ft out, where only the 5-inch guns reach: a real threat, slower
 *
 * Measured 2026-10-10 on ryzen with these 32 seeds (a seed is the AA's luck and the start phase): the
 * orbit lost all 32, median 21.1 s; the pass lost 2 of 32; the high orbit lost 29 of 32, median 86.9 s.
 * The numbers are exact and repeatable (the AA draws only from hashes), so the bands below are tolerances
 * for the next retune to read, not noise: tighten them, never widen to whatever passes. Every tuning
 * number is `AA_TUNING` (aaFire.ts), which M5 scales; `npx tsx tools/ai/aaSweep.ts <seeds> fletcher-dd
 * '<json override>'` re-runs the sweep with a change.
 */
const SEEDS = 32

describe('AA lethality is Moderate', () => {
  it('lingering low over a destroyer costs the Hellcat in about 20 seconds', () => {
    const s = sweep('orbit', SEEDS)
    expect(s.runs).toBe(SEEDS) // not a vacuous pass
    expect(s.lost).toBeGreaterThanOrEqual(SEEDS - 2)
    expect(s.medianLostS!).toBeGreaterThan(16)
    expect(s.medianLostS!).toBeLessThan(26)
  }, 60_000)

  it('a straight, fast pass at that height usually survives', () => {
    const s = sweep('pass', SEEDS)
    expect(s.runs).toBe(SEEDS)
    expect(s.lost / SEEDS).toBeLessThanOrEqual(0.25)
    // The destroyer does shoot at it: the guns are not simply off.
    expect(s.meanLightHits + s.meanBursts).toBeGreaterThan(20)
  }, 60_000)

  it('at 6,000 ft the flak is a real threat, but slower than the low guns', () => {
    const s = sweep('high', SEEDS)
    expect(s.runs).toBe(SEEDS)
    expect(s.lost / SEEDS).toBeGreaterThanOrEqual(0.6)
    expect(s.medianLostS!).toBeGreaterThan(60)
    expect(s.medianLostS!).toBeLessThan(110)
    expect(s.meanLightHits).toBe(0)
  }, 60_000)
})
