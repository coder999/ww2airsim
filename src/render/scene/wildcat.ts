// src/render/scene/wildcat.ts
import { Box3, BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Matrix4, Mesh, MeshStandardMaterial, Object3D, Quaternion, Vector3 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { slewToward, surfaceAngleRad } from './pivotedAirframe.js'
import { surfaceDrive } from './airframeRigs.js'
import { attachStores, primitiveStoreVisuals, type StoreMounts } from './stores.js'
import { loadStoreVisuals } from './storeModels.js'
import { WILDCAT_MODEL_URL } from '../content.js'
import { propAngle, type Airframe } from './airframe.js'
import { acquireModel, type ModelInstance } from '../models/modelCache.js'

import { WILDCAT_CORRECTION_NAME, WILDCAT_GEAR_STRETCH_M, WILDCAT_SCALE, wildcatCorrection } from './wildcatFrame.js'

/** The model-to-sim frame lives in wildcatFrame.ts (Node-safe for tools/models/mounts.ts);
 *  re-exported so every importer of this module keeps working. */
export { WILDCAT_CORRECTION_NAME, WILDCAT_DATUM_PITCH_RAD, WILDCAT_GEAR_STRETCH_M, WILDCAT_SCALE, WILDCAT_TO_SIM_ROTATION_Y, wildcatCorrection, wildcatToSimMatrix } from './wildcatFrame.js'

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

/** The main strut under each gear group: polySurface272 under GRP_Rueda_Der, polySurface277 under
 *  GRP_Rueda_Izq (the Tren_aterrizaje_MAT legs; read from the glb 2026-09-28). */
const STRUT = /^polySurface(272|277)$/

/** `o`'s mesh vertices' bounds in `frame`'s coordinates (both already have current world matrices). */
function boundsIn(o: Object3D, frame: Object3D): Box3 {
  const toFrame = new Matrix4().copy(frame.matrixWorld).invert()
  const box = new Box3()
  const v = new Vector3()
  o.traverse((m) => {
    if (!(m instanceof Mesh)) return
    const mat = new Matrix4().multiplyMatrices(toFrame, m.matrixWorld)
    const a = m.geometry.getAttribute('position')
    for (let i = 0; i < a.count; i++) box.expandByPoint(v.fromBufferAttribute(a, i).applyMatrix4(mat))
  })
  return box
}

/** The gear fraction at which the leg starts to lengthen: below it the gear is the model's own. */
export const GEAR_STRETCH_FROM_FRACTION = 0.75

/**
 * How far the main legs are lengthened at gear fraction `fraction`, sim metres: none at or below
 * GEAR_STRETCH_FROM_FRACTION, rising linearly to the full WILDCAT_GEAR_STRETCH_M at 1 (gear down).
 * A fixed-length stretch would not stow: the longer wheel hung 0.2 m below the belly with the gear
 * up, and every mid-travel pose stood further out than the model's own gear ever does (measured
 * 2026-09-28, W1 Task 3 report). So the leg telescopes out over the last quarter of the travel,
 * and every pose at or below 0.75 is exactly the model's (W1 controller ruling, 2026-09-28).
 */
export function gearStretchM(fraction: number): number {
  const t = (fraction - GEAR_STRETCH_FROM_FRACTION) / (1 - GEAR_STRETCH_FROM_FRACTION)
  return WILDCAT_GEAR_STRETCH_M * Math.min(1, Math.max(0, t))
}

/**
 * Rigs both main legs to lengthen, so the drawn Wildcat parks at Grumman's static ground angle,
 * 12 deg 20 min ([DS] 116a), rather than the model's own 7.43 degrees (W1 spec R5, 2026-09-28). The
 * model's tailwheel top is already inside the fuselage skin, so the tail cannot come up; the mains
 * come down. Returns the setter: `set(m)` lengthens each leg by `m` sim metres (gearStretchM).
 *
 * Measured on the glb 2026-09-28: each strut (STRUT above) is 33.3 local units long in its group's
 * y, against 4.1 in x and 7.8 in z, and the strut, its mesh and the group at GEAR_DOWN all carry
 * the identity rotation; the Avion node's 7.33 degree datum is what wildcatCorrection() levels, so
 * the leg is vertical in the sim frame at GEAR_DOWN (tests/tools/models/wildcatGear.test.ts holds
 * it within 1 degree). The strut is scaled along that y about its top, and every other child of the
 * group whose center lies below the strut's midpoint (the wheel and its axle bolt) moves down by the
 * same local distance; the fittings at the strut's top and middle stay. Local units: metres /
 * (WILDCAT_SCALE * the group's scale within the model, 0.0169), so the full stretch is about 35.6
 * units and the strut roughly doubles (accepted, W1 ruling D: it is R5's arithmetic).
 *
 * The rest transforms are captured here, once, and every `set` works from them, so repeated calls
 * never accumulate. Call before the model goes under its correction group. The model is CC-BY 4.0;
 * ASSETS.md records the modification.
 */
export function wildcatGearStretch(der: Object3D, izq: Object3D): (stretchM: number) => void {
  const legs = [der, izq].map((group) => {
    const strut = group.children.find((c) => STRUT.test(c.name))
    if (strut === undefined) throw new Error(`wildcatGearStretch: no strut under ${group.name}`)
    if (strut.quaternion.angleTo(new Quaternion()) > 1e-6) throw new Error(`wildcatGearStretch: ${strut.name} is not axis-aligned in ${group.name}`)
    // The group's own scale within the model, up to (not including) any correction group.
    let modelScale = 1
    for (let o: Object3D | null = group; o !== null && o.name !== WILDCAT_CORRECTION_NAME; o = o.parent) modelScale *= o.scale.y
    group.updateWorldMatrix(true, true)
    const box = boundsIn(strut, group)
    const size = box.getSize(new Vector3())
    if (size.y < 2 * Math.max(size.x, size.z)) throw new Error(`wildcatGearStretch: ${strut.name}'s long axis is not its local y (${size.toArray().map((v) => v.toFixed(2)).join(', ')})`)
    const mid = (box.max.y + box.min.y) / 2
    const below = group.children.filter((c) => c !== strut && boundsIn(c, group).getCenter(new Vector3()).y < mid)
    return {
      strut, top: box.max.y, length: size.y, unitsPerM: 1 / (WILDCAT_SCALE * modelScale),
      strutY: strut.position.y, strutScaleY: strut.scale.y,
      below: below.map((c) => ({ c, y: c.position.y })),
    }
  })
  return (stretchM) => {
    for (const leg of legs) {
      const stretch = stretchM * leg.unitsPerM
      const k = (leg.length + stretch) / leg.length
      leg.strut.scale.y = leg.strutScaleY * k
      leg.strut.position.y = leg.top - k * (leg.top - leg.strutY)
      for (const b of leg.below) b.c.position.y = b.y - stretch
    }
  }
}

/** The model's own control surfaces (C1 batch 2), by the rig names surfaceDrive reads. "Der" is
 *  right (-x in the model). The model's ailerons sit inboard, where a real F4F's flaps are; they are
 *  driven as ailerons, as the model names them (C1 batch 2 handoff). */
export const WILDCAT_SURFACES: Readonly<Record<string, string>> = {
  Aleron_Der: 'AileronR', Aleron_Izq: 'AileronL', Timon_Der: 'ElevatorR', Timon_Izq: 'ElevatorL', Timon_Prof: 'Rudder',
}

/** A hinge in a node's parent frame: a point on it and the unit axis. */
export interface WildcatHinge { readonly point: Vector3; readonly axis: Vector3 }

/** `o`'s mesh vertices in `frame`, an ancestor of `o`. */
function pointsIn(o: Object3D, frame: Object3D): Vector3[] {
  frame.updateWorldMatrix(true, true)
  const toFrame = new Matrix4().copy(frame.matrixWorld).invert()
  const out: Vector3[] = []
  o.traverse((m) => {
    if (!(m instanceof Mesh)) return
    const mat = new Matrix4().multiplyMatrices(toFrame, m.matrixWorld)
    const a = m.geometry.getAttribute('position')
    for (let i = 0; i < a.count; i++) out.push(new Vector3().fromBufferAttribute(a, i).applyMatrix4(mat))
  })
  return out
}

/**
 * A surface's hinge, measured from its own vertices in its parent's frame (the model is +z nose,
 * +y up, -x right): its leading edge, the foremost points at each end of its span (x, or y for the
 * rudder). Oriented as kit.py orients every hinge: a positive turn raises the trailing edge (-z),
 * or swings the rudder's to starboard (-x). ESTIMATE: the model draws no hinge line, so this is the
 * piece's own leading edge.
 */
export function wildcatHinge(node: Object3D, vertical: boolean): WildcatHinge {
  const pts = pointsIn(node, node.parent!)
  const k = vertical ? 'y' : 'x', other = vertical ? 'x' : 'y'
  const lo = Math.min(...pts.map((p) => p[k])), hi = Math.max(...pts.map((p) => p[k])), band = 0.05 * (hi - lo)
  const end = (at: number): Vector3 => {
    const s = pts.filter((p) => Math.abs(p[k] - at) <= band)
    const front = Math.max(...s.map((p) => p.z)), chord = front - Math.min(...s.map((p) => p.z))
    const lead = s.filter((p) => p.z >= front - 0.1 * chord)
    const v = new Vector3(); v[k] = at; v.z = front
    v[other] = lead.reduce((sum, p) => sum + p[other], 0) / lead.length
    return v
  }
  const point = end(lo)
  const axis = end(hi).sub(point).normalize()
  // axis x (0, 0, -1) = (-a.y, a.x, 0): a.x > 0 raises the trailing edge; a.y > 0 swings it to -x.
  if ((vertical ? axis.y : axis.x) < 0) axis.negate()
  return { point, axis }
}

/** `node` turned `rad` about `h` from its rest pose, in its parent's frame. */
function turnAbout(node: Object3D, rest: { pos: Vector3; quat: Quaternion }, h: WildcatHinge, rad: number): void {
  const q = new Quaternion().setFromAxisAngle(h.axis, rad)
  node.quaternion.copy(q).multiply(rest.quat)
  node.position.copy(rest.pos).sub(h.point).applyQuaternion(q).add(h.point)
}

/**
 * The split flaps the model does not draw (Mark, 2026-10-08): one plate under each aileron, from its
 * leading edge to its trailing edge, 0.3 model units under its lowest skin, hinged at the front. Both
 * plates are ONE mesh posed on the CPU, so they cost one draw call, and it is hidden while the flaps are
 * up, where it would lie flush with the skin. ESTIMATE: the real F4F's flaps run under the inboard
 * wing as these do; their chord and the drop are the model's aileron's, not Grumman's figures.
 */
function wildcatFlaps(der: Object3D, izq: Object3D): { mesh: Mesh; set(fraction: number): void } {
  const plates = [der, izq].map((node) => {
    const pts = pointsIn(node, node.parent!)
    const h = wildcatHinge(node, false)
    const xs = pts.map((p) => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs)
    const zf = Math.max(...pts.map((p) => p.z)), zr = Math.min(...pts.map((p) => p.z))
    const y = Math.min(...pts.map((p) => p.y)) - 0.3
    const corners = [new Vector3(x0, y, zf), new Vector3(x1, y, zf), new Vector3(x1, y, zr), new Vector3(x0, y, zr)]
    return { corners, hinge: { point: new Vector3(0, y, zf), axis: new Vector3(Math.sign(h.axis.x), 0, 0) }, name: node === der ? 'Flap1R' : 'Flap1L' }
  })
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(2 * 4 * 3), 3))
  geometry.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
  const mesh = new Mesh(geometry, new MeshStandardMaterial({ color: 0xb9bdb8, roughness: 0.7, side: DoubleSide }))
  mesh.name = 'Flaps'
  const pos = geometry.getAttribute('position') as Float32BufferAttribute
  const set = (fraction: number): void => {
    mesh.visible = fraction > 0
    plates.forEach((p, i) => {
      const q = new Quaternion().setFromAxisAngle(p.hinge.axis, surfaceAngleRad(p.name, fraction))
      p.corners.forEach((c, j) => { const v = c.clone().sub(p.hinge.point).applyQuaternion(q).add(p.hinge.point); pos.setXYZ(4 * i + j, v.x, v.y, v.z) })
    })
    pos.needsUpdate = true
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()
  }
  der.parent!.add(mesh)
  set(0)
  return { mesh, set }
}

/**
 * The three hinge pins under `Pasadores` (static, one material, 64 triangles each) merged into one
 * mesh: two draw calls back, so the flaps fit the model's 47-call budget (C1 batch 2). Returns the
 * merged geometry, which this instance owns.
 */
function mergePins(group: Object3D): BufferGeometry | null {
  const meshes: Mesh[] = []
  group.traverse((o) => { if (o instanceof Mesh) meshes.push(o) })
  if (meshes.length < 2) return null
  group.updateWorldMatrix(true, true)
  const toGroup = new Matrix4().copy(group.matrixWorld).invert()
  const merged = mergeGeometries(meshes.map((m) => m.geometry.clone().applyMatrix4(new Matrix4().multiplyMatrices(toGroup, m.matrixWorld))))
  if (merged === null) return null
  const one = new Mesh(merged, meshes[0]!.material)
  one.name = 'Pasadores_merged'
  for (const m of meshes) m.removeFromParent()
  group.add(one)
  return merged
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
  const setGearStretch = wildcatGearStretch(gearDer, gearIzq)
  // The glb is authored gear down; draw it as update() would at fraction 1 until the first update.
  setGearStretch(gearStretchM(1))
  // C1 batch 2: the control surfaces turn about their own leading edges; the flaps are drawn here.
  const surfaces = Object.entries(WILDCAT_SURFACES).map(([source, name]) => {
    const node = instance.node(source)
    const input = surfaceDrive(name).input as 'roll' | 'pitch' | 'yaw'
    return { node, name, input, hinge: wildcatHinge(node, input === 'yaw'), rest: { pos: node.position.clone(), quat: node.quaternion.clone() } }
  })
  const flaps = wildcatFlaps(instance.node('Aleron_Der'), instance.node('Aleron_Izq'))
  const pins = mergePins(instance.node('Pasadores'))
  const stick = { roll: 0, pitch: 0, yaw: 0 }
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
  root.name = 'wildcat' // named for its model id, as pivotedAirframe.ts names each rigged root
  root.add(correction)
  root.traverse((o) => { o.receiveShadow = true })

  // O1: stores hang from the FLYING spec's mounts (the sim's), as the generated models, parallel
  // to the drawn datum. A spec with no stores (the Zero) hangs none. If a store model fails to
  // load, the primitive stand-ins hang instead and the airplane still flies (Review Focus 2).
  let hung: { setStores(b: number, r: number): void; dispose(): void } | null = null
  let freeVisuals = (): void => {}
  if (stores !== undefined) {
    const ids = [...stores.racks, ...stores.rails].map((m) => m.store)
    const visuals = await loadStoreVisuals(ids, 0, acquire).catch((e: unknown) => {
      console.warn(`wildcat: store models failed (${e instanceof Error ? e.message : String(e)}); hanging primitive stand-ins`)
      const trim = new MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.5 })
      const p = primitiveStoreVisuals(stores, trim)
      return { ...p, release: () => { p.dispose(); trim.dispose() } }
    })
    try {
      hung = attachStores(root, stores, visuals)
    } catch (e) {
      // Nothing is returned to own them, so free the visuals and the airframe here.
      visuals.release()
      instance.release()
      throw e
    }
    freeVisuals = visuals.release
  }
  let disposed = false

  return {
    root,
    parts: stores === undefined ? ['prop', 'gear', 'flaps', 'surfaces'] : ['prop', 'gear', 'flaps', 'surfaces', 'stores'],
    setStores: (b, r) => { hung?.setStores(b, r) },
    update(u): void {
      propRad = propAngle(propRad, u.throttle, u.frameS)
      helice.rotation.z = heliceRestZ + propRad
      applyGearFraction(gearDer, GEAR_DOWN.der, GEAR_UP.der, u.gearFraction)
      applyGearFraction(gearIzq, GEAR_DOWN.izq, GEAR_UP.izq, u.gearFraction)
      setGearStretch(gearStretchM(u.gearFraction))
      for (const k of ['roll', 'pitch', 'yaw'] as const) stick[k] = slewToward(stick[k], u.controls[k], u.frameS)
      for (const s of surfaces) turnAbout(s.node, s.rest, s.hinge, surfaceAngleRad(s.name, stick[s.input]))
      flaps.set(u.flapFraction)
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      hung?.dispose()
      freeVisuals()
      flaps.mesh.geometry.dispose()
      ;(flaps.mesh.material as MeshStandardMaterial).dispose()
      pins?.dispose()
      instance.release()
    },
  }
}
