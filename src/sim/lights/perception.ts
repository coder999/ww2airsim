import { type Vec3, v3 } from '../math/vec3.js'
import type { TerrainField } from '../world/terrain.js'
import { heightAt, SEA_LEVEL_M } from '../world/terrain.js'
import { INTENSITY_CD, ambientNightLevel, emitting, illuminanceAt, lightsAt, type LightSpec } from './lights.js'
import { TACLOBAN_LAT_DEG, sunPosition } from './sun.js'

/**
 * F6B night perception (plan docs/superpowers/plans/2026-10-15-f6b-night-perception-sights.md, section 3).
 *
 * For each aircraft T, once per tick, ONE detection range R(T) in meters: "an enemy sees T out to this
 * distance". The per-pair visibility scalar is R(T) / d(O, T); O sees T iff it is at least 1. R depends only on
 * the target, so the cost is O(aircraft x lights) once per tick and each contact test is one comparison.
 * Pure: no three, no DOM, no render clock, no Math.random. Derived every tick, never stored, so it is a pure
 * function of recorded world state (the world's `night` fact, the tick, poses and each aircraft's lights flag).
 *
 * Every constant below is an ESTIMATE (docs/night.md, "Perception"), tuned by eye at checkpoint 1; DEV
 * `?perception=` overrides them for a session through `NightFacts.tuning`, which is checksummed.
 */
export type PerceptionTuning = {
  /** Detection range in daylight (and the cap), m. Today's `DETECTION_RANGE_M` (targeting.ts). */
  readonly rDayM: number
  /** Sunset illuminance anchor of `TWILIGHT_LUX`, lux. */
  readonly sRefLux: number
  /** Range falls with the K-th power of illuminance. */
  readonly k: number
  /** Nobody is invisible inside formation distance, m. */
  readonly rFloorM: number
  /** The full position-light set (`iNavCd`, three lights at 40 cd) seen by a dark-adapted pilot, m. */
  readonly rNavM: number
  readonly iNavCd: number
  /** Above this much light on the target, lamps fade into the sky (civil twilight end), lux. */
  readonly sGlareLux: number
  /** A pilot already tracking a target keeps it out to this multiple of R. */
  readonly holdFactor: number
}
export const PERCEPTION_DEFAULTS: PerceptionTuning = {
  rDayM: 8000, sRefLux: 400, k: 0.25, rFloorM: 400, rNavM: 6000, iNavCd: 3 * INTENSITY_CD.nav, sGlareLux: 3.4, holdFactor: 1.25,
}
export const PERCEPTION_KEYS = Object.keys(PERCEPTION_DEFAULTS) as (keyof PerceptionTuning)[]

/** The world's night fact (attached to a `World` only when the scenario authors lights or the sortie reaches dusk). */
export type NightFacts = {
  /** Apparent solar hour at tick 0. */
  readonly hour0: number
  readonly latDeg: number
  /** 0..1; dims the moon only (the sim sees no clouds). */
  readonly cloudCover: number
  /** The scenario's authored lights (content). */
  readonly lights: readonly LightSpec[]
  readonly tuning?: Partial<PerceptionTuning>
}

/** The sortie window over which a day sortie still gets night facts (a dusk takeoff that crosses sunset), hours. */
export const NIGHT_FACTS_HORIZON_H = 2

export function solarHourAt(night: Pick<NightFacts, 'hour0'>, tick: number, dtS: number): number {
  return (((night.hour0 + (tick * dtS) / 3600) % 24) + 24) % 24
}
export const sunElevationAt = (night: Pick<NightFacts, 'hour0' | 'latDeg'>, tick: number, dtS: number): number =>
  sunPosition(night.latDeg, solarHourAt(night, tick, dtS)).elevationDeg

/** Does a sortie launched at `hour0` need night facts: the sun is below 0.5 degrees now or within the horizon? */
export function needsNightFacts(hour0: number, latDeg: number = TACLOBAN_LAT_DEG): boolean {
  const el = (h: number): number => sunPosition(latDeg, (((h % 24) + 24) % 24)).elevationDeg
  return el(hour0) < 0.5 || el(hour0 + NIGHT_FACTS_HORIZON_H) < 0.5
}

export type DetectionInputs = {
  readonly sunElevationDeg: number
  /** Sky plus moon, lux (`ambientNightLevel`). */
  readonly ambientLux: number
  /** Light from authored sources other than the target's own nav lights, lux (`illuminanceAt`). */
  readonly localLux: number
  /** Total candela of the target's emitting position lights; 0 when dark or blacked out. */
  readonly selfCd: number
}

/** R(T), meters. Sun above 0 degrees: exactly `rDayM`, today's rule. */
export function detectionRangeM(i: DetectionInputs, tuning: Partial<PerceptionTuning> = {}): number {
  const t = { ...PERCEPTION_DEFAULTS, ...tuning }
  if (i.sunElevationDeg >= 0) return t.rDayM
  const s = Math.max(i.ambientLux + i.localLux, 1e-12)
  const rAmb = Math.min(t.rDayM, Math.max(t.rFloorM, t.rDayM * (s / t.sRefLux) ** t.k))
  const rLamp = i.selfCd > 0 ? t.rNavM * Math.sqrt(i.selfCd / t.iNavCd) * Math.min(1, Math.sqrt(t.sGlareLux / s)) : 0
  return Math.min(t.rDayM, Math.max(rAmb, rLamp))
}

/**
 * Candela of an aircraft's emitting position lights at sim time `tS`: the authored `nav` specs on it, through
 * the contract's own `emitting`. `blackedOut` (the lights switch) turns off every light that is not
 * `blackoutExempt`. An aircraft with no authored nav light is dark, always.
 */
export function navLightCd(specs: readonly LightSpec[], aircraftId: string, tS: number, blackedOut: boolean): number {
  let cd = 0
  for (const l of specs) {
    if (l.kind !== 'nav' || !('aircraft' in l.at) || l.at.aircraft !== aircraftId) continue
    if (blackedOut && l.blackoutExempt !== true) continue
    if (emitting(l, tS)) cd += INTENSITY_CD.nav * (l.at.point === 'all' ? 3 : 1)
  }
  return cd
}

/** What `perceptionAt` needs of a world (structural, so this module imports no `loop.ts`). */
export type PerceptionWorld = {
  readonly tick: number
  readonly night?: NightFacts | undefined
  readonly terrain: TerrainField | null
  readonly wind: Vec3 | null
  readonly aircraft: readonly { readonly id: string; readonly lightsOff?: true | undefined; readonly state: { readonly position: Vec3 } }[]
  readonly ships: readonly { readonly id: string; readonly state: { readonly position: Vec3; readonly headingRad: number } }[]
}
/** R(T) per aircraft id, and the pieces it came from (for diagnostics). */
export type Perception = {
  readonly rangeM: Readonly<Record<string, number>>
  readonly holdFactor: number
  readonly sunElevationDeg: number
  readonly ambientLux: number
}

const external = new WeakMap<readonly LightSpec[], readonly LightSpec[]>()
const externalOf = (specs: readonly LightSpec[]): readonly LightSpec[] => {
  let e = external.get(specs)
  if (e === undefined) { e = specs.filter((l) => l.kind !== 'nav'); external.set(specs, e) }
  return e
}

/** The perception table for this tick; `null` when the world has no night facts (the day path: no work at all). */
export function perceptionAt(world: PerceptionWorld, dtS: number): Perception | null {
  const night = world.night
  if (night === undefined) return null
  const tS = world.tick * dtS
  const sun = sunElevationAt(night, world.tick, dtS)
  const tuning = night.tuning ?? {}
  const rangeM: Record<string, number> = {}
  if (sun >= 0) {
    const r = { ...PERCEPTION_DEFAULTS, ...tuning }.rDayM
    for (const a of world.aircraft) rangeM[a.id] = r
    return { rangeM, holdFactor: { ...PERCEPTION_DEFAULTS, ...tuning }.holdFactor, sunElevationDeg: sun, ambientLux: 0 }
  }
  const ambientLux = ambientNightLevel(sun, night.cloudCover)
  const field = world.terrain
  const ext = externalOf(night.lights)
  const lights = ext.length === 0 ? [] : lightsAt(ext, {
    tick: world.tick, dtS, ...(world.wind ? { windMps: world.wind } : {}),
    groundHeightM: (x, z) => (field === null ? SEA_LEVEL_M : Math.max(SEA_LEVEL_M, heightAt(field, x, z))),
    shipPoint(id, o) {
      const s = world.ships.find((e) => e.id === id)
      if (s === undefined) return null
      const h = s.state.headingRad
      return v3(s.state.position.x + Math.sin(h) * o[0] + Math.cos(h) * o[2], s.state.position.y + o[1], s.state.position.z - Math.cos(h) * o[0] + Math.sin(h) * o[2])
    },
    aircraftPoint: () => null,
  })
  for (const a of world.aircraft) {
    rangeM[a.id] = detectionRangeM({
      sunElevationDeg: sun, ambientLux,
      localLux: lights.length === 0 ? 0 : illuminanceAt(lights, a.state.position),
      selfCd: navLightCd(night.lights, a.id, tS, a.lightsOff === true),
    }, tuning)
  }
  return { rangeM, holdFactor: { ...PERCEPTION_DEFAULTS, ...tuning }.holdFactor, sunElevationDeg: sun, ambientLux }
}

/** Combined sky cover of cloud layers (0..1): independent layers, 1 - product of the clear fractions. */
export function cloudCoverOf(layers: readonly { readonly coverage: number }[]): number {
  return 1 - layers.reduce((clear, l) => clear * (1 - Math.min(1, Math.max(0, l.coverage))), 1)
}

/**
 * The night fact a sortie's world gets, or `undefined` (the day path: nothing attached, every checksum
 * unchanged). Attached when the scenario authors lights or the sun is below 0.5 degrees at the launch hour or
 * `NIGHT_FACTS_HORIZON_H` later (a dusk takeoff that crosses sunset).
 */
export function nightFactsFor(p: {
  readonly lights: readonly LightSpec[] | undefined; readonly hour0: number; readonly cloudCover: number
  readonly latDeg?: number; readonly tuning?: Partial<PerceptionTuning> | undefined
}): NightFacts | undefined {
  const latDeg = p.latDeg ?? TACLOBAN_LAT_DEG
  const lights = p.lights ?? []
  if (lights.length === 0 && !needsNightFacts(p.hour0, latDeg)) return undefined
  const tuning = p.tuning !== undefined && Object.keys(p.tuning).length > 0 ? { tuning: p.tuning } : {}
  return { hour0: p.hour0, latDeg, cloudCover: p.cloudCover, lights, ...tuning }
}

/** DEV `?perception=k:0.3,rNavM:5000` -> overrides; unknown keys or non-numbers throw (a typo must not pass silently). */
export function perceptionTuningFromQuery(search: string): Partial<PerceptionTuning> {
  const raw = new URLSearchParams(search).get('perception')
  if (raw === null || raw.trim() === '') return {}
  const out: Partial<Record<keyof PerceptionTuning, number>> = {}
  for (const pair of raw.split(',')) {
    const [k, v] = pair.split(':')
    const n = Number(v)
    if (!PERCEPTION_KEYS.includes(k as keyof PerceptionTuning) || v === undefined || v.trim() === '' || !Number.isFinite(n)) {
      throw new Error(`perception: ${JSON.stringify(pair)} is not key:number with key one of ${PERCEPTION_KEYS.join(', ')}`)
    }
    out[k as keyof PerceptionTuning] = n
  }
  return out
}
