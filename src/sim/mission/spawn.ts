import { heightAt, type TerrainField } from '../world/terrain.js'
import { v3 } from '../math/vec3.js'
import { wheelDepthOf } from '../gearContact.js'
import { createCombat, type CombatState } from '../weapons/combat.js'
import { storesFromLoadout } from '../weapons/stores.js'
import { armedForAttack } from '../ai/attack.js'
import type { AircraftEntity, ShipEntity, World } from '../loop.js'
import type { MissionState } from './state.js'
import type { VehicleEntity } from '../world/vehicles.js'

/** The slice of a world a spawn changes. `advance` holds these as loop
 *  locals between steps, which is why the spawn works on them rather than on
 *  a `World` (plan ruling R5). */
export type SpawnParts<M> = {
  readonly tick: number
  readonly aircraft: readonly AircraftEntity<M>[]
  readonly ships: readonly ShipEntity[]
  readonly vehicles: readonly VehicleEntity[]
  readonly combat: CombatState
  readonly mission: MissionState<M>
  /** Rests a parked aircraft on the ground, as `settleOnTerrain` does at load. */
  readonly terrain?: TerrainField | null
}

/**
 * Brings held group `groupId` into the world at `parts.tick` (spec §1: the
 * ONLY way an entity appears after tick 0).
 *
 * The entities were built at world creation by `worldFromScenario`'s own
 * builders, so this only restamps `state.tick` to the world clock and sets
 * `previous = state` (a spawn is not a step; the renderer must not
 * interpolate from anywhere). Combat records come from `createCombat`, the
 * function that made every start entity's, with the same defaults: empty
 * stores for aircraft, full hull for ships. Appended, so every existing
 * entity keeps its index (the render layer indexes by position).
 *
 * Pilot initialization at tick > 0 is Lane A's (7e): a spawned pilot keeps
 * `pilotAssignmentFrom`'s seed, whose `nextRescoreS: 0` rescores on its
 * first tick.
 */
export function spawnInto<M>(parts: SpawnParts<M>, groupId: string): SpawnParts<M> {
  const m = parts.mission
  const group = m.held.find((g) => g.id === groupId)
  if (group === undefined) throw new Error(`spawnHeldGroup: no held group "${groupId}"`)
  if (m.spawned.includes(groupId)) throw new Error(`spawnHeldGroup: held group "${groupId}" has already spawned`)
  const aircraft = group.aircraft.map((a) => {
    const stamped = { ...a.state, tick: parts.tick }
    // 7h: a held airfield park (a takeoff pilot) sits on the terrain, not
    // on the placeholder height it was built with.
    const state = a.parked && parts.terrain != null
      ? { ...stamped, position: v3(stamped.position.x, heightAt(parts.terrain, stamped.position.x, stamped.position.z) + wheelDepthOf(a.spec, stamped), stamped.position.z) }
      : stamped
    return { ...a, state, previous: state }
  })
  const ships = group.ships.map((s) => {
    const state = { ...s.state, tick: parts.tick }
    return { ...s, state, previous: state }
  })
  const vehicles = (group.vehicles ?? []).map((v) => {
    const state = { ...v.state, tick: parts.tick }
    return { ...v, state, previous: state }
  })
  // E2: a spawned attacker is armed, like one the scenario starts with (scenario.ts); E3: and its wingmen.
  const everyone = [...parts.aircraft, ...aircraft]
  const armed = Object.fromEntries(aircraft.filter((a) => armedForAttack(a, everyone)).map((a) => [a.id, storesFromLoadout(a.spec, 'bombs')]))
  const fresh = createCombat(aircraft, armed, ships.map((s) => ({ id: s.id, hullHp: s.spec.hullHp })), [], 1944,
    vehicles.map((v) => ({ id: v.id, hp: v.spec.hp })))
  return {
    tick: parts.tick,
    aircraft: [...parts.aircraft, ...aircraft],
    ships: [...parts.ships, ...ships],
    vehicles: [...parts.vehicles, ...vehicles],
    combat: {
      ...parts.combat,
      aircraft: { ...parts.combat.aircraft, ...fresh.aircraft },
      ships: { ...parts.combat.ships, ...fresh.ships },
      vehicles: { ...parts.combat.vehicles, ...fresh.vehicles },
    },
    mission: { ...m, spawned: [...m.spawned, groupId] },
  }
}

/** `spawnInto` for a whole `World`: the entry point tests and Lane A's 7e
 *  use. Inside `advance`, triggers call `spawnInto` on the loop's locals. */
export function spawnHeldGroup<M>(world: World<M>, groupId: string): World<M> {
  if (world.mission === null) throw new Error('spawnHeldGroup: this world has no mission')
  const r = spawnInto({ tick: world.tick, aircraft: world.aircraft, ships: world.ships, vehicles: world.vehicles, combat: world.combat, mission: world.mission, terrain: world.terrain }, groupId)
  return { ...world, aircraft: r.aircraft, ships: r.ships, vehicles: r.vehicles, combat: r.combat, mission: r.mission }
}
