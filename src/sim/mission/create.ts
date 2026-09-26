import { NO_LANDING } from '../landing.js'
import type { EntityId } from '../loop.js'
import type { Badge, Objective, Trigger } from './schema.js'
import type { HeldGroup, MissionState, ObjectiveState, ResolvedObjective } from './state.js'

/** Anything an objective may name: an aircraft or ship (start or held) or
 *  an airfield structure, with its group tags. */
export type Taggable = { readonly id: EntityId; readonly tags: readonly string[] }

/**
 * `refs` (entity ids and/or tags) to entity ids, deduplicated in first-seen
 * order. Throws, naming the scenario and the string, for a string that
 * matches nothing (spec §2.1: "a parse error, not a silent empty set") or
 * that is both an id and a tag (Review Focus 2).
 */
export function resolveRefs(scenarioId: string, where: string, refs: readonly string[], entities: readonly Taggable[]): EntityId[] {
  const out: EntityId[] = []
  for (const ref of refs) {
    const byId = entities.some((e) => e.id === ref)
    const byTag = entities.filter((e) => e.tags.includes(ref)).map((e) => e.id)
    if (byId && byTag.length > 0) throw new Error(`scenario "${scenarioId}": ${where} names "${ref}", which is both an entity id and a tag`)
    const hits = byId ? [ref] : byTag
    if (hits.length === 0) throw new Error(`scenario "${scenarioId}": ${where} names "${ref}", which matches no entity id or tag`)
    for (const h of hits) if (!out.includes(h)) out.push(h)
  }
  return out
}

export function createMission<M>(input: {
  readonly scenarioId: string
  readonly objectives: readonly Objective[]
  readonly triggers: readonly Trigger[]
  readonly badge: Badge | null
  readonly held: readonly HeldGroup<M>[]
  readonly entities: readonly Taggable[]
}): MissionState<M> {
  const resolve = (where: string, refs: readonly string[]) => resolveRefs(input.scenarioId, where, refs, input.entities)
  const objectives: ResolvedObjective[] = input.objectives.map((o) => {
    const where = `objective "${o.id}"`
    switch (o.kind) {
      case 'destroy': {
        const resolved = resolve(where, o.targets)
        if (o.count !== undefined && o.count > resolved.length) {
          throw new Error(`scenario "${input.scenarioId}": ${where} asks for ${o.count} of ${resolved.length} targets`)
        }
        return { ...o, resolved }
      }
      case 'protect': return { ...o, resolved: resolve(where, o.targets) }
      case 'deny': return { ...o, resolved: resolve(where, o.hostiles) }
      default: return { ...o, resolved: [] }
    }
  })
  return {
    scenarioId: input.scenarioId,
    objectives,
    triggers: input.triggers,
    badge: input.badge,
    held: input.held,
    // Annotated: without it the literal widens to `string` inside `map`.
    progress: objectives.map((o): ObjectiveState => ({ status: o.after === undefined ? 'active' : 'inactive', count: 0, heldTicks: 0 })),
    fired: [],
    spawned: [],
    recovery: NO_LANDING,
    log: [],
  }
}
