import { describe, it, expect } from 'vitest'
import {
  ENGINE_GAIN_MAX, ENGINE_RATE_MAX, ENGINE_RATE_MIN,
  engineGainFor, enginePlaybackRateFor,
} from '../../src/audio/mix.js'

describe('the engine mix (design §4.2)', () => {
  it('is EXACTLY silent at zero throttle -- Mark chose this over an idle floor', () => {
    // Not `toBeCloseTo`. "Silent" is a decision, not a tolerance.
    expect(engineGainFor(0)).toBe(0)
  })

  it('fails toward silence on a broken throttle', () => {
    // Same posture as `contactOutcome` and `supportedContact` in src/sim:
    // every gate is a positive comparison, so a non-finite input fails all of
    // them. A NaN throttle must not reach an AudioParam -- Chromium throws on
    // a non-finite value and the throw lands in the render loop.
    for (const bad of [NaN, -1, -Infinity]) expect(engineGainFor(bad), String(bad)).toBe(0)
    for (const bad of [NaN, -1, -Infinity]) {
      expect(Number.isFinite(enginePlaybackRateFor(bad)), String(bad)).toBe(true)
    }
  })

  it('rises with throttle and clamps at the top', () => {
    expect(engineGainFor(1)).toBeCloseTo(ENGINE_GAIN_MAX, 12)
    expect(engineGainFor(2)).toBeCloseTo(ENGINE_GAIN_MAX, 12)
    let previous = -1
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const g = engineGainFor(t)
      expect(g).toBeGreaterThanOrEqual(previous)
      previous = g
    }
  })

  it('opens the prop up but never resamples it hard enough to shred it', () => {
    expect(enginePlaybackRateFor(0)).toBeCloseTo(ENGINE_RATE_MIN, 12)
    expect(enginePlaybackRateFor(1)).toBeCloseTo(ENGINE_RATE_MAX, 12)
    expect(ENGINE_RATE_MAX / ENGINE_RATE_MIN).toBeLessThan(2)
  })
})
