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
import { Matrix4, Quaternion, Vector3 } from 'three'

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

/** content/aircraft/f4f-wildcat.json's geometry.wingSpanM (Task 3 -- reused
 *  verbatim from the Hellcat's; this constant must be kept in sync with that
 *  file by hand, the same way hellcat.ts's own wing box hardcodes it, since
 *  this module has no content-loading path of its own either. */
const TARGET_WINGSPAN_M = 13.06
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
 * Stores hang parallel to the DRAWN datum (O1), so they are pitched by this about +Z;
 * tests/tools/models/wildcatMounts.test.ts re-reads it from the glb. The model is also drawn
 * about 2.2 m high relative to the sim body origin (its origin is the wheel contact plane):
 * recorded in the O1 handoff, deliberately not re-seated here.
 */
export const WILDCAT_DATUM_PITCH_RAD = 0.12789182382108172

/** The correction group's matrix (rotation Y, uniform scale), column-major: model space to
 *  sim body frame. tools/models/mounts.ts slices the wing through exactly this. */
export function wildcatToSimMatrix(): number[] {
  return new Matrix4().compose(
    new Vector3(), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), WILDCAT_TO_SIM_ROTATION_Y),
    new Vector3(WILDCAT_SCALE, WILDCAT_SCALE, WILDCAT_SCALE),
  ).toArray()
}
