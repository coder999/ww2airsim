import { createCombat, type CombatState } from '../weapons/combat.js'
import type { AircraftEntity, ShipEntity, World } from '../loop.js'
import type { MissionState } from './state.js'

/** The slice of a world a spawn changes. `advance` holds these as loop
 *  locals between steps, which is why the spawn works on them rather than on
 *  a `World` (plan ruling R5). */
export type SpawnParts<M> = {
  readonly tick: number
  readonly aircraft: readonly AircraftEntity<M>[]
  readonly ships: readonly ShipEntity[]
  readonly combat: CombatState
  readonly mission: MissionState<M>
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
    const state = { ...a.state, tick: parts.tick }
    return { ...a, state, previous: state }
  })
  const ships = group.ships.map((s) => {
    const state = { ...s.state, tick: parts.tick }
    return { ...s, state, previous: state }
  })
  const fresh = createCombat(aircraft, {}, ships.map((s) => ({ id: s.id, hullHp: s.spec.hullHp })), [])
  return {
    tick: parts.tick,
    aircraft: [...parts.aircraft, ...aircraft],
    ships: [...parts.ships, ...ships],
    combat: {
      ...parts.combat,
      aircraft: { ...parts.combat.aircraft, ...fresh.aircraft },
      ships: { ...parts.combat.ships, ...fresh.ships },
    },
    mission: { ...m, spawned: [...m.spawned, groupId] },
  }
}

/** `spawnInto` for a whole `World`: the entry point tests and Lane A's 7e
 *  use. Inside `advance`, triggers call `spawnInto` on the loop's locals. */
export function spawnHeldGroup<M>(world: World<M>, groupId: string): World<M> {
  if (world.mission === null) throw new Error('spawnHeldGroup: this world has no mission')
  const r = spawnInto({ tick: world.tick, aircraft: world.aircraft, ships: world.ships, combat: world.combat, mission: world.mission }, groupId)
  return { ...world, aircraft: r.aircraft, ships: r.ships, combat: r.combat, mission: r.mission }
}
