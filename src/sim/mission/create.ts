import { NO_LANDING } from '../landing.js'
import type { EntityId } from '../loop.js'
import type { Side } from '../sides.js'
import type { RespotOrder } from './respot.js'
import { NO_PASS } from './passes.js'
import type { Badge, FieldRule, Objective, Trigger } from './schema.js'
import type { HeldGroup, MissionState, ObjectiveState, ResolvedObjective } from './state.js'

/** Anything an objective may name: an aircraft or ship (start or held) or
 *  an airfield structure, with its group tags and side. */
export type Taggable = { readonly id: EntityId; readonly tags: readonly string[]; readonly side: Side; /** F10-0: what the entity is; `released` and `damage` need aircraft and ships. Optional so a fixture without it still builds. */ readonly kind?: 'aircraft' | 'ship' | 'vehicle' | 'structure' }

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
  readonly playerSide: Side
  readonly objectives: readonly Objective[]
  readonly triggers: readonly Trigger[]
  readonly badge: Badge | null
  readonly held: readonly HeldGroup<M>[]
  readonly entities: readonly Taggable[]
  readonly respot: RespotOrder | null
  readonly fieldRules?: readonly FieldRule[]
  /** The id of the `reach` objective that is the egress, or `null`/absent for a mission that ends on a landing. */
  readonly egress?: string | null
  readonly freezeOnSuccess?: boolean
}): MissionState<M> {
  const resolve = (where: string, refs: readonly string[]) => resolveRefs(input.scenarioId, where, refs, input.entities)
  const sideOfId = new Map(input.entities.map((e) => [e.id, e.side]))
  const kindOfId = new Map(input.entities.map((e) => [e.id, e.kind]))
  function requireCount(where: string, count: number | undefined, resolved: readonly EntityId[]): void {
    if (count !== undefined && count > resolved.length) {
      throw new Error(`scenario "${input.scenarioId}": ${where} asks for ${count} of ${resolved.length} targets`)
    }
  }
  function requireKind(where: string, ids: readonly EntityId[], want: 'aircraft' | 'ship'): void {
    for (const id of ids) {
      const kind = kindOfId.get(id)
      if (kind !== undefined && kind !== want) throw new Error(`scenario "${input.scenarioId}": ${where} names "${id}", which is a ${kind}, not a ${want}`)
    }
  }
  function requireSide(where: string, ids: readonly EntityId[], want: 'same' | 'opposite'): void {
    for (const id of ids) {
      const side = sideOfId.get(id)!
      const ok = want === 'same' ? side === input.playerSide : side !== input.playerSide
      if (!ok) {
        throw new Error(`scenario "${input.scenarioId}": ${where} names "${id}", which is ${side}; ` +
          (want === 'same' ? 'a protect target must be on the player\'s side' : 'a destroy target or deny hostile must be on the other side'))
      }
    }
  }
  const objectives: ResolvedObjective[] = input.objectives.map((o) => {
    const where = `objective "${o.id}"`
    switch (o.kind) {
      case 'destroy': {
        const resolved = resolve(where, o.targets)
        if (o.count !== undefined && o.count > resolved.length) {
          throw new Error(`scenario "${input.scenarioId}": ${where} asks for ${o.count} of ${resolved.length} targets`)
        }
        requireSide(where, resolved, 'opposite')
        return { ...o, resolved }
      }
      case 'protect': {
        const resolved = resolve(where, o.targets)
        requireSide(where, resolved, 'same')
        return { ...o, resolved }
      }
      case 'deny': {
        const resolved = resolve(where, o.hostiles)
        requireSide(where, resolved, 'opposite')
        return { ...o, resolved }
      }
      case 'arrive': {
        const resolved = resolve(where, o.targets)
        requireCount(where, o.count, resolved)
        return { ...o, resolved }
      }
      case 'released':
      case 'preventRelease': {
        const resolved = resolve(where, o.targets)
        requireKind(where, resolved, 'aircraft')
        requireCount(where, o.count, resolved)
        return { ...o, resolved }
      }
      case 'release': {
        if (o.targets === undefined) return { ...o, resolved: [] }
        const resolved = resolve(where, o.targets)
        requireKind(where, resolved, 'ship')
        return { ...o, resolved }
      }
      case 'drop': {
        const resolved = resolve(where, o.targets)
        requireKind(where, resolved, 'aircraft')
        requireCount(where, o.count, resolved)
        return { ...o, resolved }
      }
      case 'bundles': {
        const resolved = resolve(where, o.targets)
        requireKind(where, resolved, 'aircraft')
        return { ...o, resolved }
      }
      case 'damage': {
        const resolved = resolve(where, o.targets)
        requireKind(where, resolved, 'ship')
        requireSide(where, resolved, 'opposite')
        requireCount(where, o.count, resolved)
        return { ...o, resolved }
      }
      default: return { ...o, resolved: [] }
    }
  })
  // F10-0: the references a `gone` condition or a relative `hold` names.
  const refs: Record<string, readonly EntityId[]> = {}
  const addRefs = (where: string, names: readonly string[]): void => {
    for (const name of names) if (refs[name] === undefined) refs[name] = resolve(where, [name])
  }
  const whenRefs = (where: string, w: Trigger['when']): void => {
    if (!('gone' in w)) return
    addRefs(where, w.gone.targets)
    if (typeof w.gone.awayFrom === 'string') addRefs(where, [w.gone.awayFrom])
  }
  for (const o of input.objectives) {
    if (o.until !== undefined) whenRefs(`objective "${o.id}" until`, o.until)
    if (o.kind === 'hold' && o.relativeTo !== undefined) addRefs(`objective "${o.id}" relativeTo`, [o.relativeTo])
  }
  for (const t of input.triggers) whenRefs(`trigger "${t.id}"`, t.when)
  const fieldRules = (input.fieldRules ?? []).map((r) => ({ airfield: r.airfield, ids: resolve(`fieldRules for "${r.airfield}"`, r.structures), minFraction: r.minFraction }))
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
    respot: input.respot,
    pendingRespotTick: null,
    pass: NO_PASS,
    refs,
    fieldRules,
    ...(input.egress == null ? {} : { egress: input.egress }),
    ...(input.freezeOnSuccess === true ? { freezeOnSuccess: true as const } : {}),
  }
}
