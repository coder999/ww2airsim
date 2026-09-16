import { SEA_LEVEL_M } from './world/terrain.js'

/** Which kind of surface a contact happened against. `'land'` and `'water'`
 *  are the only two that exist; airplanes, ships and buildings are entities
 *  and arrive with Plan 12, which is when this type grows. */
export type ContactSurface = 'water' | 'land'

/**
 * The surface at a contact, from the ground height already captured on
 * `Impact`.
 *
 * At or below sea level is water. This deliberately reads the elevation data
 * that is already loaded rather than a second coastline map: one copy cannot
 * disagree with itself. `heightAt` returns `SEA_LEVEL_M` both for open ocean
 * and for any query outside the 200 km box, so "exactly zero" is the ordinary
 * case over the sea rather than a boundary curiosity.
 */
export function surfaceAt(groundHeightM: number): ContactSurface {
  return groundHeightM <= SEA_LEVEL_M ? 'water' : 'land'
}
