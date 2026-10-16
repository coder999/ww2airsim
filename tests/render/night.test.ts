import { describe, it, expect } from 'vitest'
import { atmospherePalette, withMoonLight } from '../../src/render/sky/palette.js'
import { exposureFor } from '../../src/render/exposure.js'
import {
  MOON_AZIMUTH_DEG, MOON_ELEVATION_DEG, MOON_SWITCH_DEG, duskGlowWeight, moonDirection, moonIsKeyLight, moonWeight,
  nightTuning, nightTuningFromQuery, starWeight, MOON_LIGHT_SCALE, cloudLight,
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
    expect(nightTuningFromQuery('?night=cockpit:0.5')).toEqual({ cockpitDim: 0.5 })
    expect(nightTuningFromQuery('?night=flarefall:1.5')).toEqual({ flareFall: 1.5 })
    expect(nightTuningFromQuery('?night=lights:0')).toEqual({ lightsOff: true })
    expect(nightTuningFromQuery('?night=lights:1')).toEqual({ lightsOff: false })
    expect(() => nightTuningFromQuery('?night=flor:1')).toThrow(/unknown key/)
    expect(() => nightTuningFromQuery('?night=floor:x')).toThrow(/name:number/)
  })
})

describe('cloud light at night (fix-night-clouds, 2026-10-15)', () => {
  const SUN = sunDirectionWorld(30, 120)
  it('is exactly the day look with the sun at or above the horizon (every multiplier 1, the sun direction untouched)', () => {
    for (const e of [0, 0.5, 5, 30, 68, 90]) {
      const l = cloudLight(e, SUN)
      expect(l.sun, `elev ${e}`).toEqual([1, 1, 1])
      expect(l.ambient, `elev ${e}`).toBe(1)
      expect(l.direction, `elev ${e}`).toBe(SUN)
    }
  })
  it('at deep night the key light is the moon, white-sun is gone, and the ambient is a small fraction of the day', () => {
    const l = cloudLight(-46, sunDirectionWorld(-46, 120))
    const m = moonDirection()
    expect(l.direction.x).toBeCloseTo(m.x, 6); expect(l.direction.y).toBeCloseTo(m.y, 6); expect(l.direction.z).toBeCloseTo(m.z, 6)
    // Measured before the fix (2026-10-15): the multipliers did not exist; clouds were as bright as by day.
    expect(Math.max(...l.sun)).toBeLessThan(0.05)
    expect(l.ambient).toBeLessThan(0.05)
    expect(l.sun[2], 'the moon is cool: blue over red').toBeGreaterThan(l.sun[0])
    expect(Math.min(...l.sun), 'not black').toBeGreaterThan(0)
  })
  it('falls monotonically through dusk with no step: <3% of the day level per 0.05 deg, ambient never rising as the sun sinks', () => {
    let prev = cloudLight(2, SUN)
    for (let e = 0; e > -30; e -= 0.05) {
      const l = cloudLight(e, sunDirectionWorld(e, 120))
      expect(l.ambient, `ambient at ${e.toFixed(2)}`).toBeLessThanOrEqual(prev.ambient + 1e-12)
      const lumNow = lum(l.sun), lumPrev = lum(prev.sun)
      expect(Math.abs(lumNow - lumPrev), `sun term at ${e.toFixed(2)}`).toBeLessThan(0.03)
      expect(Math.abs(l.ambient - prev.ambient), `ambient at ${e.toFixed(2)}`).toBeLessThan(0.03)
      for (const v of [...l.sun, l.ambient, l.direction.x, l.direction.y, l.direction.z]) expect(Number.isFinite(v)).toBe(true)
      // The total cloud light (sun or moon term plus ambient) never brightens as the sun sinks: the moon only replaces light the sun has already lost.
      expect(lum(l.sun) + l.ambient, `total at ${e.toFixed(2)}`).toBeLessThanOrEqual(lum(prev.sun) + prev.ambient + 1e-3)
      prev = l
    }
  })
  it('the cloud tunable scales the moon and the ambient floor together and is read from ?night=cloud:', () => {
    const a = cloudLight(-46, SUN, { cloudScale: 1 }), b = cloudLight(-46, SUN, { cloudScale: 2 })
    expect(b.sun[1] / a.sun[1]).toBeCloseTo(2, 6)
    expect(b.ambient / a.ambient).toBeCloseTo(2, 6)
    expect(cloudLight(-46, SUN, { cloudScale: 0 }).ambient).toBe(0)
    expect(nightTuningFromQuery('?night=cloud:2')).toEqual({ cloudScale: 2 })
    expect(nightTuning.cloudScale).toBe(1)
  })
})
