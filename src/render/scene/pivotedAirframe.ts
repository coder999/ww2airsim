// src/render/scene/pivotedAirframe.ts
import { Group, Quaternion, Vector3, type Object3D } from 'three'
import { propAngle, type Airframe, type PartId } from './airframe.js'
import { acquireModel, type ModelInstance } from '../models/modelCache.js'
import type { AirframeRig, GearRig } from './airframeRigs.js'
import type { StoreMounts } from './stores.js'

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

/** The bench parts a rig drives. Never stores: a rigged model's mounts were never measured. */
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
  if (stores !== undefined) {
    throw new Error(`${modelId}: a rigged model hangs no stores (its racks and rails were never measured); draw this spec with view.model "wildcat", or measure mounts for ${modelId} first`)
  }
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
  let propRad = 0
  let disposed = false
  return {
    root,
    parts: rigParts(rig),
    setStores(): void {
      // A rigged model hangs no stores: loadPivotedAirframe refuses a spec that has them.
    },
    update(u): void {
      propRad = propAngle(propRad, u.throttle, u.frameS)
      for (const p of bound.props) p.node.quaternion.copy(turnedAbout(p.rest, p.axis, propRad))
      for (const g of bound.gear) g.posed.node.quaternion.copy(turnedAbout(g.posed.rest, g.posed.axis, gearAngleRad(g.rig, u.gearFraction)))
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      instance.release()
    },
  }
}
