// src/render/scene/wildcatFrame.ts
/**
 * The drawn Wildcat's model-to-sim frame, split out of wildcat.ts so Node
 * tools (tools/models/mounts.ts, run under tsx) can import it: this module
 * imports only `three`, while wildcat.ts pulls in ../content.js, which reads
 * `import.meta.env.BASE_URL` at load and throws outside Vite (verified
 * 2026-09-26: `npx tsx -e "import('./src/render/scene/wildcat.ts')"` threw
 * `Cannot read properties of undefined (reading 'BASE_URL')`). wildcat.ts
 * re-exports everything here.
 */
import { Group, Quaternion, Vector3 } from 'three'

/**
 * The Wildcat model (content/aircraft/wildcat.glb, ASSETS.md) is authored
 * with local +Z as the nose -- confirmed 2026-09-24 by reading the world
 * position of the `Helice` (propeller) node (+Z) against `Timon_Prof` (the
 * tail/elevator, -Z) after a real Three.js load, not by assumption. Sim body
 * frame is +X forward (hellcat.ts's own doc comment). Rotating +90 degrees
 * about Y sends local (0,0,1) to world (1,0,0) -- verified against the same
 * measurement: it also sends the model's local +X (where `GRP_Rueda_Der`,
 * "right" in Spanish, sits at negative local X) to world -Z, i.e. sim's
 * right-hand side (+Z), matching hellcat.ts's stated "+Z right" convention.
 */
export const WILDCAT_TO_SIM_ROTATION_Y = Math.PI / 2

/** content/aircraft/f4f-wildcat.json's geometry.wingSpanM: the F4F-4's real span, 38 ft 0 in
 *  (W1, 2026-09-28; until then this reused the Hellcat's 13.06 m, drawing the Wildcat 13% too
 *  big). Kept in sync with that file by hand, since this module has no content-loading path of
 *  its own; tests/render/wildcat.test.ts holds the two together. */
const TARGET_WINGSPAN_M = 11.582
/** The model's own native wingspan, measured 2026-09-24 via
 *  `new THREE.Box3().setFromObject(scene)` on a real load (not a guess, and
 *  not derived from the raw glTF accessor bytes, which are in a different,
 *  pre-hierarchy unit space) -- see this plan's Task 5 for the method. */
const WILDCAT_NATIVE_WINGSPAN_M = 15.658001068688918
export const WILDCAT_SCALE = TARGET_WINGSPAN_M / WILDCAT_NATIVE_WINGSPAN_M

/**
 * The model's own datum pitch: its `Avion` node is authored 7.33 degrees nose-up (the
 * three-point ground stance, baked in). Measured 2026-09-26 from that node's rotation
 * quaternion (x -0.0639023408293724, w 0.9979561567306519): 2 * atan2(0.0639..., 0.9979...).
 * tests/tools/models/wildcatMounts.test.ts re-reads it from the glb.
 *
 * wildcatCorrection() pitches the model back down by exactly this, so the drawn Wildcat flies
 * level like every other model (2026-09-28: until then it flew 7.33 degrees nose-high). Its
 * stance on the ground is the renderer's job now, the same as for every taildragger
 * (src/render/scene/stance.ts), so nothing downstream of the correction sees this angle.
 */
export const WILDCAT_DATUM_PITCH_RAD = 0.12789182382108172

/**
 * How far the correction moves the model aft, metres, so the wing's quarter-chord (at 30% of the
 * half-span) sits at the sim body origin, which stands for the center of gravity. Measured
 * 2026-09-28 (W1 Task 3) through this frame at the 11.582 m scale: the quarter-chord sat 1.871 m
 * forward of the origin. tests/tools/models/centerPoint.test.ts holds every drawn model to it.
 */
export const WILDCAT_OFFSET_X_M = -1.871

/**
 * How far the correction lowers the model, metres. The glb's origin is its wheel contact plane,
 * so until 2026-09-28 the drawn Wildcat stood with its wheels AT the body origin, 2.2 m above the
 * ground it was parked on (O1 handoff; Mark's screenshot that day). That day's drop, -1.872 m at
 * the old 13.06 m-span scale, scaled to the real 11.582 m span (W1 Task 3), so the airframe keeps
 * the same height about the origin in its own proportions. The main gear's stretch
 * (WILDCAT_GEAR_STRETCH_M) then takes the wheels down to f4f-wildcat.json's gear.heightM, which
 * tests/tools/models/stance.test.ts holds every drawn model's mains to within 0.05 m.
 */
export const WILDCAT_OFFSET_Y_M = -1.6601

/**
 * How far wildcatGearStretch (wildcat.ts) lengthens each drawn main leg, sim metres: the vertical
 * drop of the main-wheel contact at GEAR_DOWN. The model's own legs park it at 7.43 degrees; this
 * drop parks it at Grumman's static ground angle, 12 deg 20 min ([DS] 116a, read 2026-09-28; W1
 * spec ruling R5). Measured 2026-09-28 by bisecting the drop against that angle through this frame
 * (.superpowers/w1/draw.mts, W1 plan); tests/tools/models/wildcatGear.test.ts holds the drawn
 * wheels to it and tests/tools/models/stance.test.ts holds the angle within 0.25 degrees.
 */
export const WILDCAT_GEAR_STRETCH_M = 0.4445

/** The correction group's name, so tests can find it in a loaded airframe. */
export const WILDCAT_CORRECTION_NAME = 'wildcat-correction'

/**
 * The ONE place the drawn Wildcat's model-to-sim correction is built: rotation Y, the pitch
 * that levels the datum, a uniform scale and the shift that centers it and drops it toward gear.heightM. wildcat.ts wraps the loaded model in this
 * group, and wildcatToSimMatrix() below reads its matrix, so the transform the mounts are
 * measured through cannot drift from the one the airplane is drawn with.
 * tests/render/wildcat.test.ts asserts a loaded airframe's group equals the matrix.
 */
export function wildcatCorrection(): Group {
  const g = new Group()
  g.name = WILDCAT_CORRECTION_NAME
  // Yaw into the sim frame first, then level about sim +Z (nose-up positive).
  const yaw = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), WILDCAT_TO_SIM_ROTATION_Y)
  g.quaternion.setFromAxisAngle(new Vector3(0, 0, 1), -WILDCAT_DATUM_PITCH_RAD).multiply(yaw)
  g.scale.setScalar(WILDCAT_SCALE)
  g.position.set(WILDCAT_OFFSET_X_M, WILDCAT_OFFSET_Y_M, 0)
  return g
}

/** wildcatCorrection()'s matrix, column-major: model space to sim body frame.
 *  tools/models/mounts.ts slices the wing through exactly this. */
export function wildcatToSimMatrix(): number[] {
  const g = wildcatCorrection()
  g.updateMatrix()
  return g.matrix.toArray()
}
