import type { AircraftEntity, World } from '../loop.js'
import { DT } from '../flight/model.js'
import { qRotate } from '../math/quat.js'
import { dot, length, sub, v3 } from '../math/vec3.js'
import { sideOf } from '../sides.js'
import { isAircraftDoomed, type AircraftCombat } from '../weapons/combat.js'
import { decksOf } from '../world/deck.js'
import { airborne } from './airborne.js'
import { RECENT_HIT_S } from './ingress.js'
import { hasGunSolution } from './pursuit.js'
import type { WingmanOrder } from './pilot.js'

/**
 * E4: the player's calls to his wingmen (Mark, 2026-10-10): Attack, Cover me,
 * Form up. A call is plain data on each wingman's `FormationOrders.order`;
 * `pilotTick` reads it. Pure.
 */

/** "Ahead" for an Attack call with no autopilot target: within this of the player's nose. */
export const ATTACK_AHEAD_RAD = 60 * Math.PI / 180

/** The live AI wingmen flying on `leaderId`. */
export function wingmenOf<M>(world: World<M>, leaderId: string): readonly AircraftEntity<M>[] {
  return world.aircraft.filter((a) => a.pilot?.formation?.leader === leaderId && a.impact === null && !isAircraftDoomed(world.combat.aircraft, a))
}

/** What an Attack call names: the autopilot's target while it has one, else the
 *  nearest live, airborne enemy within ATTACK_AHEAD_RAD of the player's nose, else null. */
export function playerAttackTarget<M>(world: World<M>, autopilotTarget: string | null): string | null {
  if (autopilotTarget !== null) return autopilotTarget
  const self = world.aircraft.find((a) => a.id === world.player)
  if (self === undefined) return null
  const nose = qRotate(self.state.attitude, v3(1, 0, 0))
  const decks = decksOf(world.ships)
  let best: string | null = null
  let bestRange = Infinity
  for (const c of world.aircraft) {
    if (c.id === self.id || c.impact !== null || sideOf(world, c) === sideOf(world, self)) continue
    if (isAircraftDoomed(world.combat.aircraft, c) || !airborne(c, world.terrain, decks)) continue
    const to = sub(c.state.position, self.state.position)
    const range = length(to)
    if (range < 1e-6 || dot(to, nose) / range < Math.cos(ATTACK_AHEAD_RAD)) continue
    if (range < bestRange) { best = c.id; bestRange = range }
  }
  return best
}

/** `world` with every wingman of the player under `order`, each rescoring this tick. */
export function orderWingmen<M>(world: World<M>, order: WingmanOrder): World<M> {
  const ids = new Set(wingmenOf(world, world.player).map((a) => a.id))
  if (ids.size === 0) return world
  const nowS = world.tick * DT
  return {
    ...world,
    aircraft: world.aircraft.map((a) => !ids.has(a.id) ? a : {
      ...a,
      pilot: { ...a.pilot!, formation: { ...a.pilot!.formation!, order }, decision: { ...a.pilot!.decision, nextRescoreS: nowS } },
    }),
  }
}

const hitRecentlyBy = (record: AircraftCombat | undefined, c: string, nowS: number): boolean =>
  record !== undefined && record.lastHitBy === c && record.lastHit !== null && nowS - record.lastHit.tick * DT <= RECENT_HIT_S

/** Form up: the wingman fights only what is attacking it. */
export function selfDefenseAccepts<M>(self: AircraftEntity<M>, record: AircraftCombat, nowS: number): (c: AircraftEntity<M>) => boolean {
  return (c) => hasGunSolution(c, self) || c.pilot?.decision.targetId === self.id || hitRecentlyBy(record, c.id, nowS)
}

/** Cover me: what is attacking the leader, or the wingman itself. */
export function coverAccepts<M>(
  self: AircraftEntity<M>, leader: AircraftEntity<M>, records: Readonly<Record<string, AircraftCombat>>, nowS: number,
): (c: AircraftEntity<M>) => boolean {
  const own = selfDefenseAccepts(self, records[self.id]!, nowS)
  return (c) => own(c) || hasGunSolution(c, leader) || c.pilot?.decision.targetId === leader.id || hitRecentlyBy(records[leader.id], c.id, nowS)
}
