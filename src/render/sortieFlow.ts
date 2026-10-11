import type { Loadout } from '../sim/weapons/stores.js'
import { eligibleAircraft, eligibleLoadouts, needsDevStores } from '../sim/sortie.js'
import type { ScenarioOption } from './titleScreen.js'
import type { FlyableAircraft } from './sortie/flyable.js'

/**
 * What Forms 2-4 offer and what resets when an earlier choice changes
 * (sortie spec, "Navigation", A3; rulings SF-R4 and SF-R5). Pure, so the
 * Node suite pins every reset; titleScreen.ts only draws the draft.
 */
export const DEFAULT_LOADOUT: Loadout = 'both'
export type SortieDraft = { readonly scenarioId: string; readonly aircraftSpec: string; readonly loadout: Loadout }
export type FlowContext = { readonly options: readonly ScenarioOption[]; readonly flyable: readonly FlyableAircraft[]; readonly dev: boolean }

const option = (ctx: FlowContext, id: string): ScenarioOption => {
  const o = ctx.options.find((x) => x.value === id)
  if (o === undefined) throw new Error(`sortie: unknown scenario ${id}`)
  return o
}
const specOf = (ctx: FlowContext, id: string) => {
  const f = ctx.flyable.find((x) => x.spec.id === id)
  if (f === undefined) throw new Error(`sortie: unknown aircraft ${id}`)
  return f.spec
}

export const visibleScenarios = (ctx: FlowContext): readonly ScenarioOption[] => ctx.options.filter((o) => ctx.dev || !o.dev)

export function aircraftFor(ctx: FlowContext, scenarioId: string): readonly FlyableAircraft[] {
  const allowed = new Set(eligibleAircraft(ctx.flyable.map((f) => f.spec), option(ctx, scenarioId).start, ctx.dev).map((s) => s.id))
  return ctx.flyable.filter((f) => allowed.has(f.spec.id))
}

export const loadoutsFor = (ctx: FlowContext, specId: string): readonly Loadout[] => eligibleLoadouts(specOf(ctx, specId), ctx.dev)

/** SF-R4: the recommendation if allowed, else 'both' if allowed, else 'clean' (always allowed). */
export function defaultLoadout(ctx: FlowContext, scenarioId: string, specId: string): Loadout {
  const allowed = loadoutsFor(ctx, specId)
  const rec = option(ctx, scenarioId).recommendedLoadout
  if (rec !== undefined && allowed.includes(rec)) return rec
  return allowed.includes(DEFAULT_LOADOUT) ? DEFAULT_LOADOUT : 'clean'
}

/**
 * The hidden boot world historically uses Both until the player reaches the
 * sortie forms. Preserve that for aircraft which can carry it, but never ask
 * a racks-only aircraft to boot an illegal loadout. In that case the same
 * recommendation/fallback policy as Form 4 supplies a legal world.
 */
export function bootLoadout(ctx: FlowContext, scenarioId: string, specId: string): Loadout {
  return loadoutsFor(ctx, specId).includes(DEFAULT_LOADOUT)
    ? DEFAULT_LOADOUT
    : defaultLoadout(ctx, scenarioId, specId)
}

export function initialDraft(ctx: FlowContext, scenarioId: string): SortieDraft {
  const aircraftSpec = option(ctx, scenarioId).aircraft
  return { scenarioId, aircraftSpec, loadout: defaultLoadout(ctx, scenarioId, aircraftSpec) }
}

/** A mission change resets the aircraft (SF-R5) and the loadout (A3). */
export const withScenario = (ctx: FlowContext, scenarioId: string): SortieDraft => initialDraft(ctx, scenarioId)

/** An aircraft change keeps the pilot's loadout if the new aircraft allows it (A3). */
export function withAircraft(ctx: FlowContext, draft: SortieDraft, specId: string): SortieDraft {
  const keep = loadoutsFor(ctx, specId).includes(draft.loadout)
  return { ...draft, aircraftSpec: specId, loadout: keep ? draft.loadout : defaultLoadout(ctx, draft.scenarioId, specId) }
}

/** After Dev changes: each stage, in order, falls back if no longer offered.
 *  The same object when nothing needs to change. */
export function reconcile(ctx: FlowContext, draft: SortieDraft, fallbackScenarioId: string): SortieDraft {
  if (!visibleScenarios(ctx).some((o) => o.value === draft.scenarioId)) return initialDraft(ctx, fallbackScenarioId)
  const aircraftOk = aircraftFor(ctx, draft.scenarioId).some((f) => f.spec.id === draft.aircraftSpec)
  const d = aircraftOk ? draft : { ...draft, aircraftSpec: option(ctx, draft.scenarioId).aircraft }
  const loadoutOk = loadoutsFor(ctx, d.aircraftSpec).includes(d.loadout)
  if (aircraftOk && loadoutOk) return draft
  return loadoutOk ? d : { ...d, loadout: defaultLoadout(ctx, d.scenarioId, d.aircraftSpec) }
}

/** Form 4's mark for a Dev loadout the aircraft has no stations for (sortie spec, Form 4). */
export function devLayoutNote(ctx: FlowContext, specId: string, loadout: Loadout): string | null {
  return ctx.dev && needsDevStores(specOf(ctx, specId), loadout) ? 'dev layout: Hellcat stations' : null
}
