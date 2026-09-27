// src/render/scene/pivotedAirframe.ts
import { Group, MeshStandardMaterial, Quaternion, Vector3, type Object3D } from 'three'
import { propAngle, type Airframe, type PartId } from './airframe.js'
import { acquireModel, type ModelInstance } from '../models/modelCache.js'
import type { AirframeRig, GearRig } from './airframeRigs.js'
import { attachStores, primitiveStoreVisuals, type StoreMounts } from './stores.js'
import { loadStoreVisuals } from './storeModels.js'

/**
 * One airframe from a rigged glb (R3): its articulated parts were pivoted by the build (each
 * node's origin on its hinge, its axis in userData.pivotAxis), and airframeRigs.ts says how far
 * each turns. One module for every rigged model, where a hand-written module per aircraft
 * would repeat this plumbing eleven times. wildcat.ts stays: its gear poses come from a baked clip.
 */

/** The unit axis the build baked into `node`. Throws, naming the model and node, if absent. */
export function pivotAxisOf(node: Object3D, modelId: string): Vector3 {
  const a: unknown = node.userData['pivotAxis']
  if (!Array.isArray(a) || a.length !== 3 || !a.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    throw new Error(`${modelId}: node "${node.name}" has no pivotAxis; give its keep or split entry a pivot in tools/models/entries/${modelId}.json`)
  }
  const v = new Vector3(a[0] as number, a[1] as number, a[2] as number)
  if (Math.abs(v.length() - 1) > 1e-6) throw new Error(`${modelId}: node "${node.name}" pivotAxis is not a unit vector (${v.toArray().join(', ')})`)
  return v
}

/** Radians a leg is turned about its axis at `gearFraction`: 1 (down) is 0, 0 (up) is upAngleDeg. */
export function gearAngleRad(g: GearRig, gearFraction: number): number {
  const f = Math.min(1, Math.max(0, gearFraction))
  return ((1 - f) * g.upAngleDeg * Math.PI) / 180
}

/** `rest` turned `angleRad` about `axis`, with the axis in the node's parent frame. */
export function turnedAbout(rest: Quaternion, axis: Vector3, angleRad: number): Quaternion {
  return new Quaternion().setFromAxisAngle(axis, angleRad).multiply(rest)
}

/** The bench parts a rig drives. Stores are added by the loader when the spec carries any. */
export function rigParts(rig: AirframeRig): PartId[] {
  const parts: PartId[] = []
  if (rig.props.length > 0) parts.push('prop')
  if (rig.gear.length > 0) parts.push('gear')
  return parts
}

interface Posed { readonly node: Object3D; readonly axis: Vector3; readonly rest: Quaternion }

function bind(instance: ModelInstance, modelId: string, rig: AirframeRig): { props: Posed[]; gear: { posed: Posed; rig: GearRig }[] } {
  const pose = (name: string): Posed => {
    const node = instance.node(name)
    return { node, axis: pivotAxisOf(node, modelId), rest: node.quaternion.clone() }
  }
  return { props: rig.props.map((p) => pose(p.node)), gear: rig.gear.map((g) => ({ posed: pose(g.node), rig: g })) }
}

export async function loadPivotedAirframe(modelId: string, url: string, rig: AirframeRig, stores: StoreMounts | undefined, acquire: (url: string) => Promise<ModelInstance> = acquireModel): Promise<Airframe> {
  const instance = await acquire(url)
  const bound = ((): ReturnType<typeof bind> => {
    try {
      return bind(instance, modelId, rig)
    } catch (e) {
      instance.release()
      throw e
    }
  })()
  const root = new Group()
  root.name = modelId
  root.add(instance.root)
  root.traverse((o) => { o.receiveShadow = true })
  // Stores hang from the FLYING spec's mounts (sortie forms A4; wildcat.ts's O1 pattern). An R3
  // model is built level in the sim frame (R3 P13), so the stores sit parallel to x (pitch 0).
  // tests/tools/models/wildcatMounts.test.ts holds every content spec's mounts to the wing of the
  // model it draws; a Dev loadout's borrowed Hellcat layout (SF-R2) hangs where it hangs. If a
  // store model fails to load, primitive stand-ins hang instead and the airplane still flies.
  let hung: { setStores(b: number, r: number): void; dispose(): void } | null = null
  let freeVisuals = (): void => {}
  if (stores !== undefined) {
    const ids = [...stores.racks, ...stores.rails].map((m) => m.store)
    const visuals = await loadStoreVisuals(ids, 0, acquire).catch((e: unknown) => {
      console.warn(`${modelId}: store models failed (${e instanceof Error ? e.message : String(e)}); hanging primitive stand-ins`)
      const trim = new MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.5 })
      const p = primitiveStoreVisuals(stores, trim)
      return { ...p, release: () => { p.dispose(); trim.dispose() } }
    })
    try {
      hung = attachStores(root, stores, visuals)
    } catch (e) {
      visuals.release()
      instance.release()
      throw e
    }
    freeVisuals = visuals.release
  }
  let propRad = 0
  let disposed = false
  return {
    root,
    parts: stores === undefined ? rigParts(rig) : [...rigParts(rig), 'stores'],
    setStores: (b, r) => { hung?.setStores(b, r) },
    update(u): void {
      propRad = propAngle(propRad, u.throttle, u.frameS)
      for (const p of bound.props) p.node.quaternion.copy(turnedAbout(p.rest, p.axis, propRad))
      for (const g of bound.gear) g.posed.node.quaternion.copy(turnedAbout(g.posed.rest, g.posed.axis, gearAngleRad(g.rig, u.gearFraction)))
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
