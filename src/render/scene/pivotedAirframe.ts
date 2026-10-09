// src/render/scene/pivotedAirframe.ts
import { Group, MeshStandardMaterial, Quaternion, Vector3, type Object3D } from 'three'
import { propAngle, type Airframe, type PartId } from './airframe.js'
import { acquireModel, type ModelInstance } from '../models/modelCache.js'
import { SURFACE_MAX_DEG, surfaceDrive, type AirframeRig, type GearRig, type SurfaceInput } from './airframeRigs.js'
import { attachStores, primitiveStoreVisuals, type StoreMounts } from './stores.js'
import { loadStoreVisuals } from './storeModels.js'
import { BAY_DOOR_OPEN_DEG, buildBayDoors } from './bayDoors.js'

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
  const inputs = new Set((rig.surfaces ?? []).map((n) => surfaceDrive(n).input))
  if (rig.props.length > 0) parts.push('prop')
  if (rig.gear.length > 0) parts.push('gear')
  if (inputs.has('flap')) parts.push('flaps')
  if (inputs.has('roll') || inputs.has('pitch') || inputs.has('yaw')) parts.push('surfaces')
  if (rig.bays !== undefined || (rig.doors ?? []).length > 0) parts.push('doors')
  return parts
}

/** Seconds a surface takes from one stop to the other: cosmetic (C1 Ruling R1), so a keyboard's
 *  instant full stick still shows as a sweep. A guess, for Mark's eye at the batch checkpoint. */
export const SURFACE_SWEEP_S = 0.3

/** `current` moved toward `target` by at most a full sweep's rate over `dtS`; dtS <= 0 snaps (a bench pose). */
export function slewToward(current: number, target: number, dtS: number): number {
  if (dtS <= 0) return target
  const step = (2 / SURFACE_SWEEP_S) * dtS
  return current + Math.max(-step, Math.min(step, target - current))
}

/** Radians a surface turns about its hinge at `value` (a command in [-1, 1], or a flap fraction in [0, 1]). */
export function surfaceAngleRad(node: string, value: number): number {
  const d = surfaceDrive(node)
  const v = Math.max(d.input === 'flap' ? 0 : -1, Math.min(1, value))
  return (d.sign * v * SURFACE_MAX_DEG[d.input] * Math.PI) / 180
}

interface Posed { readonly node: Object3D; readonly axis: Vector3; readonly rest: Quaternion }

function bind(instance: ModelInstance, modelId: string, rig: AirframeRig): { props: Posed[]; gear: { posed: Posed; rig: GearRig }[]; surfaces: { posed: Posed; name: string; input: SurfaceInput }[]; doors: Posed[] } {
  const pose = (name: string): Posed => {
    const node = instance.node(name)
    return { node, axis: pivotAxisOf(node, modelId), rest: node.quaternion.clone() }
  }
  return {
    props: rig.props.map((p) => pose(p.node)),
    gear: rig.gear.map((g) => ({ posed: pose(g.node), rig: g })),
    surfaces: (rig.surfaces ?? []).map((n) => ({ posed: pose(n), name: n, input: surfaceDrive(n).input })),
    doors: (rig.doors ?? []).map(pose),
  }
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
  const doorPaint = rig.bays === undefined ? null : new MeshStandardMaterial({ color: rig.bays.paint, roughness: 0.55, metalness: 0.2, side: 2 })
  const doors = rig.bays === undefined || doorPaint === null ? null : buildBayDoors(rig.bays.openings, doorPaint)
  if (doors) root.add(doors.group)
  let propRad = 0
  const stick = { roll: 0, pitch: 0, yaw: 0 }
  let disposed = false
  return {
    root,
    parts: stores === undefined ? rigParts(rig) : [...rigParts(rig), 'stores'],
    setStores: (b, r) => { hung?.setStores(b, r) },
    update(u): void {
      propRad = propAngle(propRad, u.throttle, u.frameS)
      for (const p of bound.props) p.node.quaternion.copy(turnedAbout(p.rest, p.axis, propRad))
      for (const g of bound.gear) g.posed.node.quaternion.copy(turnedAbout(g.posed.rest, g.posed.axis, gearAngleRad(g.rig, u.gearFraction)))
      doors?.set(u.bayDoorFraction)
      // Cut doors (C2): the same fraction and swing as the drawn ones, about each door's own hinge.
      const doorRad = (Math.min(1, Math.max(0, Number.isFinite(u.bayDoorFraction) ? u.bayDoorFraction : 0)) * BAY_DOOR_OPEN_DEG * Math.PI) / 180
      for (const d of bound.doors) d.node.quaternion.copy(turnedAbout(d.rest, d.axis, doorRad))
      for (const k of ['roll', 'pitch', 'yaw'] as const) stick[k] = slewToward(stick[k], u.controls[k], u.frameS)
      for (const s of bound.surfaces) {
        // Flaps already move at the sim's own travel rate (C1 Ruling R3), so they are not slewed again.
        const v = s.input === 'flap' ? u.flapFraction : stick[s.input]
        s.posed.node.quaternion.copy(turnedAbout(s.posed.rest, s.posed.axis, surfaceAngleRad(s.name, v)))
      }
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      hung?.dispose()
      doors?.dispose()
      doorPaint?.dispose()
      freeVisuals()
      instance.release()
    },
  }
}
