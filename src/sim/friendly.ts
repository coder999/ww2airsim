/**
 * Which bases are the player's (F5C D3, 2026-10-16): the one place that answers "is this a friendly base?" for the
 * recovery rule, the leg stop, the objective line and the steering cue. Pure, over plain world fields, so the mission
 * step (which has no `World`) and the render shell call the same function.
 *
 * Friendly means held by the player's side in the world's state right now: an airfield takes its side from its
 * structures (stamped by `createWorldOf` through `airfieldSideOf`, so a scenario's `airfieldSides` override counts),
 * a ship from `sideOf`, and an anchorage is a water circle the scenario declares (`Scenario.anchorages`; F8 replaces
 * this per-scenario list with canonical base data). Nothing here moves a base or changes who holds it.
 */
import type { AircraftEntity, EntityId, ShipEntity } from './loop.js'
import type { AircraftSpec } from './flight/schema.js'
import type { LandingAt } from './landing.js'
import { sideOf, type Side } from './sides.js'
import type { StructureEntity } from './weapons/structures.js'
import type { Airfield } from './world/airfields.js'
import { deckOf } from './world/deck.js'
import type { Vec3 } from './math/vec3.js'

/** A friendly stretch of water a seaplane may stop on and relaunch from (declared by the scenario, world metres). */
export type Anchorage = { readonly id: string; readonly name: string; readonly x: number; readonly z: number; readonly radiusM: number }

/** A friendly surface ship also counts for a water landing alongside it (D8: "an anchorage or ship"). */
export const SHIP_RECOVERY_RADIUS_M = 2000

export type FriendlyBase = {
  readonly kind: 'airfield' | 'carrier' | 'anchorage' | 'ship'
  readonly id: string
  readonly name: string
}

/** The world fields the questions below read (a `World` satisfies it; so does a mission tick). */
export type FriendlyContext = {
  readonly player: EntityId
  readonly aircraft: readonly AircraftEntity<unknown>[]
  readonly airfields: readonly Airfield[]
  readonly structures: readonly Pick<StructureEntity, 'airfield' | 'side'>[]
  readonly ships: readonly ShipEntity[]
  readonly anchorages?: readonly Anchorage[] | undefined
}

/** The player's side, by the same rule every system uses (`sideOf`). */
export function playerSideOf(w: Pick<FriendlyContext, 'player' | 'aircraft'>): Side {
  const p = w.aircraft.find((a) => a.id === w.player)
  return p === undefined ? 'allied' : sideOf(w, p)
}

/** An airfield's side as the world holds it: its structures' side, else the content's own, else axis (`airfieldSideOf`'s default). */
export function airfieldHeldBy(w: Pick<FriendlyContext, 'structures'>, a: Airfield): Side {
  const s = w.structures.find((x) => x.airfield === a.id)
  return s?.side ?? a.side ?? 'axis'
}

export const isFriendlyAirfield = (w: FriendlyContext, a: Airfield): boolean => airfieldHeldBy(w, a) === playerSideOf(w)
export const isFriendlyShip = (w: FriendlyContext, s: ShipEntity): boolean => sideOf(w, s) === playerSideOf(w)

/**
 * The friendly base a flight that came to rest at `at` / `position` is standing on, or `null`: an enemy or unowned
 * field, a hostile carrier, open ground, and water away from every anchorage and friendly ship all read `null`.
 */
export function friendlyBaseAt(w: FriendlyContext, at: LandingAt | null, position: Pick<Vec3, 'x' | 'z'>): FriendlyBase | null {
  if (at === null) return null
  if (at.kind === 'airfield') {
    const field = w.airfields.find((a) => a.id === at.id)
    return field !== undefined && isFriendlyAirfield(w, field) ? { kind: 'airfield', id: field.id, name: field.name } : null
  }
  if (at.kind === 'carrier') {
    const ship = w.ships.find((s) => s.id === at.id)
    return ship !== undefined && isFriendlyShip(w, ship) ? { kind: 'carrier', id: ship.id, name: ship.spec.name } : null
  }
  const near = (x: number, z: number, r: number): boolean => Math.hypot(position.x - x, position.z - z) <= r
  const anchorage = (w.anchorages ?? []).find((a) => near(a.x, a.z, a.radiusM))
  if (anchorage !== undefined) return { kind: 'anchorage', id: anchorage.id, name: anchorage.name }
  const ship = w.ships.find((s) => isFriendlyShip(w, s) && near(s.state.position.x, s.state.position.z, SHIP_RECOVERY_RADIUS_M))
  return ship === undefined ? null : { kind: 'ship', id: ship.id, name: ship.spec.name }
}

export type FriendlySite = FriendlyBase & { readonly x: number; readonly z: number }

/**
 * Every friendly site a pilot may recover to, with where it is now: each friendly airfield (its runway center), each
 * friendly ship with a flight deck, and each declared anchorage. The steering cue aims at the nearest (F5C D3).
 */
export function friendlySites(w: FriendlyContext): FriendlySite[] {
  const out: FriendlySite[] = []
  for (const a of w.airfields) if (isFriendlyAirfield(w, a)) out.push({ kind: 'airfield', id: a.id, name: a.name, x: a.runway.center.x, z: a.runway.center.z })
  for (const s of w.ships) if (isFriendlyShip(w, s) && deckOf(s) !== null) out.push({ kind: 'carrier', id: s.id, name: s.spec.name, x: s.state.position.x, z: s.state.position.z })
  for (const a of w.anchorages ?? []) out.push({ kind: 'anchorage', id: a.id, name: a.name, x: a.x, z: a.z })
  return out
}

/**
 * Whether this aircraft can recover to a site of that kind: a carrier needs a carrier-capable airplane, an anchorage or
 * a ship needs a hull that floats; any airfield takes anything. The cue steers a P-38 to a field, never to a carrier.
 */
export const siteUsableBy = (spec: Pick<AircraftSpec, 'carrierCapable' | 'waterOperations'>) => (site: Pick<FriendlyBase, 'kind'>): boolean =>
  site.kind === 'airfield' || (site.kind === 'carrier' ? spec.carrierCapable : spec.waterOperations !== undefined)

/** The friendly site nearest `from` that `usable` accepts, or `null` when the player's side holds none. */
export function nearestFriendlySite(w: FriendlyContext, from: Pick<Vec3, 'x' | 'z'>, usable: (s: FriendlySite) => boolean = () => true): FriendlySite | null {
  let best: FriendlySite | null = null
  let bestD = Infinity
  for (const s of friendlySites(w)) {
    if (!usable(s)) continue
    const d = Math.hypot(s.x - from.x, s.z - from.z)
    if (d < bestD) { best = s; bestD = d }
  }
  return best
}
