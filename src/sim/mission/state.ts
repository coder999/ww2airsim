import { DT } from '../flight/model.js'
import type { LandingAt, LandingTracking } from '../landing.js'
import type { AircraftEntity, EntityId, ShipEntity } from '../loop.js'
import type { Badge, Objective, Trigger } from './schema.js'

/**
 * A mission in flight (spec 2026-09-25 §1): the resolved definition, which
 * never changes, plus the progress `stepMission` advances once per tick.
 * Plain data, so a `World` holding it is still the whole flight under
 * `structuredClone` (tests/sim/mission/create.test.ts).
 *
 * Imports `loop.js` for TYPES only: loop.ts imports the mission step at
 * runtime, and `.dependency-cruiser.cjs`'s `no-circular` sees runtime edges.
 */

/** Far below one tick (1/60 s), far above float noise: 60 / DT is exactly
 *  3600 in IEEE doubles (measured 2026-09-25, node v22.22.1). */
const TICK_EPSILON = 1e-6

/** Whole ticks in `seconds`, rounded up (plan ruling R10). `hold` and
 *  `when.at` count ticks, not summed seconds: adding DT 10,800 times gives
 *  180.00000000003539 (measured 2026-09-25). `Math.max(0, …)` because
 *  `ceil(0 - TICK_EPSILON)` is -0, which is not `Object.is` 0. */
export const ticksFor = (seconds: number): number => Math.max(0, Math.ceil(seconds / DT - TICK_EPSILON))

export type ObjectiveStatus = 'inactive' | 'active' | 'complete' | 'failed'

export type ObjectiveState = {
  readonly status: ObjectiveStatus
  /** destroy: targets destroyed; protect: targets lost; land: landings
   *  counted. 0 for every other kind. */
  readonly count: number
  /** hold: ticks spent inside the station while active, accumulated
   *  (spec §0.9). 0 for every other kind. */
  readonly heldTicks: number
}

/** An objective with its `targets`/`hostiles` resolved to entity ids when
 *  the world was built. `[]` for kinds with no entity set. */
export type ResolvedObjective = Objective & { readonly resolved: readonly EntityId[] }

/** A held group's entities, built at world creation exactly as
 *  `worldFromScenario` builds start entities, at tick 0. `spawnInto`
 *  restamps the tick. Held aircraft are airborne (plan ruling R3), so
 *  nothing in them depends on when they spawn. */
export type HeldGroup<M> = {
  readonly id: string
  readonly aircraft: readonly AircraftEntity<M>[]
  readonly ships: readonly ShipEntity[]
}

/** One line of the mission's history, tick-stamped. The log is what M2's
 *  radio line and debrief read, and what the determinism test compares. */
export type MissionLogEntry =
  | { readonly tick: number; readonly kind: 'objective'; readonly id: string; readonly status: 'complete' | 'failed' }
  | { readonly tick: number; readonly kind: 'trigger'; readonly id: string }
  | { readonly tick: number; readonly kind: 'spawn'; readonly group: string }
  | { readonly tick: number; readonly kind: 'message'; readonly text: string }
  | {
      readonly tick: number
      readonly kind: 'landing'
      readonly at: LandingAt | null
      /** The first `land` objective this landing advanced, or `null`. */
      readonly advanced: string | null
      /** It advanced a `land` objective that is still incomplete (spec §2.4
       *  "Intermediate landings": a radio line, no debrief). */
      readonly intermediate: boolean
    }

export type MissionState<M> = {
  readonly scenarioId: string
  readonly objectives: readonly ResolvedObjective[]
  readonly triggers: readonly Trigger[]
  readonly badge: Badge | null
  readonly held: readonly HeldGroup<M>[]
  /** Parallel to `objectives`. */
  readonly progress: readonly ObjectiveState[]
  /** Trigger ids in the order they fired; each fires once (spec §2.2). */
  readonly fired: readonly string[]
  /** Held group ids in the order they spawned. */
  readonly spawned: readonly string[]
  /** The player's landing tracker, stepped per tick (plan ruling R1) and
   *  reset to `NO_LANDING` after each landing it records. */
  readonly recovery: LandingTracking
  readonly log: readonly MissionLogEntry[]
}

type Message = Extract<MissionLogEntry, { kind: 'message' }>
type Landing = Extract<MissionLogEntry, { kind: 'landing' }>

/** The radio line's source (plan ruling R7): every message, oldest first. */
export const radioMessages = <M>(m: MissionState<M>): readonly Message[] =>
  m.log.filter((e): e is Message => e.kind === 'message')

/** The most recent landing the mission recorded, if any. */
export function lastLanding<M>(m: MissionState<M>): Landing | undefined {
  for (let i = m.log.length - 1; i >= 0; i--) {
    const e = m.log[i]!
    if (e.kind === 'landing') return e
  }
  return undefined
}
