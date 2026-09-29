// src/render/scene/stance.ts
/**
 * Each drawn model's measured ground stance, the reference
 * `tests/tools/models/stance.test.ts` and `tests/sim/gearContact.test.ts` hold
 * the specs' wheel layout to. The drawing itself is posed by the sim attitude
 * (T1, 2026-09-28).
 */

/**
 * One drawn model's ground stance, in the sim body frame (+x nose, +y up).
 * `mainWheelXM` is where the main wheels touch, fore-aft; `tailDownPitchRad` is
 * the nose-up pitch, about that contact, at which the first point aft of it
 * (the tailwheel, on every model here) reaches the ground. Both are measured
 * from the glb, and tests/tools/models/stance.test.ts re-measures them, with
 * every spec's mains against its `gear.heightM`.
 */
export type Stance = { readonly mainWheelXM: number; readonly tailDownPitchRad: number }

const DEG = Math.PI / 180

/**
 * Keyed by `view.model`. Measured 2026-09-28 (tests/tools/models/stance.test.ts's
 * method). Every spec's model must have one (tests/render/stance.test.ts).
 */
export const MODEL_STANCE: Readonly<Record<string, Stance>> = {
  'f6f-hellcat': { mainWheelXM: 0.620, tailDownPitchRad: 9.49 * DEG },
  // Through wildcatCorrection(), which levels the glb's baked-in 7.33 degree datum, at the real span
  // and centered on the quarter-chord, with the main legs lengthened (wildcatGearStretch) to
  // Grumman's static ground angle, 12 deg 20 min ([DS] 116a, read 2026-09-28; W1 ruling R5). The
  // model's own legs gave 7.43 degrees; stance.test.ts holds the drawing to this within 0.25 degrees.
  wildcat: { mainWheelXM: 0.413, tailDownPitchRad: (12 + 20 / 60) * DEG },
  // Measured 2026-09-29 (F4U-1D onboarding) with drawnPoints, the propeller excluded: mains at x 0.418, tail
  // wheel the first aft point to touch at 10.268 degrees; [DS] 116a gives a static ground angle of 10 deg 59 min.
  'f4u-corsair': { mainWheelXM: 0.418, tailDownPitchRad: 10.268 * DEG },
  // Measured 2026-09-29 with the model leveled (normalize.pitchDeg -12.36 in its entry): mains at x 0.182, tailwheel
  // the first aft point to touch at 12.224 degrees, close to the real Zero's three-point attitude.
  'a6m2-zero': { mainWheelXM: 0.182, tailDownPitchRad: 12.224 * DEG },
  // Measured 2026-09-29 (B-17G onboarding) after moving the entry's origin 0.354 m forward (quarter-chord to x 0),
  // with the propellers and turrets excluded: mains at x 0.852, tailwheel the first aft point to touch at 7.200 degrees.
  'b-17-flying-fortress': { mainWheelXM: 0.852, tailDownPitchRad: 0.12566 },
  // Measured 2026-09-29 (G4M1 onboarding) with drawnPoints, the propellers and turret excluded: mains at x 1.569, the fixed
  // tailwheel the first aft point to touch at 4.943 degrees.
  'g4m-betty': { mainWheelXM: 1.569, tailDownPitchRad: 4.943 * DEG },
}
