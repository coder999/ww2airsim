import { v3 } from '../math/vec3.js'
import { qRotate } from '../math/quat.js'
import type { AircraftState } from './state.js'

/** Pitch and roll as a human reads them off an attitude indicator. */
export function attitudeAngles(state: AircraftState): {
  readonly pitchRad: number
  readonly rollRad: number
} {
  const fwd = qRotate(state.attitude, v3(1, 0, 0))
  const up = qRotate(state.attitude, v3(0, 1, 0))
  const right = qRotate(state.attitude, v3(0, 0, 1))
  const pitchRad = Math.asin(Math.max(-1, Math.min(1, fwd.y)))
  // Bank angle: how far the wings are from horizontal, measured as world up
  // resolved onto the body's own up and right axes.
  //
  // This was `atan2(up.z, up.y)` until 2026-09-13, which is body-up's
  // sideways lean expressed in the BODY frame -- not a bank angle at all once
  // the airplane is pointing anywhere but along world +X. Pitch tilts body
  // up out of the vertical, and yaw then swings that tilt into the body's
  // lateral axis, so a wings-level airplane read a bank that depended purely
  // on its heading: measured 0 at heading 0, 5.04 at 30, 7.11 at 45 and a
  // full 10.00 at 90, all at 10 degrees nose-up with the wings dead level.
  //
  // Found from a cockpit screenshot on Adreno hardware, 2026-09-13: a level
  // true horizon, a level panel and the bar tilted about 7 degrees. Every
  // test that existed used PURE ROLL about the nose, where the old expression
  // is exactly right -- including C-1's own replacement test, written days
  // earlier to stop precisely this instrument from lying. Getting the
  // reference frame wrong survives a test suite that only ever visits the one
  // attitude where the two frames coincide.
  //
  // In `sim/` rather than beside the instruments that first needed it (moved
  // 2026-09-16, Plan 10): the ditching judgment in `src/sim/contact.ts` needs
  // bank and pitch, and `sim/` may not import `render/`. Two derivations of the
  // same bank angle could disagree; one cannot.
  const rollRad = Math.atan2(-right.y, up.y)
  return { pitchRad, rollRad }
}
