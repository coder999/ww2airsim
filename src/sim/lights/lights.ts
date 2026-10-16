import { z } from 'zod'
import { type Vec3, v3, sub, dot, length } from '../math/vec3.js'
import { NAV_COLOR, NAV_HALF_ANGLE_RAD, NAV_POINTS, type NavPoint } from './airframeLights.js'

/**
 * The light contract (F6A, docs/night.md, plan 2026-10-14-f6a-night-renderer-lights.md §3).
 * A light is authored content plus a pure function of sim time and world
 * state. Pure: no three, no DOM, no render clock, no Math.random, so F6B can
 * read `illuminanceAt` / `ambientNightLevel` from sim-side code and the world
 * checksum never sees a light (lights are derived, never stored).
 */
export const LIGHT_CONTRACT_VERSION = 1

export const LIGHT_KINDS = ['pot', 'fixture', 'searchlight', 'flare', 'nav'] as const
export type LightKind = typeof LIGHT_KINDS[number]
export const LIGHT_COLORS = ['warm', 'red', 'white', 'green'] as const
export type LightColor = typeof LIGHT_COLORS[number]
export type Rgb = readonly [number, number, number]

/** Hard caps (plan §3.4, D8). A scenario over a cap FAILS to load. */
export const LIGHT_CAPS = {
  /** Lights that illuminate ground, sea and airframes at once (renderer selection, nearest to the eye). */
  litSlots: 8,
  /** Authored emitters drawn as glow sprites (pots, fixtures, flares, searchlight hit glow). */
  glowSprites: 96,
  searchlights: 3,
  flares: 4,
  /** Nav lights, total, across all aircraft. */
  navSprites: 64,
} as const

const finite = z.number().refine(Number.isFinite, { message: 'must be a finite number' })
const id = z.string().min(1)

const At = z.union([
  z.object({ x: finite, z: finite, altitudeM: finite.optional() }).strict(),
  z.object({ ship: id, offset: z.tuple([finite, finite, finite]) }).strict(),
  /** `point` is a position-light point (airframeLights.ts) or `all`, which stands for the port, starboard and tail lights. */
  z.object({ aircraft: id, point: z.enum([...NAV_POINTS, 'all']) }).strict(),
])

export const LightSpecSchema = z.object({
  id,
  kind: z.enum(LIGHT_KINDS),
  at: At,
  /** A name, not RGB: the palette lives in code (LIGHT_RGB). */
  color: z.enum(LIGHT_COLORS),
  state: z.enum(['lit', 'unlit', 'off', 'on']),
  /** Sim seconds. A flare ignites at `onAtS` and burns `burnS`; others switch on at `onAtS` and off at `offAtS`. */
  schedule: z.object({ onAtS: finite.optional(), offAtS: finite.optional(), burnS: finite.optional() }).strict().optional(),
  /** Searchlight only. Azimuth is a compass bearing (0 north, 90 east); `sweepDegPerS` turns it with sim time. */
  aim: z.object({ azimuthDeg: finite, elevationDeg: finite, sweepDegPerS: finite.optional() }).strict().optional(),
  /** Flare only. `true` hangs the flare at its authored point for its whole burn (the night test range's lighting demo); absent, it behaves like a flare: it descends under its parachute, drifts with the wind, goes out in water and burns on the ground for `FLARE_GROUND_BURN_S`. */
  fixed: z.boolean().optional(),
  /** Flare only: an authored drift velocity in the world frame, [x, z] m/s, used INSTEAD of the world's wind (a test bed that wants a visibly drifting flare without a wind that also pushes the parked player). */
  driftMps: z.tuple([finite, finite]).optional(),
  blackoutExempt: z.boolean().optional(),
  /** GAMEPLAY.md: every installed light has source support or an explicit gameplay label. */
  source: z.enum(['historical', 'gameplay']),
  sourceNote: z.string().min(1),
}).strict().superRefine((l, ctx) => {
  const bad = (message: string): void => { ctx.addIssue({ code: z.ZodIssueCode.custom, message }) }
  const binary = l.kind === 'searchlight' || l.kind === 'nav' ? ['on', 'off'] : l.kind === 'flare' ? ['on', 'off'] : ['lit', 'unlit']
  if (!binary.includes(l.state)) bad(`a ${l.kind} light's state is ${binary.join(' or ')}, not "${l.state}"`)
  if (l.kind === 'searchlight' && l.aim === undefined) bad('a searchlight needs `aim`')
  if (l.kind !== 'searchlight' && l.aim !== undefined) bad('only a searchlight has `aim`')
  if (l.kind === 'flare' && (l.schedule?.onAtS === undefined || l.schedule.burnS === undefined)) bad('a flare needs schedule.onAtS and schedule.burnS')
  if (l.kind !== 'flare' && l.schedule?.burnS !== undefined) bad('only a flare has schedule.burnS')
  if (l.kind !== 'flare' && (l.fixed !== undefined || l.driftMps !== undefined)) bad('only a flare is `fixed` or has `driftMps`')
  if (l.kind === 'nav' && !('aircraft' in l.at)) bad('a nav light is placed on an aircraft point')
})
export type LightSpec = z.infer<typeof LightSpecSchema>

/** The whole `lights` array of a scenario: unique ids and every cap (plan §3.4). */
export const LightsSchema = z.array(LightSpecSchema).superRefine((lights, ctx) => {
  const bad = (message: string): void => { ctx.addIssue({ code: z.ZodIssueCode.custom, message }) }
  const seen = new Set<string>()
  for (const l of lights) { if (seen.has(l.id)) bad(`duplicate light id "${l.id}"`); seen.add(l.id) }
  // An `all` nav light is three position lights.
  const n = (k: LightKind): number => lights.filter((l) => l.kind === k).reduce((sum, l) => sum + (l.kind === 'nav' && 'point' in l.at && l.at.point === 'all' ? 3 : 1), 0)
  if (n('searchlight') > LIGHT_CAPS.searchlights) bad(`${n('searchlight')} searchlights exceed the cap of ${LIGHT_CAPS.searchlights}`)
  if (n('flare') > LIGHT_CAPS.flares) bad(`${n('flare')} flares exceed the cap of ${LIGHT_CAPS.flares}`)
  if (n('nav') > LIGHT_CAPS.navSprites) bad(`${n('nav')} nav lights exceed the cap of ${LIGHT_CAPS.navSprites}`)
  const glow = n('pot') + n('fixture') + n('flare') + n('searchlight')
  if (glow > LIGHT_CAPS.glowSprites) bad(`${glow} glow emitters exceed the cap of ${LIGHT_CAPS.glowSprites}`)
})

/** Scene palette. Linear RGB, unit luminance-ish: the renderer scales by intensity. */
export const LIGHT_RGB: Readonly<Record<LightColor, Rgb>> = {
  warm: [1, 0.55, 0.2], // kerosene / carbon flame
  red: [1, 0.05, 0.03],
  white: [1, 0.95, 0.85],
  green: [0.05, 1, 0.12],
}

/**
 * Luminous intensity in candela, on one scene scale: real units where a
 * source exists, ESTIMATE otherwise (docs/night.md, "Sources"). The renderer
 * maps lux to scene radiance with its own gain; F6B uses lux directly.
 */
export const INTENSITY_CD = {
  /** ESTIMATE: an open kerosene flare pot's flame, order of tens of cd. */
  pot: 50,
  /** ESTIMATE: a steady harbor lantern / temporary nav lamp. */
  fixture: 100,
  /** 800 million cd: the commonly cited figure for the US 60-inch carbon-arc light (docs/night.md). */
  searchlight: 800e6,
  /** 800,000 cd: AN-M26 parachute flare (Navy OP 1664); the M24 shares the illuminant class, ESTIMATE for the M24 itself. */
  flare: 800e3,
  /** ESTIMATE: a steady aircraft position light, order of 40 cd. */
  nav: 40,
} as const
/** ESTIMATE: 60-inch beam half-angle after the reflector; real beams are about 2-3 degrees. */
export const SEARCHLIGHT_HALF_ANGLE_RAD = (2.5 * Math.PI) / 180
/** M24 (and AN-M26) rate of fall after ignition: 700 ft/min = 3.556 m/s. U.S. Explosive Ordnance, OP 1664, "Aircraft pyrotechnics (Army flares)", printed page 252 (PDF pages 9 to 10), read 2026-10-14. Mark may scale it: DEV `?night=flarefall:`. */
export const FLARE_DESCENT_MPS = (700 * 0.3048) / 60
/**
 * How long a parachute flare keeps burning once it lands on LAND, seconds. ESTIMATE (no source found): the
 * M24's candle burns 3 minutes (OP 1664) whatever the canister does, but a canister lying on the ground with its
 * canopy collapsed is a low, short-lived light, and Mark asked for a short tail (2026-10-14: 20 to 30 s). In water the
 * light goes out at once. The burn time of the schedule still ends it earlier if shorter.
 */
export const FLARE_GROUND_BURN_S = 25
/** Ground at or below this height is water: a flare landing there goes out. */
export const WATER_HEIGHT_M = 0.2
/** A landed flare lies this far above the surface, metres. */
const LANDED_LIFT_M = 0.3
/** Influence stops where a source gives less than this many lux. */
export const MIN_LUX = 0.01
export const MAX_RADIUS_M = 20_000

export type LightRuntime = {
  readonly id: string
  readonly kind: LightKind
  readonly positionM: Vec3
  /** 0 when dark. */
  readonly intensityCd: number
  readonly color: Rgb
  readonly coneHalfAngleRad?: number
  readonly axis?: Vec3
  readonly radiusM: number
  /** Nav lights: false when blacked out (the player's lights switch, F6B). */
  readonly blackoutExempt: boolean
}

/** What the pure function needs from the world; the caller wires these from the sim. */
export type LightWorld = {
  readonly tick: number
  readonly dtS: number
  /** The wind's velocity in the world frame, m/s (a flare drifts with it); absent is calm. */
  readonly windMps?: Vec3
  /** Multiplier on the flare's rate of fall (a DEV tuning knob; absent is 1). */
  readonly flareFallScale?: number
  /** Ground (or sea) height under x,z for static lights with no altitude. */
  groundHeightM(x: number, z: number): number
  /** World position of an offset in a ship's frame, or null if that ship is gone. */
  shipPoint(ship: string, offset: readonly [number, number, number]): Vec3 | null
  /** World position and facing (unit) of a position-light point on an aircraft, or null if it is gone or its airframe has no row. */
  aircraftPoint(aircraft: string, point: NavPoint): { readonly position: Vec3; readonly axis: Vec3 } | null
}

const DEG = Math.PI / 180

/** Unit vector for a compass azimuth and elevation, matching sun.ts: +x east, +y up, +z south. */
export function aimAxis(azimuthDeg: number, elevationDeg: number): Vec3 {
  const az = azimuthDeg * DEG, el = elevationDeg * DEG
  return v3(Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az))
}

function radiusFor(cd: number): number {
  return cd <= 0 ? 0 : Math.min(MAX_RADIUS_M, Math.sqrt(cd / MIN_LUX))
}

/**
 * A flare's pose and state at sim time `t`: pure and deterministic from its content, the wind, the terrain
 * and the clock (nothing is stored). `fixed` hangs at its authored point; otherwise it descends at
 * `FLARE_DESCENT_MPS`, drifts with the wind, goes out the moment it touches water, and on land burns on for
 * `FLARE_GROUND_BURN_S`; the schedule's `burnS` ends it earlier if shorter.
 */
export function flareAt(l: LightSpec, p0: Vec3, world: Pick<LightWorld, 'windMps' | 'groundHeightM' | 'flareFallScale'>, t: number): { readonly position: Vec3; readonly on: boolean } {
  const t0 = l.schedule!.onAtS!, burnEnd = t0 + l.schedule!.burnS!
  if (l.state !== 'on' || t < t0 || t >= burnEnd) return { position: p0, on: false }
  if (l.fixed === true) return { position: p0, on: true }
  const w = l.driftMps !== undefined ? v3(l.driftMps[0], 0, l.driftMps[1]) : (world.windMps ?? v3(0, 0, 0))
  const fall = FLARE_DESCENT_MPS * (world.flareFallScale ?? 1)
  const at = (dt: number): Vec3 => v3(p0.x + w.x * dt, p0.y - fall * dt, p0.z + w.z * dt)
  const below = (dt: number): boolean => { const q = at(dt); return q.y <= world.groundHeightM(q.x, q.z) + LANDED_LIFT_M }
  const burn = l.schedule!.burnS!
  // First touchdown: ground sampled every 1 s (3.6 m of fall), then bisected. A ridge narrower than the horizontal drift in 1 s (the wind speed in metres) can be skipped: ACCEPTED, flares are not a collision query.
  let landed = -1
  if (below(0)) landed = 0
  else for (let dt = 1; dt - 1 < burn; dt += 1) {
    const hi = Math.min(dt, burn)
    if (below(hi)) { let a = Math.max(0, dt - 1), b = hi; for (let i = 0; i < 12; i++) { const m = (a + b) / 2; if (below(m)) b = m; else a = m } landed = b; break }
  }
  const dt = t - t0
  if (landed < 0 || dt < landed) return { position: at(dt), on: true }
  const q = at(landed)
  const ground = world.groundHeightM(q.x, q.z)
  const rest = v3(q.x, ground + LANDED_LIFT_M, q.z)
  if (ground <= WATER_HEIGHT_M) return { position: rest, on: false }
  return { position: rest, on: dt < landed + FLARE_GROUND_BURN_S }
}

/** Is this light emitting at sim time `t`? Exported for F6B's perception (`navLightCd`); additive, the contract shape is unchanged. */
export function emitting(l: LightSpec, t: number): boolean {
  const s = l.schedule
  if (l.kind === 'flare') return l.state === 'on' && t >= s!.onAtS! && t < s!.onAtS! + s!.burnS!
  const base = l.state === 'lit' || l.state === 'on'
  if (s === undefined) return base
  const afterOn = s.onAtS === undefined || t >= s.onAtS
  const beforeOff = s.offAtS === undefined || t < s.offAtS
  return base ? afterOn && beforeOff : afterOn && s.onAtS !== undefined && beforeOff
}

/**
 * Every light's runtime view at `world.tick`, ordered by id. Pure and
 * deterministic: nothing is stored, so the world checksum cannot see lights.
 * A light whose ship or aircraft anchor no longer exists is omitted.
 */
export function lightsAt(specs: readonly LightSpec[], world: LightWorld): readonly LightRuntime[] {
  const t = world.tick * world.dtS
  const out: LightRuntime[] = []
  for (const l of [...specs].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    // A nav light on an aircraft: one runtime light per point (`all` is three), colored by point, facing out of its arc.
    if ('aircraft' in l.at) {
      const aircraft = l.at.aircraft
      const points: readonly NavPoint[] = l.at.point === 'all' ? NAV_POINTS : [l.at.point]
      for (const point of points) {
        const pose = world.aircraftPoint(aircraft, point)
        if (pose === null) continue
        const cd = emitting(l, t) ? INTENSITY_CD.nav : 0
        out.push({
          id: l.at.point === 'all' ? `${l.id}:${point}` : l.id, kind: l.kind, positionM: pose.position, intensityCd: cd,
          color: LIGHT_RGB[NAV_COLOR[point]], axis: pose.axis, coneHalfAngleRad: NAV_HALF_ANGLE_RAD[point],
          radiusM: radiusFor(cd), blackoutExempt: l.blackoutExempt ?? false,
        })
      }
      continue
    }
    let p: Vec3 | null
    if ('ship' in l.at) p = world.shipPoint(l.at.ship, l.at.offset)
    else p = v3(l.at.x, l.at.altitudeM ?? world.groundHeightM(l.at.x, l.at.z), l.at.z)
    if (p === null) continue
    let on = emitting(l, t)
    if (l.kind === 'flare') { const f = flareAt(l, p, world, t); p = f.position; on = f.on }
    const cd = on ? INTENSITY_CD[l.kind] : 0
    let axis: Vec3 | undefined
    let cone: number | undefined
    if (l.kind === 'searchlight') {
      axis = aimAxis(l.aim!.azimuthDeg + (l.aim!.sweepDegPerS ?? 0) * t, l.aim!.elevationDeg)
      cone = SEARCHLIGHT_HALF_ANGLE_RAD
    }
    out.push({
      id: l.id, kind: l.kind, positionM: p, intensityCd: cd, color: LIGHT_RGB[l.color],
      ...(axis !== undefined ? { axis, coneHalfAngleRad: cone! } : {}),
      radiusM: radiusFor(cd), blackoutExempt: l.blackoutExempt ?? false,
    })
  }
  return out
}

/**
 * Lux (an illuminance scalar) the lights give a point facing every light, as
 * the sum of I / d^2. 0 outside a light's radius, and outside a cone for
 * aimed lights. F6B's "is X lit?" input. Distances under 1 m clamp to 1 m.
 */
export function illuminanceAt(lights: readonly LightRuntime[], pointM: Vec3): number {
  let lux = 0
  for (const l of lights) {
    if (l.intensityCd <= 0) continue
    const d = sub(pointM, l.positionM)
    const dist = length(d)
    if (dist > l.radiusM) continue
    if (l.axis !== undefined && dist > 0 && dot(d, l.axis) / dist < Math.cos(l.coneHalfAngleRad!)) continue
    lux += l.intensityCd / Math.max(dist, 1) ** 2
  }
  return lux
}

/** ESTIMATE anchors for the sky's illuminance on the ground, lux: sunset, civil, nautical, astronomical twilight. */
const TWILIGHT_LUX: readonly (readonly [number, number])[] = [[0, 400], [-6, 3.4], [-12, 0.008], [-18, 0.0003]]
/** ESTIMATE: a half moon in clear air, lux. The look uses a fixed moon (D5); the gameplay scalar does too. */
export const MOONLIGHT_LUX = 0.05

/**
 * How bright the night is to a pilot, in lux on the same scale as
 * `illuminanceAt`: the sky's twilight (log-interpolated in sun elevation) plus
 * the fixed moon, with cloud dimming the moon. Deliberately NOT the rendered
 * floor (the picture is a readable "movie night" by Mark's ruling D3); this
 * is what F6B reads, so a blacked-out target is still hard to see.
 */
export function ambientNightLevel(sunElevDeg: number, cloudCover: number): number {
  const cover = Math.min(1, Math.max(0, Number.isFinite(cloudCover) ? cloudCover : 0))
  let sky: number
  if (sunElevDeg >= TWILIGHT_LUX[0]![0]) sky = TWILIGHT_LUX[0]![1]
  else if (sunElevDeg <= TWILIGHT_LUX[TWILIGHT_LUX.length - 1]![0]) sky = TWILIGHT_LUX[TWILIGHT_LUX.length - 1]![1]
  else {
    let i = 0
    while (sunElevDeg < TWILIGHT_LUX[i + 1]![0]) i++
    const [ea, la] = TWILIGHT_LUX[i]!, [eb, lb] = TWILIGHT_LUX[i + 1]!
    sky = Math.exp(Math.log(la) + (Math.log(lb) - Math.log(la)) * (ea - sunElevDeg) / (ea - eb))
  }
  return sky * (1 - 0.7 * cover) + MOONLIGHT_LUX * (1 - 0.6 * cover)
}
