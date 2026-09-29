import type { AircraftSpec } from '../../../src/sim/flight/schema.js'
import { loadAircraftSpec } from '../../../tools/content/load.js'

const base = loadAircraftSpec('f6f-hellcat')

/** A single-engine tricycle. Fixture only: the layout is invented, not a real
 *  aircraft, and exists to prove the ground model needs no per-layout code. */
export const syntheticTricycle: AircraftSpec = {
  ...base,
  id: 'synthetic-tricycle',
  gear: {
    ...base.gear,
    layout: 'tricycle',
    mainX: -0.6,
    thirdX: 3.6,
    thirdHeightM: base.gear.heightM,
    thirdSteering: 'steered',
    steerYawRateDegPerSec: 25,
    torqueYawRateDegPerSec: -2,
  },
}

/** A twin with counter-rotating propellers (net torque 0) and no wheel
 *  steering (rudder only), the P-38's shape. Fixture only. */
export const syntheticTwin: AircraftSpec = {
  ...syntheticTricycle,
  id: 'synthetic-twin',
  gear: { ...syntheticTricycle.gear, torqueYawRateDegPerSec: 0, thirdSteering: 'caster', steerYawRateDegPerSec: 0 },
}

export const realGroundSpecs: readonly AircraftSpec[] = ['f6f-hellcat', 'f4f-wildcat', 'a6m2-zero', 'f4u-corsair', 'b-17-flying-fortress', 'g4m-betty', 'b-29-superfortress', 'p-38-lightning', 'ki-43-oscar', 'd3a-val', 'ki-84-frank'].map((id) => loadAircraftSpec(id))
export const allGroundSpecs: readonly AircraftSpec[] = [...realGroundSpecs, syntheticTricycle, syntheticTwin]
