import { type Vec3 } from '../../sim/math/vec3.js'
import { sunDirectionWorld } from './sun.js'

/**
 * The night look (F6A, docs/night.md; Mark's rulings D3 and D5, 2026-10-14).
 * Pure: no three, no DOM. Every number here is a TUNABLE STARTING VALUE chosen
 * by eye at checkpoint CP1, not a measurement; DEV `?night=floor:1.4,moon:0.3,dusk:1.1,glow:1.5,phase:0.25,cockpit:0.35,lux:1,flarefall:1,lights:0` (lights:0 draws and lights nothing, the budget's lights-off twin; flarefall scales a parachute flare's rate of fall, 3.56 m/s by default; lux scales how strongly lights illuminate ground and sea; cockpit is the night brightness of the panel; phase is the moon's lit fraction; glow scales every light glow's radiance)
 * overrides them for a session (`nightTuningFromQuery`).
 *
 * D3: a "movie night": a readable blue floor that is never black and is not a
 * player setting. D5: a fixed half-bright waning moon, up all night, with no
 * ephemeris, rise or set. It is a gameplay look, not a historical claim.
 */

/** Multiplier on the dusk floor (palette.ts TWILIGHT_SCALE) once the sun is well down. 1.0 was the plan's start; 1.3 puts the deep-night frame mean at about 21.6 of 255 (the plan wants 20 to 30) on the 680M, 2026-10-14. */
export const NIGHT_FLOOR_SCALE = 1.3
/** The warm dusk glow is full at this sun elevation and gone `NIGHT_FLOOR_FULL_DEPTH_DEG`. */
/** Multiplier on the dusk floor while the glow is full (-6 deg and above): 1 is the look that shipped; 1.1 keeps -9 deg 30% above deep night (plan wants 25%), 2026-10-14. */
export const DUSK_FLOOR_SCALE = 1.1
export const DUSK_GLOW_FULL_DEG = -6
export const NIGHT_FLOOR_FULL_DEPTH_DEG = -18

/** Lit fraction of the disc, waning (lit limb on the left). 0.7 is a waning gibbous (Mark 2026-10-14, after CP1); 0.25 is a crescent. DEV `?night=phase:0.25`. */
export const MOON_ILLUMINATED_FRACTION = 0.7
export const MOON_ELEVATION_DEG = 40
export const MOON_AZIMUTH_DEG = 250
/** Moonlight's irradiance on an up-facing surface, as a fraction of the floor's. The plan started at 0.25; land was black under it, 0.8 gives readable relief (2026-10-14). */
export const MOON_LIGHT_SCALE = 0.8
/** Angular radius of the drawn moon: larger than the real 0.26 deg so it reads in a 60 deg frame. */
export const MOON_ANGULAR_RADIUS_DEG = 0.6
/** The directional light is the sun above this elevation and the moon below it. The sun's
 *  transmitted light is already ~0 here, and the moon fades in below, so the swap cannot pop. */
export const MOON_SWITCH_DEG = -3
export const MOON_FULL_DEG = -8
/** Stars fade in between these sun elevations. */
export const STARS_START_DEG = -4
export const STARS_FULL_DEG = -9

export type NightTuning = { floorScale: number; moonLightScale: number; duskScale: number; glowScale: number; moonPhase: number; lightScale: number; flareFall: number }
export type NightQuery = Partial<NightTuning> & { cockpitDim?: number; lightsOff?: boolean }
/** Live values (DEV query can change them); the exported constants are the defaults. */
export const nightTuning: NightTuning = { floorScale: NIGHT_FLOOR_SCALE, moonLightScale: MOON_LIGHT_SCALE, duskScale: DUSK_FLOOR_SCALE, glowScale: 1, moonPhase: MOON_ILLUMINATED_FRACTION, lightScale: 1, flareFall: 1 }

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
const smooth = (a: number, b: number, x: number): number => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t) }

/** Dusk warmth: 1 at -6 deg and above, 0 at -18 deg and below, linear (plan §3.5a). */
export function duskGlowWeight(elevationDeg: number): number {
  return clamp01((elevationDeg - NIGHT_FLOOR_FULL_DEPTH_DEG) / (DUSK_GLOW_FULL_DEG - NIGHT_FLOOR_FULL_DEPTH_DEG))
}
/** 0 while the sun is the light, 1 once the moon has fully taken over (MOON_SWITCH_DEG to MOON_FULL_DEG). */
export function moonWeight(elevationDeg: number): number { return smooth(MOON_SWITCH_DEG, MOON_FULL_DEG, elevationDeg) }
export function starWeight(elevationDeg: number): number { return smooth(STARS_START_DEG, STARS_FULL_DEG, elevationDeg) }
/** True when the scene's one directional light is the moon. */
export const moonIsKeyLight = (elevationDeg: number): boolean => elevationDeg < MOON_SWITCH_DEG

/** Unit vector toward the moon: constant, whatever the sim time. +x east, +y up, +z south. */
export function moonDirection(): Vec3 { return sunDirectionWorld(MOON_ELEVATION_DEG, MOON_AZIMUTH_DEG) }

/** DEV `?night=floor:1.4,moon:0.3,dusk:1.1,glow:1.5,phase:0.25,cockpit:0.35,lux:1,flarefall:1,lights:0` (lights:0 draws and lights nothing, the budget's lights-off twin; flarefall scales a parachute flare's rate of fall, 3.56 m/s by default; lux scales how strongly lights illuminate ground and sea; cockpit is the night brightness of the panel; phase is the moon's lit fraction; glow scales every light glow's radiance). Throws on a typo, like the other DEV parameters. */
export const NIGHT_PARAM = 'night'
export function nightTuningFromQuery(search: string): NightQuery | undefined {
  const raw = new URLSearchParams(search).get(NIGHT_PARAM)
  if (raw === null) return undefined
  const out: NightQuery = {}
  for (const part of raw.split(',')) {
    const [k, v] = part.split(':')
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0 || v === undefined || v.trim() === '') throw new Error(`${NIGHT_PARAM}: ${JSON.stringify(part)} is not name:number`)
    if (k === 'floor') out.floorScale = n
    else if (k === 'moon') out.moonLightScale = n
    else if (k === 'dusk') out.duskScale = n
    else if (k === 'glow') out.glowScale = n
    else if (k === 'lux') out.lightScale = n
    else if (k === 'flarefall') out.flareFall = n
    else if (k === 'lights') out.lightsOff = n === 0
    else if (k === 'shaders') { /* read by lights/irradiance.ts at module load: 0 compiles the shared node out */ }
    else if (k === 'cockpit') { if (n > 1) throw new Error(`${NIGHT_PARAM}: cockpit is a brightness factor in [0, 1]`); out.cockpitDim = n }
    else if (k === 'phase') { if (n > 1) throw new Error(`${NIGHT_PARAM}: phase is a lit fraction in [0, 1]`); out.moonPhase = n }
    else throw new Error(`${NIGHT_PARAM}: unknown key ${JSON.stringify(k)} (floor, moon, dusk, glow, phase, cockpit, lux, flarefall, lights, shaders)`)
  }
  return out
}
