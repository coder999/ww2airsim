import { parseScenario, worldFromScenario } from '../../../src/sim/scenario.js'
import { aircraftById, type World } from '../../../src/sim/loop.js'
import { stationErrorM } from '../../../src/sim/ai/formation.js'
import type { FormationSlot } from '../../../src/sim/ai/pilot.js'
import { bundleForScenario } from '../../../tools/content/load.js'
import { runCanned, type ScriptedFlight } from './maneuverWorlds.js'
import { controlsForDesiredVelocity } from '../../../src/sim/ai/controller.js'
import { length, v3 } from '../../../src/sim/math/vec3.js'

/**
 * 7f's Tier 1 worlds (spec, Acceptance): raw scenario JSON, parsed, so every
 * case also exercises the content path. Inline; nothing ships. The sea is
 * the ground (terrain null).
 */
export const PLAYER_EAST = { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [0, 3000, 0], headingDeg: 90, speedMps: 120 } }
export const PLAYER_FAR = { id: 'f6f-1', spec: 'f6f-hellcat', airborneAt: { position: [60000, 3000, 60000], headingDeg: 90, speedMps: 120 } }

export const wingman = (id: string, leader: string, slot: FormationSlot, position: readonly [number, number, number],
  side: 'allied' | 'axis' = 'allied', skill: 'green' | 'veteran' = 'veteran', speedMps = 120) =>
  ({ id, spec: 'f6f-hellcat', side, airborneAt: { position, headingDeg: 90, speedMps }, pilot: { skill, leader, slot } })

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

/** The leader script's bank per radian of heading error: the gain inside
 *  `controlsForDesiredVelocity` (1.6), so a heading offset of bank / 1.6
 *  asks for the bank. */
const LEADER_BANK_PER_HEADING_ERROR = 1.6
/** The leader script's throttle law, base + gain x (speed deficit). Measured
 *  2026-09-27 on a lone leader (`.superpowers/7f/r2leader.ts`, 20 s level
 *  then 60 and 120 s in a 30-degree right turn at 110 m/s, 3,000 m): base
 *  0.5 settled 106.4 m/s in the turn, base 0.65 109.4 m/s; with 0.65 the
 *  level speed settles 109.7 m/s. */
const LEADER_THROTTLE_BASE = 0.65
const LEADER_THROTTLE_GAIN = 0.05
/** The leader script's climb command is clamped to this, m/s. At 10 the lone
 *  leader climbed 79 m in 60 s of the turn (the controller's pitch loop reads
 *  part of a banked heading error as climb); at 20 it holds within 13 m for
 *  120 s (measured 2026-09-27, `.superpowers/7f/r2leader.ts`). */
const LEADER_MAX_CLIMB_MPS = 20

/** A scripted formation leader: `speedMps` and `heightM` held, and, with
 *  `bankDeg` non-zero, a steady turn at that bank (positive right). It flies
 *  `controlsForDesiredVelocity` toward its own horizontal heading, rotated
 *  far enough ahead that the controller asks for `bankDeg`. Written for 7f
 *  because `levelTurn(1.155, 1)` stalls a lone Hellcat within 60 s (3,000 m
 *  -> 4,355 m, 120 -> 34 m/s, measured 2026-09-27, Task 3's probe7) and
 *  `holdHeight` lets speed drift (its throttle is the controller's own law:
 *  asked for 110 m/s, a Hellcat settles at ~128 m/s, measured 2026-09-27).
 *  Verified alone by `formationFlight.test.ts`'s first case. */
export const formationLeader = (speedMps: number, heightM: number, bankDeg: number): ScriptedFlight => (a) => {
  const v = a.state.velocity
  const heading = Math.atan2(v.z, v.x) + (bankDeg * Math.PI / 180) / LEADER_BANK_PER_HEADING_ERROR
  const vy = Math.min(LEADER_MAX_CLIMB_MPS, Math.max(-LEADER_MAX_CLIMB_MPS, heightM - a.state.position.y))
  const h = Math.sqrt(speedMps * speedMps - vy * vy)
  const c = controlsForDesiredVelocity(a.state, a.spec, v3(h * Math.cos(heading), vy, h * Math.sin(heading)))
  return { ...c, throttle: Math.min(1, Math.max(0.2, LEADER_THROTTLE_BASE + LEADER_THROTTLE_GAIN * (speedMps - length(v)))) }
}
