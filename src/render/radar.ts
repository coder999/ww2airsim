import { qRotate } from '../sim/math/quat.js'
import { dot, length, sub, v3 } from '../sim/math/vec3.js'
import type { AircraftEntity } from '../sim/loop.js'
import { isAircraftDown, type CombatState } from '../sim/weapons/combat.js'

/**
 * Radar scope math (Plan 17, design:
 * docs/superpowers/specs/2026-09-23-radar-design.md). Read-only telemetry
 * over already-simulated `World` state -- `sim/` is untouched, the same
 * relationship `combatReadout.ts` has to `World.combat`.
 */

/** Statute miles, matching the panel's existing unit system -- the airspeed
 *  dial already reads mph (gauges.ts's `fromSI: 1 / 0.44704`), not knots. */
export const METERS_PER_MILE = 1609.344

/** `Tab` cycles through these, in this order, wrapping. */
export const RADAR_RANGES_MI = [15, 5, 1] as const
export type RadarRangeMi = (typeof RADAR_RANGES_MI)[number]

/** Shader `uniformArray` headroom (radarScope.ts). Every shipped scenario
 *  has far fewer aircraft than this today. */
export const MAX_RADAR_CONTACTS = 16

/** One full clockwise sweep revolution, seconds. */
export const RADAR_SWEEP_PERIOD_S = 2

/** A contact never fully vanishes between sweeps. */
export const RADAR_FADE_FLOOR = 0.12

const TWO_PI = 2 * Math.PI

export type RadarContact = {
  readonly id: string
  /** Radians, clockwise from the player's nose: 0 ahead, +pi/2 right,
   *  +/-pi astern, -pi/2 left -- the same sign convention
   *  `controlsForDesiredVelocity`'s heading error uses. */
  readonly bearingRad: number
  readonly rangeMi: number
}

/** Bounds any angle to (-pi, pi], the exact `wrapPi` idiom `controller.ts`
 *  already uses in plain JS. */
const wrapPi = (rad: number): number => Math.atan2(Math.sin(rad), Math.cos(rad))

/**
 * Bearing and range from `player` to `target`, horizontal (x, z) plane only
 * -- the bearing is inherently a horizontal azimuth (design doc §2). No
 * epsilon floor on the forward component: Plan 7a's whole-branch review
 * found that exact floor (`controller.ts`'s old `Math.max(1e-6, ahead)`)
 * silently collapsing a behind-the-nose error to zero, and a contact dead
 * astern is precisely the case a radar most needs to get right.
 */
function bearingAndRangeMi<M>(
  player: AircraftEntity<M>,
  target: AircraftEntity<M>,
): { bearingRad: number; rangeMi: number } {
  const relative = sub(target.state.position, player.state.position)
  const flat = v3(relative.x, 0, relative.z)
  const rangeMi = length(flat) / METERS_PER_MILE
  if (rangeMi < 1e-9) return { bearingRad: 0, rangeMi: 0 }
  const forward = qRotate(player.state.attitude, v3(1, 0, 0))
  const right = qRotate(player.state.attitude, v3(0, 0, 1))
  return { bearingRad: Math.atan2(dot(flat, right), dot(flat, forward)), rangeMi }
}

/**
 * Every other airborne aircraft within `rangeMi`, nearest first, capped at
 * `MAX_RADAR_CONTACTS`. `parked` aircraft never appear: there is no IFF in
 * the sim yet, so "airborne" is the only filter available, and it is a
 * static spawn-time flag (`loop.ts`'s own doc comment on
 * `AircraftEntity.parked` -- an aircraft never transitions mid-flight).
 * Nor does a downed one (`isAircraftDown`: crashed, ditched or destroyed --
 * Mark, 2026-09-25, a crashed plane stayed on the scope). `records` is
 * `World.combat.aircraft`, required so the production call cannot forget it.
 */
export function radarContacts<M>(
  player: AircraftEntity<M>,
  others: readonly AircraftEntity<M>[],
  rangeMi: number,
  records: CombatState['aircraft'],
): readonly RadarContact[] {
  return others
    .filter((a) => a.id !== player.id && !a.parked && !isAircraftDown(records, a))
    .map((a) => ({ id: a.id, ...bearingAndRangeMi(player, a) }))
    .filter((c) => c.rangeMi <= rangeMi)
    .sort((a, b) => a.rangeMi - b.rangeMi)
    .slice(0, MAX_RADAR_CONTACTS)
}

/** The sweep's current angle: one full clockwise revolution every
 *  `RADAR_SWEEP_PERIOD_S`. The caller freezes it on pause simply by not
 *  advancing `elapsedS` -- see the plan's Global Constraints for which
 *  clock `main.ts` uses. */
export function radarSweepAngle(elapsedS: number): number {
  const raw = ((elapsedS / RADAR_SWEEP_PERIOD_S) * TWO_PI) % TWO_PI
  return raw < 0 ? raw + TWO_PI : raw
}

/**
 * Brightness in [RADAR_FADE_FLOOR, 1] for a bearing given the current sweep
 * angle: 1.0 exactly where the sweep is now, decaying linearly to the floor
 * over the 2*pi it takes to come back around. No per-contact state: a
 * contact's own CURRENT bearing is compared against the CURRENT sweep angle
 * every call, so a maneuvering contact's brightness is a live, cheap
 * function rather than a value tracked since it was last illuminated.
 */
export function radarBrightness(bearingRad: number, sweepRad: number): number {
  const lag = wrapPi(sweepRad - bearingRad)
  const positiveLag = lag < 0 ? lag + TWO_PI : lag
  const fraction = 1 - positiveLag / TWO_PI
  return RADAR_FADE_FLOOR + (1 - RADAR_FADE_FLOOR) * fraction
}

/** `Tab`: 15 -> 5 -> 1 -> wraps to 15. */
export function cycleRadarRange(current: RadarRangeMi): RadarRangeMi {
  const i = RADAR_RANGES_MI.indexOf(current)
  return RADAR_RANGES_MI[(i + 1) % RADAR_RANGES_MI.length]!
}
