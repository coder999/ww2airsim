/**
 * The aircraft each non-campaign mission offers (plan F5B, Mark 2026-10-15). One table, `content/campaign/
 * mission-aircraft.json`, read by BOTH the catalog (so the reducer accepts exactly these) and Form 5 (so the form
 * offers exactly these): they agree by construction, not by two lists kept in step.
 */
import data from '../../../content/campaign/mission-aircraft.json'
import type { MissionDescriptor } from '../../campaign/index.js'
import { aircraftFor, type FlowContext } from '../sortieFlow.js'
import type { FlyableAircraft } from '../sortie/flyable.js'

export const MISSION_AIRCRAFT: Readonly<Record<string, readonly string[]>> = data.missions

/** The offered list for a mission id, or `null` for a row that has none (a range, a qualification, a dev bed). */
export const missionAircraft = (id: string): readonly string[] | null => MISSION_AIRCRAFT[id] ?? null

/** The catalog with each listed mission's `aircraftIds` replaced by its authored list. Unlisted descriptors pass through. */
export const withMissionAircraft = (catalog: readonly MissionDescriptor[]): MissionDescriptor[] =>
  catalog.map((m) => ({ ...m, aircraftIds: missionAircraft(m.id) ?? m.aircraftIds }))

/**
 * What Form 5 offers: the sortie rules' aircraft (`aircraftFor`) restricted to the mission's list. Dev lifts the
 * restriction (every airplane the sortie rules allow, shown with the rest), and a row with no list is unrestricted.
 */
export function formAircraft(ctx: FlowContext, scenarioId: string): readonly FlyableAircraft[] {
  const all = aircraftFor(ctx, scenarioId)
  const list = missionAircraft(scenarioId)
  return ctx.dev || list === null ? all : all.filter((f) => list.includes(f.spec.id))
}
