import { describe, it, expect } from 'vitest'
import {
  DEFAULT_TIME_OF_DAY, LAST_TAKEOFF_BEFORE_SUNSET_H, nearestTakeoffTime, takeoffHours, SCENARIO_DAY_OF_YEAR, TACLOBAN_LAT_DEG, solarDeclinationDeg, sunClock, sunDirectionWorld, sunPosition, timeOfDayFromQuery,
} from '../../src/render/sky/sun.js'

describe('solar geometry (Plan 16c), Tacloban on 1944-10-20', () => {
  it('declination on day 294 is about -10.4 degrees', () => {
    expect(solarDeclinationDeg(SCENARIO_DAY_OF_YEAR)).toBeCloseTo(-10.4, 0)
    expect(SCENARIO_DAY_OF_YEAR).toBe(294)
    expect(DEFAULT_TIME_OF_DAY).toBe(12)
  })
  it('noon is 68.3 degrees up due south; 10:00 is 53 degrees at azimuth 125; 16:30 is 19.5 degrees at 255', () => {
    const noon = sunPosition(TACLOBAN_LAT_DEG, 12)
    expect(noon.elevationDeg).toBeCloseTo(68.3, 0)
    expect(noon.azimuthDeg).toBeCloseTo(180, 0)
    const ten = sunPosition(TACLOBAN_LAT_DEG, 10)
    expect(ten.elevationDeg).toBeCloseTo(53.2, 0)
    expect(ten.azimuthDeg).toBeCloseTo(124.9, 0)
    const late = sunPosition(TACLOBAN_LAT_DEG, 16.5)
    expect(late.elevationDeg).toBeCloseTo(19.5, 0)
    expect(late.azimuthDeg).toBeCloseTo(254.6, 0)
  })
  it('rises at 06:08 and sets at 17:52, within five minutes', () => {
    const crossing = (from: number, to: number): number => {
      let lo = from, hi = to
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2
        if (sunPosition(TACLOBAN_LAT_DEG, mid).elevationDeg < 0 === sunPosition(TACLOBAN_LAT_DEG, from).elevationDeg < 0) lo = mid
        else hi = mid
      }
      return (lo + hi) / 2
    }
    expect(Math.abs(crossing(3, 9) - (6 + 8 / 60))).toBeLessThan(5 / 60)
    expect(Math.abs(crossing(15, 21) - (17 + 52 / 60))).toBeLessThan(5 / 60)
  })
  it('points toward the sun in the world frame: unit length, east before noon, south (+z) all day', () => {
    for (let t = 6.5; t <= 17.5; t += 0.5) {
      const { elevationDeg, azimuthDeg } = sunPosition(TACLOBAN_LAT_DEG, t)
      const d = sunDirectionWorld(elevationDeg, azimuthDeg)
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 6)
      expect(d.y).toBeGreaterThan(0)
      expect(d.z).toBeGreaterThan(0)
      if (t < 11.5) expect(d.x).toBeGreaterThan(0)
      if (t > 12.5) expect(d.x).toBeLessThan(0)
    }
    const noon = sunDirectionWorld(68.3, 180)
    expect(noon.x).toBeCloseTo(0, 6)
    expect(noon.z).toBeGreaterThan(0)
  })
  it('the clock advances at real time and wraps at 24', () => {
    expect(sunClock(10, 3600)).toBe(11)
    expect(sunClock(23.5, 3600)).toBeCloseTo(0.5, 9)
    expect(sunClock(12, 0)).toBe(12)
  })
  it('parses the DEV override and rejects nonsense', () => {
    expect(timeOfDayFromQuery('?timeOfDay=17.5')).toBe(17.5)
    expect(timeOfDayFromQuery('?timeOfDay=0')).toBe(0)
    expect(timeOfDayFromQuery('?x=1')).toBeUndefined()
    expect(() => timeOfDayFromQuery('?timeOfDay=sunset')).toThrow(/timeOfDay/)
    expect(() => timeOfDayFromQuery('?timeOfDay=24')).toThrow(/timeOfDay/)
    expect(() => timeOfDayFromQuery('?timeOfDay=-1')).toThrow(/timeOfDay/)
  })
})

describe('takeoff times (A3, Mark 2026-10-09)', () => {
  const hours = takeoffHours(TACLOBAN_LAT_DEG)
  const hhmm = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}${String(Math.round((h % 1) * 60)).padStart(2, '0')}`
  it('Leyte on the scenario day: Morning 0740, Midday 1200, Dusk 1645', () => {
    expect(Object.fromEntries(Object.entries(hours).map(([k, h]) => [k, hhmm(h)]))).toEqual({ morning: '0740', midday: '1200', dusk: '1645' })
  })
  it('each is where the sun model says: Morning 1.5 h after sunrise, Midday at the highest sun, Dusk an hour before sunset', () => {
    // Sunrise is within the 5 min rounding of Morning - 1.5 h.
    expect(sunPosition(TACLOBAN_LAT_DEG, hours.morning - 1.5 - 5 / 60).elevationDeg).toBeLessThan(0.5)
    expect(sunPosition(TACLOBAN_LAT_DEG, hours.morning - 1.5 + 5 / 60).elevationDeg).toBeGreaterThan(-0.5)
    expect(sunPosition(TACLOBAN_LAT_DEG, hours.midday).elevationDeg).toBeGreaterThan(sunPosition(TACLOBAN_LAT_DEG, hours.midday + 0.25).elevationDeg)
    expect(sunPosition(TACLOBAN_LAT_DEG, hours.midday).elevationDeg).toBeGreaterThan(sunPosition(TACLOBAN_LAT_DEG, hours.midday - 0.25).elevationDeg)
    expect(sunPosition(TACLOBAN_LAT_DEG, hours.dusk + LAST_TAKEOFF_BEFORE_SUNSET_H).elevationDeg).toBeGreaterThan(0)
    expect(sunPosition(TACLOBAN_LAT_DEG, hours.dusk + LAST_TAKEOFF_BEFORE_SUNSET_H + 0.25).elevationDeg).toBeLessThan(0)
  })
  it('suggests the time nearest the historical hour', () => {
    expect(nearestTakeoffTime(7.5, hours)).toBe('morning')
    expect(nearestTakeoffTime(10, hours)).toBe('midday')
    expect(nearestTakeoffTime(14, hours)).toBe('midday')
    expect(nearestTakeoffTime(15, hours)).toBe('dusk')
    expect(nearestTakeoffTime(16.5, hours)).toBe('dusk')
  })
})
