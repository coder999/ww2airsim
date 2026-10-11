import { add, length, normalize, scale, sub, type Vec3 } from '../math/vec3.js'
import { solveMuzzleLead } from '../ai/pursuit.js'
import { wrapPi } from '../world/ships.js'
import type { Side } from '../sides.js'

/** A live target the ship director is allowed to consider (Track M, M3). */
export type GunLayingTarget = {
  readonly id: string
  readonly side: Side
  readonly kind: 'aircraft' | 'ship' | 'structure'
  readonly position: Vec3
  readonly velocity: Vec3
  /** Present acceleration; zero for surface targets. */
  readonly accel: Vec3
}

/** The bounded, replayable pose one rendered mount consumes. */
export type GunLayingPose = {
  readonly name: string
  readonly targetId: string
  readonly targetKind: GunLayingTarget['kind']
  /** Radians from the content rest bearing; positive is port, as ShipMountView expects. */
  readonly trainingRad: number
  /** Radians above level. The renderer clamps this to the kit's measured limit. */
  readonly elevationRad: number
}

/** Stable nearest-target choice. Equal ranges keep content/world order. */
export function nearestGunTarget(
  origin: Vec3,
  targets: readonly GunLayingTarget[],
  accepts: (target: GunLayingTarget, distanceM: number) => boolean,
): GunLayingTarget | null {
  let best: GunLayingTarget | null = null
  let bestDistance = Infinity
  for (const target of targets) {
    const distance = length(sub(target.position, origin))
    if (distance >= bestDistance || !accepts(target, distance)) continue
    best = target
    bestDistance = distance
  }
  return best
}

/**
 * M2's heavy-AA intercept, extracted byte-for-byte in shape: three fixed-point
 * iterations against current velocity and acceleration. M3 also uses it for a
 * main turret's nominal visual lead; M4 owns the eventual shell specification.
 */
export function constantSpeedLead(
  origin: Vec3,
  target: GunLayingTarget,
  speedMps: number,
): { readonly direction: Vec3; readonly timeS: number } | null {
  if (!(speedMps > 0) || !Number.isFinite(speedMps)) return null
  let timeS = length(sub(target.position, origin)) / speedMps
  let aim = sub(target.position, origin)
  for (let i = 0; i < 3; i++) {
    aim = sub(add(add(target.position, scale(target.velocity, timeS)), scale(target.accel, 0.5 * timeS * timeS)), origin)
    timeS = length(aim) / speedMps
  }
  return length(aim) > 1e-9 && Number.isFinite(timeS) ? { direction: normalize(aim), timeS } : null
}

/** M2's existing drag/drop-aware light-AA lead, exposed as a named director operation. */
export function ballisticGunLead(
  origin: Vec3,
  ownVelocity: Vec3,
  target: GunLayingTarget,
  muzzleMps: number,
  dragPerM: number,
  maxTimeS: number,
): Vec3 | null {
  return solveMuzzleLead(sub(target.position, origin), ownVelocity, target.velocity, muzzleMps, dragPerM, maxTimeS)
}

/**
 * Convert a world-space direction into the ship model's mount convention.
 * Ship bearing is clockwise/starboard from the bow; the renderer trains
 * positive toward port, hence rest minus wanted bearing.
 */
export function gunLayingPose(
  name: string,
  target: GunLayingTarget,
  direction: Vec3,
  shipHeadingRad: number,
  restBearingRad: number,
): GunLayingPose | null {
  const n = length(direction)
  if (!(n > 1e-9) || !Number.isFinite(n)) return null
  const d = scale(direction, 1 / n)
  const forwardX = Math.sin(shipHeadingRad), forwardZ = -Math.cos(shipHeadingRad)
  const starboardX = Math.cos(shipHeadingRad), starboardZ = Math.sin(shipHeadingRad)
  const forward = d.x * forwardX + d.z * forwardZ
  const starboard = d.x * starboardX + d.z * starboardZ
  const bearing = Math.atan2(starboard, forward)
  const trainingRad = wrapPi(restBearingRad - bearing)
  const elevationRad = Math.atan2(d.y, Math.hypot(d.x, d.z))
  if (!Number.isFinite(trainingRad) || !Number.isFinite(elevationRad)) return null
  return { name, targetId: target.id, targetKind: target.kind, trainingRad, elevationRad }
}
