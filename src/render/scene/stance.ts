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
  // The Zero's model is drawn sitting, with its thrust line level (a6m2-zero.json's
  // gear.heightM note): its tailwheel already meets the ground at 0.08 degrees.
  'a6m2-zero': { mainWheelXM: 0.499, tailDownPitchRad: 0 },
}
