import { describe, it, expect } from 'vitest'
import { atmospherePalette, withMoonLight } from '../../src/render/sky/palette.js'
import { exposureFor } from '../../src/render/exposure.js'
import {
  MOON_AZIMUTH_DEG, MOON_ELEVATION_DEG, MOON_SWITCH_DEG, duskGlowWeight, moonDirection, moonIsKeyLight, moonWeight,
  nightTuning, nightTuningFromQuery, starWeight, MOON_LIGHT_SCALE,
} from '../../src/render/sky/night.js'
import { sunDirectionWorld } from '../../src/render/sky/sun.js'

const lum = (c: readonly number[]): number => 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!

describe('night floor (D3): readable, never black, continuous', () => {
  it('the floor is finite and positive at every integer sun elevation from -90 to 0', () => {
    for (let e = -90; e <= 0; e++) {
      const p = atmospherePalette(600, e)
      for (const v of [...p.fillSky, ...p.fillGround, ...p.zenith, ...p.horizon]) expect(Number.isFinite(v), `elev ${e}`).toBe(true)
      expect(lum(p.fillSky), `elev ${e}`).toBeGreaterThan(0.01)
    }
  })
  it('the sky fill has no step across -6 deg or anywhere on the way down (<5% per 0.1 deg)', () => {
    for (let e = 0; e > -30; e -= 0.1) {
      const a = lum(atmospherePalette(600, e).fillSky), b = lum(atmospherePalette(600, e - 0.1).fillSky)
      expect(Math.abs(b / a - 1), `elev ${e.toFixed(1)}`).toBeLessThan(0.05)
    }
  })
  it('deep night holds a floor instead of falling away: -46 and -90 deg give the same sky', () => {
    expect(atmospherePalette(600, -46)).toEqual(atmospherePalette(600, -90))
  })
  it('dusk and deep night differ: the horizon band is brighter and warmer at -9 deg than at -46 deg', () => {
    const dusk = atmospherePalette(600, -9), deep = atmospherePalette(600, -46)
    expect(lum(dusk.horizon)).toBeGreaterThan(1.25 * lum(deep.horizon))
    expect(dusk.horizon[0] / dusk.horizon[2]).toBeGreaterThan(1.3 * (deep.horizon[0] / deep.horizon[2]))
  })
  it('the dusk glow ramps 1 at -6 deg to 0 at -18 deg, monotonically', () => {
    expect(duskGlowWeight(-6)).toBe(1)
    expect(duskGlowWeight(0)).toBe(1)
    expect(duskGlowWeight(-9)).toBeCloseTo(0.75, 9)
    expect(duskGlowWeight(-18)).toBe(0)
    expect(duskGlowWeight(-60)).toBe(0)
    for (let e = 0; e > -30; e -= 0.5) expect(duskGlowWeight(e - 0.5)).toBeLessThanOrEqual(duskGlowWeight(e))
  })
  it('exposure holds its -6 deg value at depth instead of lifting further', () => {
    expect(exposureFor(-46)).toBe(exposureFor(-6))
    expect(exposureFor(-90)).toBe(exposureFor(-6))
  })
})

describe('the fixed moon (D5)', () => {
  it('its direction is a constant: no input, so no sim time and no date can move it', () => {
    expect(moonDirection()).toEqual(moonDirection())
    const d = sunDirectionWorld(MOON_ELEVATION_DEG, MOON_AZIMUTH_DEG)
    expect(moonDirection()).toEqual(d)
    expect(moonDirection().y).toBeGreaterThan(0.5) // up all night
  })
  it('is the key light only below the switch elevation, and fades in as the sun goes', () => {
    expect(moonIsKeyLight(MOON_SWITCH_DEG + 0.01)).toBe(false)
    expect(moonIsKeyLight(MOON_SWITCH_DEG - 0.01)).toBe(true)
    expect(moonWeight(MOON_SWITCH_DEG)).toBe(0)
    expect(moonWeight(-46)).toBe(1)
    for (let e = 0; e > -30; e -= 0.5) expect(moonWeight(e - 0.5)).toBeGreaterThanOrEqual(moonWeight(e))
  })
  it('replaces the sun colour below the switch: a HORIZONTAL surface gets moonLightScale of the floor', () => {
    const day = atmospherePalette(600, 30)
    expect(withMoonLight(day, 30)).toBe(day)
    const deep = atmospherePalette(600, -46)
    const moon = withMoonLight(deep, -46)
    const horizontal = lum(moon.sunColor) * Math.sin((MOON_ELEVATION_DEG * Math.PI) / 180)
    expect(horizontal / lum(deep.fillSky)).toBeCloseTo(nightTuning.moonLightScale, 6)
    expect(nightTuning.moonLightScale).toBe(MOON_LIGHT_SCALE)
    expect(horizontal).toBeLessThan(lum(deep.fillSky)) // a soft term, not a second sun
    // No pop at the hand-off: just below the switch the moon has no weight yet.
    expect(lum(withMoonLight(atmospherePalette(600, MOON_SWITCH_DEG - 0.001), MOON_SWITCH_DEG - 0.001).sunColor)).toBeLessThan(1e-3)
  })
})

describe('stars', () => {
  it('none in daylight or twilight, all of them below -9 deg, monotonic between', () => {
    for (const e of [90, 30, 0, -4]) expect(starWeight(e), `elev ${e}`).toBe(0)
    for (const e of [-9, -20, -46]) expect(starWeight(e), `elev ${e}`).toBe(1)
    for (let e = 0; e > -20; e -= 0.5) expect(starWeight(e - 0.5)).toBeGreaterThanOrEqual(starWeight(e))
  })
})

describe('DEV ?night= tuning', () => {
  it('parses name:number pairs and rejects typos loudly', () => {
    expect(nightTuningFromQuery('')).toBeUndefined()
    expect(nightTuningFromQuery('?night=floor:1.5,moon:0.4,dusk:1,glow:2,phase:0.25')).toEqual({ floorScale: 1.5, moonLightScale: 0.4, duskScale: 1, glowScale: 2, moonPhase: 0.25 })
    expect(() => nightTuningFromQuery('?night=phase:1.5')).toThrow(/lit fraction/)
    expect(() => nightTuningFromQuery('?night=flor:1')).toThrow(/unknown key/)
    expect(() => nightTuningFromQuery('?night=floor:x')).toThrow(/name:number/)
  })
})
