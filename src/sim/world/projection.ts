/** Mean Earth radius, IUGG. A sphere, not an ellipsoid: over a 200 km box the
 *  difference is far below the source DEM's own vertical and horizontal
 *  accuracy, and a sphere keeps this file free of iteration. */
export const EARTH_RADIUS_M = 6371008.8

/** Leyte Gulf, master spec S4. */
export const WORLD_CENTRE = { latDeg: 10.8, lonDeg: 125.3 } as const

export type LocalXZ = { readonly x: number; readonly z: number }
export type Geodetic = { readonly latDeg: number; readonly lonDeg: number }

const RAD = Math.PI / 180
const lat0 = WORLD_CENTRE.latDeg * RAD
const sinLat0 = Math.sin(lat0)
const cosLat0 = Math.cos(lat0)

/**
 * Azimuthal equidistant about the world centre: distance and bearing FROM THE
 * CENTRE are exact, and the tangential distortion at 100 km is 0.004% (design
 * S3). `k = c / sin c` is the scale factor, and it is 1 in the limit -- guarded
 * below, because at the centre itself both terms are 0.
 */
export function toLocal(latDeg: number, lonDeg: number): LocalXZ {
  const lat = latDeg * RAD
  const dLon = (lonDeg - WORLD_CENTRE.lonDeg) * RAD
  const cosC = Math.min(1, Math.max(-1, sinLat0 * Math.sin(lat) + cosLat0 * Math.cos(lat) * Math.cos(dLon)))
  const c = Math.acos(cosC)
  const sinC = Math.sin(c)
  const k = sinC === 0 ? 1 : c / sinC
  return {
    x: EARTH_RADIUS_M * k * Math.cos(lat) * Math.sin(dLon),
    z: EARTH_RADIUS_M * k * (cosLat0 * Math.sin(lat) - sinLat0 * Math.cos(lat) * Math.cos(dLon)),
  }
}

export function toGeodetic(x: number, z: number): Geodetic {
  const rho = Math.hypot(x, z)
  if (rho === 0) return { latDeg: WORLD_CENTRE.latDeg, lonDeg: WORLD_CENTRE.lonDeg }
  const c = rho / EARTH_RADIUS_M
  const sinC = Math.sin(c)
  const cosC = Math.cos(c)
  const lat = Math.asin(Math.min(1, Math.max(-1, cosC * sinLat0 + (z * sinC * cosLat0) / rho)))
  const lon =
    WORLD_CENTRE.lonDeg * RAD + Math.atan2(x * sinC, rho * cosLat0 * cosC - z * sinLat0 * sinC)
  return { latDeg: lat / RAD, lonDeg: lon / RAD }
}
