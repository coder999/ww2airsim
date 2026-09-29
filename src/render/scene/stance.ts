// src/render/scene/stance.ts
/**
 * How a taildragger is DRAWN while it sits on its wheels: nose up, resting on
 * its tailwheel (Mark's screenshots, 2026-09-28: the Hellcat parked with its
 * tailwheel 1.1 m off the strip).
 *
 * The sim does not model the tailwheel as a contact. It holds the main wheels
 * `gear.heightM` below the body origin (`restOnSurface`, src/sim/ground.ts) and
 * refuses any pitch below `gear.tailUpSpeedMps` (`groundBodyRates`), so a
 * parked airplane is exactly as level as its parking attitude, which is level
 * (`parkedAttitude`, src/sim/world/airfields.ts). A model drawn with a level
 * flight datum then stands on its mains with its tail in the air. This module
 * pitches the DRAWING about the main-wheel contact until the tailwheel meets
 * the ground; the sim state, the eye and the cockpit are untouched. Modeling
 * the tailwheel in the sim instead (a nose-up rest attitude, and the alpha that
 * changes on the take-off roll) is a flight-model change, not taken here.
 */
import { qFromAxisAngle, qMul, qRotate } from '../../sim/math/quat.js'
import { attitudeAngles } from '../../sim/flight/attitude.js'
import { add, length, sub, v3 } from '../../sim/math/vec3.js'
import type { AircraftSpec } from '../../sim/flight/schema.js'
import type { AircraftState } from '../../sim/flight/state.js'
import type { RenderState } from '../../sim/interpolate.js'
import { supportedContact } from '../../sim/ground.js'
import type { GroundUnder } from '../../sim/world/ground.js'

/**
 * One drawn model's ground stance, in the sim body frame (+x nose, +y up).
 * `mainWheelXM` is where the main wheels touch, fore-aft; `tailDownPitchRad` is
 * the nose-up pitch, about that contact, at which the first point aft of it
 * (the tailwheel, on every model here) reaches the ground. Both are measured
 * from the glb, and tests/render/stance.test.ts re-measures them, with every
 * spec's mains against its `gear.heightM`.
 */
export type Stance = { readonly mainWheelXM: number; readonly tailDownPitchRad: number }

const DEG = Math.PI / 180

/**
 * Keyed by `view.model`. Measured 2026-09-28 (tests/render/stance.test.ts's
 * method). A model with no entry is drawn at its sim attitude, unpitched; every
 * spec's model must have one (the test).
 */
export const MODEL_STANCE: Readonly<Record<string, Stance>> = {
  'f6f-hellcat': { mainWheelXM: 0.620, tailDownPitchRad: 9.49 * DEG },
  // Through wildcatCorrection(), which levels the glb's baked-in 7.33 degree datum, at the real span
  // and centered on the quarter-chord, with the main legs lengthened (wildcatGearStretch) to
  // Grumman's static ground angle, 12 deg 20 min ([DS] 116a, read 2026-09-28; W1 ruling R5). The
  // model's own legs gave 7.43 degrees; stance.test.ts holds the drawing to this within 0.25 degrees.
  wildcat: { mainWheelXM: 0.413, tailDownPitchRad: (12 + 20 / 60) * DEG },
  // The Zero's model is drawn sitting, with its thrust line level (a6m2-zero.json's
  // gear.heightM note): its tailwheel already meets the ground at 0.08 degrees.
  'a6m2-zero': { mainWheelXM: 0.499, tailDownPitchRad: 0 },
}

/**
 * The fraction of the stance pitch drawn, 1 with the tail down, 0 with it up.
 * Full below `TAIL_SETTLED_FRACTION` of `tailUpSpeedMps`, none at or above it,
 * linear between: the sim grants pitch authority at `tailUpSpeedMps`
 * (`groundBodyRates`), so by then the drawing must be the sim's own attitude,
 * and a ramp rather than a step keeps the tail from snapping on a roll-out.
 * A non-finite speed reads as tail down, `groundBodyRates`' own convention.
 */
export const TAIL_SETTLED_FRACTION = 0.75

export function tailDownFraction(groundSpeedMps: number, tailUpSpeedMps: number): number {
  if (!Number.isFinite(groundSpeedMps)) return 1
  const settled = TAIL_SETTLED_FRACTION * tailUpSpeedMps
  if (groundSpeedMps <= settled) return 1
  if (groundSpeedMps >= tailUpSpeedMps) return 0
  return (tailUpSpeedMps - groundSpeedMps) / (tailUpSpeedMps - settled)
}

/**
 * Extra nose-up pitch, radians, to draw this airplane with: nonzero only while
 * it stands on its wheels (`supportedContact`, the sim's own test), and never
 * below its own pitch -- an airplane already nose-high on the ground (a
 * three-point landing) is drawn as it is, not tilted twice.
 */
export function stanceTiltRad(
  stance: Stance | undefined,
  spec: AircraftSpec,
  state: AircraftState,
  ground: GroundUnder | null,
): number {
  if (stance === undefined || ground === null) return 0
  if (!supportedContact(spec, state, ground.heightM, ground.surface, ground.velocity)) return 0
  const rel = sub(state.velocity, ground.velocity)
  const fraction = tailDownFraction(length(v3(rel.x, 0, rel.z)), spec.gear.tailUpSpeedMps)
  return fraction * Math.max(0, stance.tailDownPitchRad - attitudeAngles(state).pitchRad)
}

/**
 * `pose`, pitched nose-up by `tiltRad` about the main-wheel contact
 * `(mainWheelXM, -gearHeightM, 0)` in the body frame, so the mains stay where
 * the sim put them and only the tail comes down.
 */
export function drawnPose(pose: RenderState, tiltRad: number, mainWheelXM: number, gearHeightM: number): RenderState {
  if (tiltRad === 0) return pose
  const tilt = qFromAxisAngle(v3(0, 0, 1), tiltRad)
  const pivot = v3(mainWheelXM, -gearHeightM, 0)
  // The pivot must not move: position' + R*T*pivot = position + R*pivot.
  const shift = qRotate(pose.attitude, sub(pivot, qRotate(tilt, pivot)))
  return { position: add(pose.position, shift), attitude: qMul(pose.attitude, tilt) }
}
