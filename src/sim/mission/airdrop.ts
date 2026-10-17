import type { DropRelease, ParachutistEntity } from '../bailout.js'
import type { EntityId } from '../loop.js'
import type { DropCorridor, Station } from './schema.js'

/** F10D: a man's share of a stick that must come down alive in the zone for the drop to count, when the scenario does not say (half of six). */
export const DEFAULT_MIN_LANDED = 3

/** The station test (a copy of step.ts's `insideStation`, which imports this module: importing it back was a dependency cycle, found by F10E's depcruise). */
function insideStation(s: Pick<Station, 'point' | 'radiusM' | 'altitudeM' | 'innerRadiusM'>, p: { readonly x: number; readonly y: number; readonly z: number }): boolean {
  const d = Math.hypot(p.x - s.point.x, p.z - s.point.z)
  if (d > s.radiusM || (s.innerRadiusM !== undefined && d < s.innerRadiusM)) return false
  return s.altitudeM === undefined || (p.y >= s.altitudeM[0] && p.y <= s.altitudeM[1])
}

const within = (r: readonly [number, number], x: number): boolean => x >= r[0] && x <= r[1]
const headingWithin = (r: readonly [number, number], h: number): boolean => (r[0] <= r[1] ? h >= r[0] && h <= r[1] : h >= r[0] || h <= r[1])

/** Whether the aircraft was inside the corridor when it released. Every field the corridor gives must hold; no corridor is always met. Pure. */
export function corridorHolds(c: DropCorridor | undefined, r: DropRelease): boolean {
  if (c === undefined) return true
  if (c.airspeedMps !== undefined && !within(c.airspeedMps, r.airspeedMps)) return false
  if (c.groundSpeedMps !== undefined && !within(c.groundSpeedMps, r.groundSpeedMps)) return false
  if (c.altitudeM !== undefined && !within(c.altitudeM, r.altitudeM)) return false
  return c.headingDeg === undefined || headingWithin(c.headingDeg, r.headingDeg)
}

/** A rig that came down intact (a man alive, a bundle landed) on the ground inside `zone`. Water and death never count. */
const landedInZone = (p: ParachutistEntity, zone: Station): boolean =>
  p.state.phase === 'down' && p.state.contact !== null && p.state.contact.surface !== 'water' && insideStation(zone, p.state.position)

/** How many of `ids` have made an effective drop: released inside the corridor, and at least `minLanded` of their men landed alive in the zone. */
export function effectiveDrops(ps: readonly ParachutistEntity[] | undefined, ids: readonly EntityId[], zone: Station, corridor: DropCorridor | undefined, minLanded = DEFAULT_MIN_LANDED): number {
  if (ps === undefined) return 0
  return ids.filter((id) => {
    const men = ps.filter((p) => p.kind === 'trooper' && p.sourceAircraft === id && p.release !== undefined)
    return men.length > 0 && men.every((p) => corridorHolds(corridor, p.release!)) && men.filter((p) => landedInZone(p, zone)).length >= minLanded
  }).length
}

/** Supply bundles dropped by `ids` that have landed inside the zone. */
export function bundlesLanded(ps: readonly ParachutistEntity[] | undefined, ids: readonly EntityId[], zone: Station): number {
  return (ps ?? []).filter((p) => p.kind === 'bundle' && ids.includes(p.sourceAircraft) && landedInZone(p, zone)).length
}
