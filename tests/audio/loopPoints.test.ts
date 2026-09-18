import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'
import { assetFor } from '../../src/audio/assets.js'
import { LOOP_END_FRAME, LOOP_START_FRAME, PROPELLER_SAMPLE_RATE, loopEndSeconds, loopStartSeconds } from '../../src/audio/mix.js'
import { readWav } from '../../tools/audio/wav.js'

/** Total |step| across both channels at a splice from frame `end` back to
 *  frame `start`, plus the slope mismatch. The quantity a click is. */
const seamStep = (s: Int16Array, ch: number, start: number, end: number): number => {
  let total = 0
  for (let c = 0; c < ch; c++) {
    total += Math.abs(s[end * ch + c]! - s[start * ch + c]!)
    total += Math.abs(
      (s[end * ch + c]! - s[(end - 1) * ch + c]!) - (s[start * ch + c]! - s[(start - 1) * ch + c]!),
    )
  }
  return total
}

describe('the propeller loop points (design §4.1)', () => {
  it('splices with a step far smaller than looping the whole file would', () => {
    // Mark's ruling 2026-09-18: loop points in code, not a re-cut WAV. That
    // ruling is only safe if the constants are checkable, which is this test.
    // propeller.wav has NO fade at either end (RMS runs 6,185..10,400 across
    // all eighty 100 ms windows), so the default whole-file wrap is an
    // audible click once every eight seconds.
    const { samples, channels, frames, sampleRate } = readWav(
      fileURLToPath(new URL(`../../${assetFor('propeller').path}`, import.meta.url)),
    )
    expect(sampleRate).toBe(PROPELLER_SAMPLE_RATE)
    expect(LOOP_END_FRAME).toBeLessThan(frames)

    const chosen = seamStep(samples, channels, LOOP_START_FRAME, LOOP_END_FRAME)
    const naive = seamStep(samples, channels, 1, frames - 1)

    // Re-measured 2026-09-18 with `npx tsx tools/audio/loop.ts`: chosen 64,
    // naive 12,050 -- a 188x reduction. The plan drafted this comment as
    // "naive 10,941 ... 171x", which these exact indices do not reproduce
    // (nor do the neighbouring pairs: 12,256 and 11,656). The chosen figure
    // of 64 reproduces exactly, so the seam formula agrees and it was the
    // naive baseline that was misquoted. Thresholds sit well clear of both
    // so a re-measure is a real signal.
    expect(chosen).toBeLessThanOrEqual(512)
    expect(naive / Math.max(chosen, 1)).toBeGreaterThan(10)
  })

  it('states its constants in frames and derives the seconds', () => {
    expect(loopStartSeconds()).toBeCloseTo(LOOP_START_FRAME / PROPELLER_SAMPLE_RATE, 12)
    expect(loopEndSeconds()).toBeCloseTo(LOOP_END_FRAME / PROPELLER_SAMPLE_RATE, 12)
    expect(loopEndSeconds() - loopStartSeconds()).toBeGreaterThan(5)
  })
})
