/**
 * Where the sun is, in the sim (F6B Task 2: moved from `src/render/sky/sun.ts`, which re-exports it).
 * Pure: no three, no DOM. The AI's night perception needs the sun's elevation at the world's clock, and
 * `src/sim` may not import `render`.
 *
 * Time is APPARENT SOLAR TIME: 12.0 is the sun due south at its highest, so
 * the hour angle is simply 15 degrees per hour from noon and there is no
 * time zone and no equation of time to get wrong.
 */
export const SCENARIO_DAY_OF_YEAR = 294
/** The spec's pinned latitude; the app uses TERRAIN_HEADER.centreLatDeg. */
export const TACLOBAN_LAT_DEG = 11.24

const DEG = Math.PI / 180

/** Spencer (1971) series, as in NOAA's solar calculator. */
export function solarDeclinationDeg(dayOfYear: number): number {
  const g = (2 * Math.PI / 365) * (dayOfYear - 1)
  const d = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g)
    + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)
  return d / DEG
}

export function sunPosition(latDeg: number, timeOfDay: number, dayOfYear = SCENARIO_DAY_OF_YEAR): { elevationDeg: number; azimuthDeg: number } {
  const phi = latDeg * DEG
  const decl = solarDeclinationDeg(dayOfYear) * DEG
  const H = 15 * (timeOfDay - 12) * DEG
  const sinEl = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H)
  const elevationDeg = Math.asin(Math.max(-1, Math.min(1, sinEl))) / DEG
  // Azimuth from north, clockwise: the standard atan2 form, shifted so that
  // noon reads 180 (south) rather than 0.
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) / DEG
  return { elevationDeg, azimuthDeg: (az + 180 + 360) % 360 }
}

