import type { ContactSurface } from './contact.js'
import type { World } from './loop.js'
import type { Vec3 } from './math/vec3.js'
import { sideOf, type Side } from './sides.js'
import { RECOVERY_TUNING } from './bailoutTuning.js'
import { DEFAULT_RECOVERY_ENVIRONMENT, type RecoveryEnvironment, type RecoveryFacts } from './bailout.js'

const horizontalDistance = (a: Vec3, b: { readonly x: number; readonly z: number }): number =>
  Math.hypot(a.x - b.x, a.z - b.z)

const nearest = (distances: readonly number[]): number | null => distances.length === 0 ? null : Math.min(...distances)

/** Derives only from canonical world ownership/positions. F8 may replace the
 * simple nearest-support control rule without changing the resolver contract. */
export function recoveryFactsAt<M>(
  world: World<M>,
  position: Vec3,
  surface: ContactSurface,
  seed: number,
  environment: RecoveryEnvironment = DEFAULT_RECOVERY_ENVIRONMENT,
  friendlySide?: Side,
): RecoveryFacts {
  const player = world.aircraft.find((entry) => entry.id === world.player)!
  const friendly: Side = friendlySide ?? sideOf(world, player)
  const fieldSide = (id: string, fallback?: Side): Side =>
    world.structures.find((entry) => entry.airfield === id)?.side ?? fallback ?? 'axis'

  const friendlyDistances: number[] = []
  const enemyDistances: number[] = []
  for (const field of world.airfields) {
    const distance = horizontalDistance(position, { x: field.runway.center.x, z: field.runway.center.z })
    ;(fieldSide(field.id, field.side) === friendly ? friendlyDistances : enemyDistances).push(distance)
  }
  const friendlyShips: number[] = []
  const enemyShips: number[] = []
  for (const ship of world.ships) {
    const distance = horizontalDistance(position, ship.state.position)
    ;(sideOf(world, ship) === friendly ? friendlyShips : enemyShips).push(distance)
  }
  friendlyDistances.push(...friendlyShips)
  enemyDistances.push(...enemyShips)

  const friendlySupportM = nearest(friendlyDistances)
  const enemySupportM = nearest(enemyDistances)
  const friendlyRescuePresent = friendlyShips.some((distance) => distance <= RECOVERY_TUNING.rescueCoverageM)
  const friendlyStrong = friendlySupportM !== null && friendlySupportM <= RECOVERY_TUNING.controlM
    && (enemySupportM === null || friendlySupportM * RECOVERY_TUNING.controlRatio < enemySupportM)
  const enemyStrong = enemySupportM !== null && enemySupportM <= RECOVERY_TUNING.controlM
    && (friendlySupportM === null || enemySupportM * RECOVERY_TUNING.controlRatio < friendlySupportM)
  const control = friendlyStrong ? 'friendly' : enemyStrong ? 'enemy' : 'contested'
  const enemyPresence = enemyShips.some((distance) => distance <= RECOVERY_TUNING.enemyPresenceM)
    || world.aircraft.some((entry) => entry.id !== world.player && sideOf(world, entry) !== friendly
      && entry.impact === null && horizontalDistance(position, entry.state.position) <= RECOVERY_TUNING.enemyPresenceM)

  return {
    seed,
    surface,
    control,
    friendlySupportM,
    enemySupportM,
    friendlyRescuePresent,
    enemyPresence,
    ...environment,
  }
}
