import { advance, createWorldOf, withControls, type AircraftEntity, type World } from '../../../src/sim/loop.js'
import { DT } from '../../../src/sim/flight/model.js'
import type { AircraftSpec } from '../../../src/sim/flight/schema.js'
import { createState, type Controls } from '../../../src/sim/flight/state.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { add, cross, normalize, scale, v3, type Vec3 } from '../../../src/sim/math/vec3.js'
import { controlsForDesiredVelocity } from '../../../src/sim/ai/controller.js'
import { controlsForLiftVector } from '../../../src/sim/ai/liftVector.js'
import { closureRateMps, pursuitDesiredVelocity, type PilotAssignment } from '../../../src/sim/ai/pursuit.js'
import { VETERAN_SKILL, initialDecision, type ManeuverName, type PilotSkill } from '../../../src/sim/ai/pilot.js'
import { heightAt, type TerrainField } from '../../../src/sim/world/terrain.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

/**
 * Canned geometries for the 7c maneuver signatures (spec §3.6): one AI pilot
 * in production `advance`, against a scripted aircraft. Each test asserts that
 * the maneuver was SELECTED and that its physical signature HAPPENED: two
 * different claims (7a's "fires" versus "hits" lesson).
 */
export function level(id: string, spec: AircraftSpec, position: Vec3, velocity: Vec3, pilot?: PilotAssignment): AircraftEntity<undefined> {
  const state = createState({ position, velocity, attitude: qFromAxisAngle(v3(0, 1, 0), Math.atan2(-velocity.z, velocity.x)) })
  // exactOptionalPropertyTypes rejects `pilot: undefined` against `pilot?:
  // PilotAssignment | null` (the field's own type doesn't list `undefined`),
  // so the key is omitted entirely rather than set to undefined.
  return {
    id, spec, state, previous: state, controls: { roll: 0, pitch: 0, yaw: 0, throttle: 0.7 }, assistMemory: undefined, impact: null, parked: false,
    ...(pilot !== undefined ? { pilot } : {}),
  }
}

export const pilotFor = (target: string, skill: PilotSkill, nextRescoreS = 0): PilotAssignment =>
  ({ target, skill, decision: { ...initialDecision(), nextRescoreS } })

/** A skill whose repertoire is exactly `names`, so a test isolates one maneuver. */
export const withRepertoire = (skill: PilotSkill, names: readonly ManeuverName[]): PilotSkill => ({ ...skill, repertoire: names })

export type ScriptedFlight = (self: AircraftEntity<undefined>, world: World<undefined>) => Controls
export const straight: ScriptedFlight = () => ({ roll: 0, pitch: 0, yaw: 0, throttle: 0.7 })

/** A sustained level turn at `n` g, left (-1) or right (+1). */
export const levelTurn = (n: number, side: 1 | -1): ScriptedFlight => (a) => {
  const right = normalize(cross(a.state.velocity, v3(0, 1, 0)))
  const lift = add(v3(0, 1, 0), scale(right, side * Math.sqrt(Math.max(0, n * n - 1))))
  return controlsForLiftVector(a.state, a.spec, lift, n, 1)
}

/** A target that holds `heightM` above the highest ground on its straight +x
 *  track over the next `lookaheadS`, flying at `speedMps`, so it climbs
 *  before rising ground rather than into it (7c Task 15's low chase). With `terrain` null
 *  the ground is the sea. A scripted player: `level()` alone, hands-off, sinks
 *  (a Hellcat from 150 m reaches -52 m in 90 s, measured 2026-09-26). */
export const holdHeight = (heightM: number, terrain: TerrainField | null = null, lookaheadS = 6, speedMps = 110): ScriptedFlight => (a) => {
  const p = a.state.position
  let ground = 0
  for (let s = 0; s <= lookaheadS && terrain !== null; s += 2) ground = Math.max(ground, heightAt(terrain, p.x + speedMps * s, p.z))
  const vy = Math.min(15, Math.max(-8, ground + heightM - p.y))
  const c = controlsForDesiredVelocity(a.state, a.spec, v3(Math.sqrt(speedMps * speedMps - vy * vy), vy, 0))
  return vy > 2 ? { ...c, throttle: 1 } : c
}

/** Lead pursuit of `targetId`, never firing: a scripted attacker. */
export const chase = (targetId: string): ScriptedFlight => (a, w) =>
  controlsForDesiredVelocity(a.state, a.spec, pursuitDesiredVelocity(a, w.aircraft.find((x) => x.id === targetId)!))

/** Advance `seconds`, applying each scripted aircraft's controls before
 *  every tick. `onTick` sees the world after each tick. */
export function runCanned(
  world: World<undefined>, scripts: Readonly<Record<string, ScriptedFlight>>, seconds: number,
  onTick: (w: World<undefined>) => void,
): World<undefined> {
  let w = world
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    for (const [id, script] of Object.entries(scripts)) {
      w = withControls(w, id, script(w.aircraft.find((a) => a.id === id)!, w))
    }
    w = advance(w, DT).world
    onTick(w)
  }
  return w
}

/** Spec §3.5's closure, the rate the range is shrinking (production's
 *  `closureRateMps`, live state on both sides). Not 7b's `closingRate`,
 *  which reads only our own velocity along the line of sight. */
export const closureOf = (self: AircraftEntity<undefined>, other: AircraftEntity<undefined>): number => closureRateMps(self, other)

export const headingChangeRad = (from: number, to: number): number => Math.abs(Math.atan2(Math.sin(to - from), Math.cos(to - from)))

export const BREAK_SET: readonly ManeuverName[] = ['lead-pursuit', 'defensive-break', 'scissors', 'split-s', 'extend']

/** A veteran F6F at 110 m/s with a faster Hellcat 250 m dead astern, nose on:
 *  Break (the threat's nose is on us), threat astern, 3,000 m up, below
 *  0.6 x 216 m/s. No scissors: the threat is above its 120 m/s corner speed. */
export function splitSWorld(): World<undefined> {
  const f6f = loadAircraftSpec('f6f-hellcat')
  return createWorldOf({
    aircraft: [
      level('p', f6f, v3(0, 3000, 0), v3(110, 0, 0), pilotFor('t', withRepertoire(VETERAN_SKILL, BREAK_SET))),
      level('t', f6f, v3(-250, 3000, 0), v3(130, 0, 0)),
    ],
    player: 't',
  })
}
