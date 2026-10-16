/**
 * Pure rules for launching a sortie from the headquarters (plan F5B Task 8): which aircraft the assigned pilot
 * may take, when an authored night mission locks the takeoff hour, and whether a Dev takeoff time was chosen.
 * No DOM; the sortie forms and the shell call these.
 */
import { describeAircraft, eligibility, isNightHour, type Campaign, type MissionDescriptor } from '../../campaign/index.js'
import { DEV_TAKEOFF_HOURS } from '../sky/sun.js'
import { rankShort } from './model.js'

export type AircraftGate = { readonly ok: true } | { readonly ok: false; readonly text: string }

/**
 * The gate Form 5 applies to each aircraft. A scored row enforces `eligibility` (rank, advanced aircraft, night,
 * coordinated); an unscored row (Training, Single Missions, no descriptor) enforces nothing (assumption A2).
 */
export function aircraftGate(c: Campaign, mission: MissionDescriptor | null, pilotId: string, enforce: boolean): (specId: string) => AircraftGate {
  const pilot = c.pilots[pilotId]
  return (specId) => {
    if (!enforce || mission === null || pilot === undefined) return { ok: true }
    const e = eligibility(pilot, mission, describeAircraft(specId), c.faction)
    return e.ok ? { ok: true } : { ok: false, text: `Needs ${rankShort(c.faction, e.needTier)}` }
  }
}

/**
 * A mission authored at night (a night chapter, or a test bed such as Night Range at 21:00) is flown at its authored
 * hour only: Form 4's Morning, Midday and Dusk would turn it into day, and its authored lights would not be lit.
 * A day mission keeps the three choices.
 */
export const takeoffLockHour = (mission: MissionDescriptor | null, scenarioHour: number | null): number | null =>
  mission !== null && mission.night ? scenarioHour ?? 21 : scenarioHour !== null && isNightHour(scenarioHour) ? scenarioHour : null

/** Late dusk and night are Dev-only takeoff times (F6A); choosing one makes the sortie unscored. */
export const isDevTakeoffHour = (hour: number | undefined): boolean =>
  hour !== undefined && (Object.values(DEV_TAKEOFF_HOURS) as number[]).includes(hour)
