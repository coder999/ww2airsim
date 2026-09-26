// src/render/scene/wildcat.ts
import { Group, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three'
import { attachStores, primitiveStoreVisuals, type StoreMounts } from './stores.js'
import { loadStoreVisuals } from './storeModels.js'
import { WILDCAT_MODEL_URL } from '../content.js'
import { propAngle, type Airframe } from './airframe.js'
import { acquireModel, type ModelInstance } from '../models/modelCache.js'

import { WILDCAT_DATUM_PITCH_RAD, wildcatCorrection } from './wildcatFrame.js'

/** The model-to-sim frame lives in wildcatFrame.ts (Node-safe for tools/models/mounts.ts);
 *  re-exported so every importer of this module keeps working. */
export { WILDCAT_CORRECTION_NAME, WILDCAT_DATUM_PITCH_RAD, WILDCAT_SCALE, WILDCAT_TO_SIM_ROTATION_Y, wildcatCorrection, wildcatToSimMatrix } from './wildcatFrame.js'

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

/**
 * One Wildcat. Loads through the shared model cache (A6M Zero spec §7.1): the
 * first call parses wildcat.glb, every later call clones that parse, and all
 * of them share its geometry, materials and 26 textures. `acquire` is
 * injectable so Node tests can hand in a synthetic instance.
 */
export async function loadWildcat(stores: StoreMounts | undefined, acquire: (url: string) => Promise<ModelInstance> = acquireModel): Promise<Airframe> {
  const instance = await acquire(WILDCAT_MODEL_URL)
  const scene = instance.root

  const gearDer = instance.node('GRP_Rueda_Der')
  const gearIzq = instance.node('GRP_Rueda_Izq')
  const helice = instance.node('Helice')
  // The prop turns about ITS OWN native axis (local Z here, not the +X
  // hellcat.ts's box uses), from whatever angle the file authored it at.
  const heliceRestZ = helice.rotation.z
  let propRad = 0

  // The basis/scale fix lives on one wrapper Group, isolating this model's
  // native-axis quirk from every consumer (scenarioEntities.ts, main.ts):
  // `root` below is posed directly in sim body-frame convention exactly the
  // way hellcat.ts's `root` always was.
  // Built in wildcatFrame.ts, the same source models:mounts measures through.
  const correction = wildcatCorrection()
  correction.add(scene)

  const root = new Group()
  root.add(correction)
  root.traverse((o) => { o.receiveShadow = true })

  // O1: stores hang from the FLYING spec's mounts (the sim's), as the generated models, parallel
  // to the drawn datum. A spec with no stores (the Zero) hangs none. If a store model fails to
  // load, the primitive stand-ins hang instead and the airplane still flies (Review Focus 2).
  let hung: { setStores(b: number, r: number): void; dispose(): void } | null = null
  let freeVisuals = (): void => {}
  if (stores !== undefined) {
    const ids = [...stores.racks, ...stores.rails].map((m) => m.store)
    const visuals = await loadStoreVisuals(ids, WILDCAT_DATUM_PITCH_RAD, acquire).catch((e: unknown) => {
      console.warn(`wildcat: store models failed (${e instanceof Error ? e.message : String(e)}); hanging primitive stand-ins`)
      const trim = new MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.5 })
      const p = primitiveStoreVisuals(stores, trim)
      return { ...p, release: () => { p.dispose(); trim.dispose() } }
    })
    hung = attachStores(root, stores, visuals)
    freeVisuals = visuals.release
  }
  let disposed = false

  return {
    root,
    /** This model has no flap geometry at all (ASSETS.md, F4F plan Review Focus). */
    parts: stores === undefined ? ['prop', 'gear'] : ['prop', 'gear', 'stores'],
    setStores: (b, r) => { hung?.setStores(b, r) },
    update(u): void {
      propRad = propAngle(propRad, u.throttle, u.frameS)
      helice.rotation.z = heliceRestZ + propRad
      applyGearFraction(gearDer, GEAR_DOWN.der, GEAR_UP.der, u.gearFraction)
      applyGearFraction(gearIzq, GEAR_DOWN.izq, GEAR_UP.izq, u.gearFraction)
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      hung?.dispose()
      freeVisuals()
      instance.release()
    },
  }
}
