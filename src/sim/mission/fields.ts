import { airfieldHeldBy, playerSideOf } from '../friendly.js'
import type { Side } from '../sides.js'
import type { StructureEntity } from '../weapons/structures.js'
import type { CombatState } from '../weapons/combat.js'
import type { Airfield } from '../world/airfields.js'
import type { EntityId } from '../loop.js'
import type { MissionState } from './state.js'

/**
 * F10-0 mutable airfield state. A field's serviceability and side are content constants until a mission says otherwise: a trigger's
 * `setServiceable` / `setSide` overrides them, and a `fieldRules` entry derives serviceability from the field's own structures. Every
 * mission-time reader (the recovery rule, `land.requires`, the `field` objective) goes through here, so the three agree.
 * A mission with none of these reads exactly the content's values.
 */
export type FieldReads = {
  readonly airfields: readonly Airfield[]
  readonly structures: readonly Pick<StructureEntity, 'airfield' | 'side'>[]
  readonly combat: Pick<CombatState, 'structures'>
}

export type FieldState = { readonly serviceable: boolean; readonly side: Side }

/** The living share of a rule's structures (a structure with no combat record counts as alive). */
function aliveFraction(ids: readonly EntityId[], combat: FieldReads['combat']): number {
  if (ids.length === 0) return 1
  return ids.filter((id) => combat.structures[id]?.destroyedTick == null).length / ids.length
}

export function fieldState<M>(m: Pick<MissionState<M>, 'fields' | 'fieldRules'>, t: FieldReads, id: string): FieldState {
  const airfield = t.airfields.find((a) => a.id === id)
  const override = m.fields?.[id]
  const rule = m.fieldRules.find((r) => r.airfield === id)
  const serviceable = override?.serviceable
    ?? (rule === undefined ? airfield?.serviceable !== false : aliveFraction(rule.ids, t.combat) >= rule.minFraction && airfield?.serviceable !== false)
  const side = override?.side ?? (airfield === undefined ? 'axis' : airfieldHeldBy(t, airfield))
  return { serviceable, side }
}

/** Whether the field is serviceable and held by the given party relative to the player (`player` = the player's side). */
export function fieldMeets<M>(
  m: Pick<MissionState<M>, 'fields' | 'fieldRules'>, t: FieldReads & { readonly player: string; readonly aircraft: Parameters<typeof playerSideOf>[0]['aircraft'] },
  id: string, want: { readonly serviceable: boolean; readonly heldBy?: 'player' | 'enemy' | undefined },
): boolean {
  const state = fieldState(m, t, id)
  if (state.serviceable !== want.serviceable) return false
  if (want.heldBy === undefined) return true
  const mine = playerSideOf(t) === state.side
  return want.heldBy === 'player' ? mine : !mine
}

/**
 * The airfields and structures as the mission sees them right now, for the friendly-base rule: serviceability and side with the
 * overrides and rules applied. The same objects come back when the mission has none.
 */
export function effectiveFields<M>(m: Pick<MissionState<M>, 'fields' | 'fieldRules'>, t: FieldReads): { airfields: readonly Airfield[]; structures: FieldReads['structures'] } {
  if (m.fields === undefined && m.fieldRules.length === 0) return { airfields: t.airfields, structures: t.structures }
  const states = new Map(t.airfields.map((a) => [a.id, fieldState(m, t, a.id)]))
  return {
    airfields: t.airfields.map((a) => {
      const st = states.get(a.id)!
      return st.serviceable === (a.serviceable !== false) && st.side === (a.side ?? 'axis') ? a : { ...a, serviceable: st.serviceable, side: st.side }
    }),
    structures: t.structures.map((s) => {
      const side = m.fields?.[s.airfield]?.side
      return side === undefined || side === s.side ? s : { ...s, side }
    }),
  }
}
