import { attitudeAngles } from './flight/attitude.js'
import type { AircraftSpec } from './flight/schema.js'
import type { AircraftState } from './flight/state.js'

export type GearSpec = AircraftSpec['gear']

const depthBelowOriginM = (xM: number, heightM: number, pitchRad: number): number =>
  heightM * Math.cos(pitchRad) - xM * Math.sin(pitchRad)

/** Nose-up pitch, radians, at which both the main wheels and the third wheel
 *  touch level ground; negative for a nose wheel on a shorter leg. Throws on a
 *  layout whose wheels share an x, which has no such angle. */
export function restPitchRad(gear: GearSpec): number {
  const run = gear.mainX - gear.thirdX
  if (run === 0) throw new Error('gear.mainX and gear.thirdX must differ')
  return Math.atan((gear.heightM - gear.thirdHeightM) / run)
}

/** Metres from the body origin down to the lowest wheel, with the body pitched
 *  nose-up by `pitchRad`. The lowest wheel is the one carrying the airplane. */
export function wheelDepthM(gear: GearSpec, pitchRad: number): number {
  return Math.max(
    depthBelowOriginM(gear.mainX, gear.heightM, pitchRad),
    depthBelowOriginM(gear.thirdX, gear.thirdHeightM, pitchRad),
  )
}

export function wheelDepthOf(spec: AircraftSpec, state: AircraftState): number {
  return wheelDepthM(spec.gear, attitudeAngles(state).pitchRad)
}
