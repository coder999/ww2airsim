import { Group, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { attachStores } from './stores.js'
import { WILDCAT_MODEL_URL } from '../content.js'
import type { Airframe } from './airframe.js'

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

interface GearPose { readonly pos: Vector3; readonly quat: Quaternion }
interface GearPair { readonly der: GearPose; readonly izq: GearPose }

/**
 * Both poses read directly off the model's own baked "Take 001" clip via
 * `AnimationMixer`/`AnimationAction.time`, NOT the raw accessor bytes (which
 * are in the same pre-hierarchy unit space `WILDCAT_NATIVE_WINGSPAN_M`'s doc
 * comment warns about) -- and NOT trusted from node names alone: t=0 vs
 * t=8.333 (the clip's full duration) were each rendered and screenshotted
 * 2026-09-24, confirming t=0 shows the wheels/struts extended below the
 * fuselage (gear DOWN) and t=8.333 shows them tucked flush into the wing
 * (gear UP). `AircraftState.gearFraction` (state.ts): 1 = extended (down),
 * 0 = retracted (up) -- so GEAR_DOWN below is the fraction=1 endpoint.
 *
 * The clip's *_CTRL locator nodes (Aleron_*_CTRL, Timon_*_CTRL,
 * Tren_aterrizaje_CTRL) barely move at all in this clip (all under 1e-17
 * radians -- floating-point noise, not real animation) despite their names
 * suggesting aileron/rudder/gear controls; the real, substantial motion is
 * entirely on GRP_Rueda_Der/Izq (translation + rotation) and Ctrl_Rota_
 * Rueda_Der/Izq (which duplicates GRP_Rueda's own rotation exactly, so only
 * GRP_Rueda_* needs to be driven directly). This clip has no usable flap or
 * aileron animation at all -- see this plan's Review Focus on flaps.
 */
export const GEAR_DOWN: GearPair = {
  der: { pos: new Vector3(-41.522, 7.8395, 188.651), quat: new Quaternion(0, 0, 0, 1) },
  izq: { pos: new Vector3(39.910, 7.8386, 186.271), quat: new Quaternion(0, 0, 0, 1) },
}
export const GEAR_UP: GearPair = {
  der: { pos: new Vector3(-41.459, 70.991, 188.651), quat: new Quaternion(0, 0, 0.23524, 0.97194) },
  izq: { pos: new Vector3(40.033, 70.809, 186.271), quat: new Quaternion(0, 0, -0.21691, 0.97619) },
}

/** fraction 1 = down (GEAR_DOWN), fraction 0 = up (GEAR_UP) -- matches
 *  AircraftState.gearFraction's own documented convention exactly. */
export function applyGearFraction(node: Object3D, down: GearPose, up: GearPose, fraction: number): void {
  node.position.lerpVectors(up.pos, down.pos, fraction)
  node.quaternion.slerpQuaternions(up.quat, down.quat, fraction)
}

function required(scene: Object3D, name: string): Object3D {
  const found = scene.getObjectByName(name)
  if (!found) throw new Error(`Wildcat model: required node "${name}" not found -- content/aircraft/wildcat.glb may have been re-exported with different names (see ASSETS.md)`)
  return found
}

/** Matches hellcat.ts's `dark` material exactly (color, roughness) --
 *  deliberately its own instance, not a shared import: sharing one material
 *  object would mean a future recolor of the Hellcat's trim silently
 *  recolors the Wildcat's ordnance too, a surprising coupling for one line
 *  saved. */
const dark = new MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.5 })

export async function loadWildcat(): Promise<Airframe> {
  const gltf = await new GLTFLoader().loadAsync(WILDCAT_MODEL_URL)
  const scene = gltf.scene

  const gearDer = required(scene, 'GRP_Rueda_Der')
  const gearIzq = required(scene, 'GRP_Rueda_Izq')
  const helice = required(scene, 'Helice')

  // The basis/scale fix lives on one wrapper Group, isolating this model's
  // native-axis quirk from every consumer (scenarioEntities.ts, main.ts):
  // `root` below is posed directly in sim body-frame convention exactly the
  // way hellcat.ts's `root` always was, with zero further changes needed at
  // any call site for this specific concern.
  const correction = new Group()
  correction.rotation.y = WILDCAT_TO_SIM_ROTATION_Y
  correction.scale.setScalar(WILDCAT_SCALE)
  correction.add(scene)

  const root = new Group()
  root.add(correction)
  root.traverse((o) => { o.receiveShadow = true })

  const { setStores } = attachStores(root, dark)

  return {
    root,
    setStores,
    /** `deltaRadians` spins the propeller about ITS OWN native axis (local Z
     *  here, not the +X hellcat.ts's simple box uses) -- the axis knowledge
     *  stays inside this module so main.ts's one call site does not need to
     *  know which aircraft type it is driving. */
    spinProp(deltaRadians: number): void {
      helice.rotation.z += deltaRadians
    },
    setGear(fraction: number): void {
      applyGearFraction(gearDer, GEAR_DOWN.der, GEAR_UP.der, fraction)
      applyGearFraction(gearIzq, GEAR_DOWN.izq, GEAR_UP.izq, fraction)
    },
  }
}
