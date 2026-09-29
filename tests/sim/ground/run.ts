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

/**
 * Run an airplane from rest at its derived rest attitude on the flat runway
 * through the real `step`, with constant controls. Returns every state.
 */
export function taxi(id: string, controls: Controls, seconds: number) {
  const spec = loadAircraftSpec(id)
  const rest = restPitchRad(spec.gear)
  let s: AircraftState = {
    ...spawn(spec, RUNWAY_HEIGHT_M + wheelDepthM(spec.gear, rest), 0),
    attitude: qFromAxisAngle(v3(0, 0, 1), rest),
    gearFraction: 1,
  }
  const trace: AircraftState[] = [s]
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    s = holdMass(spec, stepChecked(spec, s, controls, { dt: DT, tick: i + 1, terrain: FLAT_RUNWAY_FIELD }))
    trace.push(s)
  }
  return { spec, trace, rest }
}
