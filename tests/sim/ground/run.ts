import type { AircraftSpec } from '../../../src/sim/flight/schema.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'
import { DT, type AircraftState, type Controls } from '../../../src/sim/flight/model.js'
import { stepChecked } from '../../../src/sim/invariants.js'
import { restPitchRad, wheelDepthM } from '../../../src/sim/gearContact.js'
import { qFromAxisAngle } from '../../../src/sim/math/quat.js'
import { v3 } from '../../../src/sim/math/vec3.js'
import {
  FLAT_RUNWAY_FIELD,
  RUNWAY_HEIGHT_M,
  spawn,
  holdMass,
} from '../../../tools/testcards/measure.js'

/** Heading of the velocity vector in degrees (world +X is 0, positive to the right). */
export const headingDeg = (s: AircraftState): number =>
  (Math.atan2(-s.velocity.z, s.velocity.x) * 180) / Math.PI

export const speedOf = (s: AircraftState): number => Math.hypot(s.velocity.x, s.velocity.z)

export type Initial = {
  /** Nose-up pitch of the starting attitude; defaults to the derived rest pitch. */
  readonly pitchRad?: number
  /** Metres of air under the lowest wheel at the start; default 0 (resting). */
  readonly dropM?: number
  /** Forward speed along world +X; default 0. */
  readonly speedMps?: number
}

/**
 * Run a spec on the flat runway through the real `step`, with constant
 * controls, from an optional initial pitch, drop height and speed. Returns
 * every state.
 */
export function run(spec: AircraftSpec, controls: Controls, seconds: number, initial: Initial = {}) {
  const rest = restPitchRad(spec.gear)
  const pitch = initial.pitchRad ?? rest
  let s: AircraftState = {
    ...spawn(spec, RUNWAY_HEIGHT_M + wheelDepthM(spec.gear, pitch) + (initial.dropM ?? 0), initial.speedMps ?? 0),
    attitude: qFromAxisAngle(v3(0, 0, 1), pitch),
    gearFraction: 1,
  }
  const trace: AircraftState[] = [s]
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    s = holdMass(spec, stepChecked(spec, s, controls, { dt: DT, tick: i + 1, terrain: FLAT_RUNWAY_FIELD }))
    trace.push(s)
  }
  return { spec, trace, rest }
}

/** `run` for a shipped aircraft id, from rest at its rest attitude. */
export const taxi = (id: string, controls: Controls, seconds: number) =>
  run(loadAircraftSpec(id), controls, seconds)
