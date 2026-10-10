import { describe, it, expect } from 'vitest'
import {
  ENGINE_GAIN_MAX, ENGINE_RATE_MAX, ENGINE_RATE_MIN,
  engineGainFor, enginePlaybackRateFor,
  BUFFET_ONSET, CREAK_ONSET, RUMBLE_FULL_MPS, SYNTH_GAIN_MAX, WIND_CUTOFF_HIGH_HZ, WIND_FULL_MPS, WIND_START_MPS,
  creakFor, rumbleFor, stallFor, windFor,
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

describe('the synthesized layers (I1)', () => {
  it('blows wind only above the start speed, louder and brighter to full at the top', () => {
    expect(windFor(WIND_START_MPS).gain).toBe(0)
    expect(windFor(undefined).gain).toBe(0)
    const mid = windFor((WIND_START_MPS + WIND_FULL_MPS) / 2)
    const full = windFor(WIND_FULL_MPS * 1.5)
    expect(mid.gain).toBeGreaterThan(0)
    expect(full).toEqual({ gain: SYNTH_GAIN_MAX.wind, cutoffHz: WIND_CUTOFF_HIGH_HZ })
    expect(mid.cutoffHz).toBeLessThan(full.cutoffHz)
  })

  it('rumbles only with wheels rolling on land or deck, the deck brighter', () => {
    expect(rumbleFor(false, 'land', 30).gain).toBe(0)
    expect(rumbleFor(null, 'land', 30).gain).toBe(0)
    expect(rumbleFor(true, 'water', 30).gain).toBe(0)
    expect(rumbleFor(true, 'land', 0).gain).toBe(0)
    expect(rumbleFor(true, 'land', RUMBLE_FULL_MPS).gain).toBe(SYNTH_GAIN_MAX.rumble)
    expect(rumbleFor(true, 'deck', 20).cutoffHz).toBeGreaterThan(rumbleFor(true, 'land', 20).cutoffHz)
  })

  it('buffets from the onset to full at the stall, buzzes nearer it, and only in the air', () => {
    // At 1 g, k x the stall speed uses 1/k^2 of the maximum lift: the onsets keep their speed meaning.
    const atSpeed = (k: number): number => 1 / k ** 2
    expect(stallFor(true, atSpeed(BUFFET_ONSET))).toEqual({ buffet: 0, buzz: 0 })
    const near = stallFor(true, atSpeed(1.1))
    expect(near.buffet).toBeGreaterThan(0)
    expect(near.buzz).toBe(0)
    expect(stallFor(true, atSpeed(1))).toEqual({ buffet: SYNTH_GAIN_MAX.buffet, buzz: SYNTH_GAIN_MAX.buzz })
    expect(stallFor(false, 1)).toEqual({ buffet: 0, buzz: 0 })
    expect(stallFor(true, undefined)).toEqual({ buffet: 0, buzz: 0 })
  })

  it('creaks from the onset to full at the dive limit', () => {
    expect(creakFor(200 * CREAK_ONSET, 200)).toBe(0)
    expect(creakFor(200 * 0.95, 200)).toBeGreaterThan(0)
    expect(creakFor(210, 200)).toBe(SYNTH_GAIN_MAX.creak)
    expect(creakFor(250, undefined)).toBe(0)
  })
})
