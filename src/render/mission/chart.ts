import type { EntityId, World } from '../../sim/loop.js'
import { isDestroyed } from '../../sim/mission/step.js'
import type { MissionState, ObjectiveStatus } from '../../sim/mission/state.js'
import type { Vec3 } from '../../sim/math/vec3.js'
import type { MapPoint } from '../missionMap.js'

/**
 * The navigation chart's objective layer (M2 Task 7; spec §5). Pure: it
 * only reads `World`/`MissionState` and hands back the plain marks and rows
 * `missionMap.ts` draws. It names no coordinate literal, matching
 * `mapPoints`'s own docstring.
 *
 * `isDestroyed` is M1's (`src/sim/mission/step.ts`, ruling R13), reused
 * rather than copied so the chart and the engine cannot disagree about what
 * "destroyed" means; it takes only the fields it reads (a `Pick` of
 * `combat` and `aircraft`), which a `World` has, rather than the full
 * `MissionTick` `stepMission` uses (that type also demands `decks`,
 * `airfields` and `terrain`, none of which `isDestroyed` reads, and `World`
 * has no `decks`).
 */

const STATUS_LABEL: Record<ObjectiveStatus, 'ACTIVE' | 'COMPLETE' | 'FAILED' | 'PENDING'> = {
  inactive: 'PENDING',
  active: 'ACTIVE',
  complete: 'COMPLETE',
  failed: 'FAILED',
}

/** The chart's OBJECTIVES list model: every objective, in file order, with
 *  its current status. `null` (no mission) gives `[]`. */
export function objectiveRows<M>(
  m: MissionState<M> | null,
): readonly { readonly label: string; readonly priority: 'primary' | 'secondary'; readonly status: 'ACTIVE' | 'COMPLETE' | 'FAILED' | 'PENDING' }[] {
  if (m === null) return []
  return m.objectives.map((o, i) => ({ label: o.label, priority: o.priority, status: STATUS_LABEL[m.progress[i]!.status] }))
}

/** True while `id` has a combat record: present in the world, spawned or
 *  starting, whether or not it has since been destroyed (mirrors
 *  `step.ts`'s own, unexported, `isPresent`). An unspawned held entity has
 *  no record at all. */
function isPresent<M>(world: World<M>, id: EntityId): boolean {
  return world.combat.aircraft[id] !== undefined || world.combat.ships[id] !== undefined || world.combat.structures[id] !== undefined
}

/** The live position of an aircraft or ship, or `null` if it is not in the
 *  world (mirrors `step.ts`'s own, unexported, `positionOf`). */
function positionOf<M>(world: World<M>, id: EntityId): Vec3 | null {
  return world.aircraft.find((a) => a.id === id)?.state.position ?? world.ships.find((s) => s.id === id)?.state.position ?? null
}

export type ObjectiveMarks = {
  /** Present, undestroyed entities a `destroy`/`deny` objective is after, or
   *  a `protect` objective is guarding. Keyed by the SAME id `mapPoints`
   *  gives its aircraft and ship points their `aircraft:`/`ship:` prefix
   *  from, so `missionMap.ts` looks each one up by bare entity id. */
  readonly targets: ReadonlyMap<string, 'destroy' | 'protect'>
  /** `reach`/`hold` waypoints and `deny` rings, as chart points in their own
   *  right (nothing else in `mapPoints` already draws one). */
  readonly stations: readonly MapPoint[]
  /** Structure targets: `mapPoints` never lists `world.structures`, so a
   *  structure named by `destroy`/`protect`/`deny` needs its own point. */
  readonly structures: readonly MapPoint[]
}

/** Every active objective's targets and stations, read off a live world
 *  (spec §5). `world.mission === null` gives empty collections, so a plain
 *  flight's chart is unaffected. */
export function objectiveMarks<M>(world: World<M>): ObjectiveMarks {
  const targets = new Map<string, 'destroy' | 'protect'>()
  const stations: MapPoint[] = []
  const structures: MapPoint[] = []
  const seenStructures = new Set<string>()
  const structureById = new Map(world.structures.map((s) => [s.id, s]))

  const mark = (id: EntityId, kind: 'destroy' | 'protect'): void => {
    if (!isPresent(world, id) || isDestroyed({ combat: world.combat, aircraft: world.aircraft }, id)) return
    const structure = structureById.get(id)
    if (structure !== undefined) {
      if (seenStructures.has(id)) return
      seenStructures.add(id)
      structures.push({
        id: `structure:${id}`,
        kind: 'structure',
        label: id,
        x: structure.position.x,
        z: structure.position.z,
        targetable: true,
        objective: kind,
      })
      return
    }
    targets.set(id, kind)
  }

  const mission = world.mission
  if (mission === null) return { targets, stations, structures }

  mission.objectives.forEach((o, i) => {
    if (mission.progress[i]!.status !== 'active') return
    switch (o.kind) {
      case 'destroy':
        for (const id of o.resolved) mark(id, 'destroy')
        break
      case 'protect':
        for (const id of o.resolved) mark(id, 'protect')
        break
      case 'deny': {
        for (const id of o.resolved) mark(id, 'destroy')
        const center = typeof o.around === 'string' ? positionOf(world, o.around) : o.around
        if (center !== null) {
          stations.push({
            id: `station:${o.id}`,
            kind: 'station',
            label: o.label,
            x: center.x,
            z: center.z,
            targetable: false,
            objective: 'station',
            radiusM: o.radiusM,
          })
        }
        break
      }
      case 'reach':
      case 'hold':
        stations.push({
          id: `station:${o.id}`,
          kind: 'station',
          label: o.label,
          x: o.point.x,
          z: o.point.z,
          targetable: true,
          objective: 'station',
          radiusM: o.radiusM,
        })
        break
      default:
        break
    }
  })

  return { targets, stations, structures }
}
