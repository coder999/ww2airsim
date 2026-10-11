import type { Airframe } from '../scene/airframe.js'
import type { ShipView } from '../scene/ship.js'
import type { ScenarioEntities } from '../scenarioEntities.js'
import type { World } from '../../sim/loop.js'
import type { VehicleView } from '../scene/vehicle.js'

type Views = { readonly airframes: readonly Airframe[]; readonly shipHandles: readonly ShipView[]; readonly vehicleHandles: readonly VehicleView[]; readonly player: Airframe }
const cache = new WeakMap<ScenarioEntities, { readonly key: string; readonly views: Views }>()

/**
 * World-ordered mesh arrays for the frame loop (M2 R1). Start entities keep
 * `buildScenarioEntities`' parallel arrays; an entity past them is a spawned
 * held entity, looked up by id, because `spawnInto` appends in TRIGGER order.
 * Recomputed only when the world's entity counts or spawned ids change (a
 * spawn, a Restart, a scenario switch); each recompute sets every held mesh's
 * visibility to "is it in the world", so a Restart hides spawned meshes again.
 */
export function entityViews(e: ScenarioEntities, world: Pick<World<unknown>, 'aircraft' | 'ships'> & { readonly vehicles?: World<unknown>['vehicles'] }): Views {
  const spawnedAircraft = world.aircraft.slice(e.airframes.length).map((a) => a.id).join(',')
  const spawnedShips = world.ships.slice(e.shipHandles.length).map((s) => s.id).join(',')
  const vehicles = world.vehicles ?? []
  const startVehicles = e.vehicleHandles ?? []
  const spawnedVehicles = vehicles.slice(startVehicles.length).map((v) => v.id).join(',')
  const key = `${world.aircraft.length}:${world.ships.length}:${vehicles.length}:${spawnedAircraft}:${spawnedShips}:${spawnedVehicles}`
  const hit = cache.get(e)
  if (hit !== undefined && hit.key === key) return hit.views
  const pick = <V>(start: readonly V[], held: ReadonlyMap<string, V>, ids: readonly string[]): V[] =>
    ids.map((id, i) => {
      if (i < start.length) return start[i]!
      const v = held.get(id)
      if (v === undefined) throw new Error(`entityViews: no mesh for spawned entity "${id}"`)
      return v
    })
  const airframes = pick(e.airframes, e.held.airframes, world.aircraft.map((a) => a.id))
  const shipHandles = pick(e.shipHandles, e.held.ships, world.ships.map((s) => s.id))
  const vehicleHandles = pick(startVehicles, e.held.vehicles ?? new Map(), vehicles.map((v) => v.id))
  const present = new Set([...world.aircraft.map((a) => a.id), ...world.ships.map((s) => s.id), ...vehicles.map((v) => v.id)])
  for (const [id, v] of e.held.airframes) v.root.visible = present.has(id)
  for (const [id, v] of e.held.ships) v.root.visible = present.has(id)
  for (const [id, v] of e.held.vehicles ?? []) v.root.visible = present.has(id)
  const views = { airframes, shipHandles, vehicleHandles, player: e.player }
  cache.set(e, { key, views })
  return views
}
