import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { aircraftById, type World } from '../../../src/sim/loop.js'
import { stationErrorM } from '../../../src/sim/ai/formation.js'
import type { FormationSlot } from '../../../src/sim/ai/pilot.js'
import { bundleForScenario } from '../../../tools/content/load.js'
import { runCanned, type ScriptedFlight } from './maneuverWorlds.js'

/**
 * 7f's Tier 1 worlds (spec, Acceptance): raw scenario JSON, parsed, so every
 * case also exercises the content path. Inline; nothing ships. The sea is
 * the ground (terrain null).
 */
export const PLAYER_EAST = { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 } }
export const PLAYER_FAR = { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [60000, 3000, 60000], headingDeg: 90, speedMps: 120 } }

export const wingman = (id: string, leader: string, slot: FormationSlot, position: readonly [number, number, number],
  side: 'allied' | 'axis' = 'allied', skill: 'green' | 'veteran' = 'veteran') =>
  ({ id, spec: 'f6f-hellcat', side, airborneAt: { position, headingDeg: 90, speedMps: 120 }, pilot: { skill, leader, slot } })

export function buildFormation(aircraft: unknown[], extra: Record<string, unknown> = {}): World<undefined> {
  return worldFromScenario(bundleForScenario(parseScenario({
    id: 'formation-test', player: 'f6f-1', airfields: ['tacloban'], aircraft, ships: [], weather: { windFromDeg: 0, windMps: 0 }, ...extra,
  })), null)
}

/** RMS of the wingman's station error over [fromS, seconds]. */
export function rmsStationError(world: World<undefined>, scripts: Readonly<Record<string, ScriptedFlight>>, seconds: number,
  id: string, leaderId: string, slot: FormationSlot, fromS: number): { rms: number; world: World<undefined> } {
  let sum = 0
  let n = 0
  let t = 0
  const end = runCanned(world, scripts, seconds, (w) => {
    t += 1 / 60
    if (t < fromS) return
    const e = stationErrorM(aircraftById(w, id)!, aircraftById(w, leaderId)!, slot)
    sum += e * e
    n++
  })
  return { rms: Math.sqrt(sum / Math.max(1, n)), world: end }
}
