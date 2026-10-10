// src/render/scene/pivotedAirframe.ts
import { Group, MeshStandardMaterial, Quaternion, Vector3, type Object3D } from 'three'
import { propAngle, type Airframe, type PartId } from './airframe.js'
import { acquireModel, type ModelInstance } from '../models/modelCache.js'
import { BAY_DOOR_OPEN_DEG, SURFACE_MAX_DEG, surfaceDrive, type AirframeRig, type GearRig, type SurfaceInput, type TurretArc } from './airframeRigs.js'
import { attachStores, primitiveStoreVisuals, type StoreMounts } from './stores.js'
import { loadStoreVisuals } from './storeModels.js'
import { createRng } from '../../sim/rng.js'

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
  if ((rig.doors ?? []).length > 0) parts.push('doors')
  if (Object.keys(rig.turretArcs ?? {}).length > 0) parts.push('turrets')
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

type V3 = readonly [number, number, number]
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/**
 * The turns that point a turret's guns along `aim` (airframe frame), clamped to its arc: `traverseRad`
 * about the turret's axis from rest, and `elevationRad` about the guns' trunnion from their modeled
 * elevation. The rest heading is up x trunnion, which the build orients so a positive turn raises the
 * muzzle. Pure, so the angles are a test (pivotedAirframe.test.ts).
 */
export function turretAim(aim: V3, turretAxis: V3, gunsAxis: V3, arc: TurretArc): { traverseRad: number; elevationRad: number } {
  const deg = Math.PI / 180
  const heading: V3 = [gunsAxis[2], 0, -gunsAxis[0]]
  const flat: V3 = [aim[0], 0, aim[2]]
  const along = Math.hypot(flat[0], flat[2])
  // Straight up or down has no heading: hold the rest heading.
  let traverse = along < 1e-9 ? 0 : Math.atan2(dot(cross(heading, flat), turretAxis), dot(heading, flat))
  if (arc.traverseDeg !== null) traverse = clamp(traverse, -arc.traverseDeg * deg, arc.traverseDeg * deg)
  const elevation = clamp(Math.atan2(aim[1], along), arc.elevationDeg[0] * deg, arc.elevationDeg[1] * deg)
  return { traverseRad: traverse, elevationRad: elevation - arc.restElevationDeg * deg }
}

/** How fast a turret turns and its guns elevate, degrees a second: cosmetic, an ESTIMATE. */
export const TURRET_SLEW_DEG_S = 60

/** `current` turned toward `target` (radians, the short way round) by at most the slew rate over `dtS`; dtS <= 0 snaps. */
function slewAngle(current: number, target: number, dtS: number): number {
  if (dtS <= 0) return target
  const d = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  const step = (TURRET_SLEW_DEG_S * Math.PI / 180) * dtS
  return current + clamp(d, -step, step)
}

interface Posed { readonly node: Object3D; readonly axis: Vector3; readonly rest: Quaternion }

/** Seconds a broken-off part tumbles before it is gone from sight. ESTIMATE. */
export const DEBRIS_S = 12

/** One loose part's flight from the explosion, in world meters off where the rig puts it, and its
 *  spin: a pure function of (seconds since, seed), so a replay scrubbed backwards reassembles the
 *  airplane. It is thrown out at 6-18 m/s, mostly upward, its own drag stopping it within a few
 *  seconds (tau 1.5 s), and drops away from the falling fuselage at 2-5 m/s^2. ESTIMATE, all of it. */
export function debrisFlight(ageS: number, seed: number): { readonly offset: Vector3; readonly axis: Vector3; readonly angleRad: number } {
  const r = createRng(seed)
  const dir = new Vector3(r() * 2 - 1, r() * 0.8 + 0.2, r() * 2 - 1).normalize()
  const speed = 6 + 12 * r(), drop = 2 + 3 * r(), tau = 1.5
  const axis = new Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize()
  const spin = 4 + 8 * r()
  const offset = dir.multiplyScalar(speed * tau * (1 - Math.exp(-ageS / tau))).add(new Vector3(0, -0.5 * drop * ageS * ageS, 0))
  return { offset, axis, angleRad: spin * ageS }
}

interface Turret {
  readonly turret: Posed
  readonly guns: Posed
  readonly arc: TurretArc
  /** Both axes in the airframe frame at rest, for `turretAim`. */
  readonly turretAxis: V3
  readonly gunsAxis: V3
  traverse: number
  elevation: number
}

function bind(instance: ModelInstance, modelId: string, rig: AirframeRig): { props: Posed[]; gear: { posed: Posed; rig: GearRig }[]; surfaces: { posed: Posed; name: string; input: SurfaceInput }[]; doors: Posed[]; turrets: Turret[] } {
  const pose = (name: string): Posed => {
    const node = instance.node(name)
    return { node, axis: pivotAxisOf(node, modelId), rest: node.quaternion.clone() }
  }
  return {
    props: rig.props.map((p) => pose(p.node)),
    gear: rig.gear.map((g) => ({ posed: pose(g.node), rig: g })),
    surfaces: (rig.surfaces ?? []).map((n) => ({ posed: pose(n), name: n, input: surfaceDrive(n).input })),
    doors: (rig.doors ?? []).map(pose),
    turrets: Object.entries(rig.turretArcs ?? {}).map(([name, arc]) => {
      const turret = pose(name)
      const gunsNode = instance.node(`${name}Guns`)
      if (gunsNode.parent !== turret.node.parent) throw new Error(`${modelId}: ${name}Guns and ${name} must share a parent`)
      const gunsAxis = pivotAxisOf(gunsNode, modelId)
      // Hung under its turret, the guns traverse with it; their axis moves into the turret's frame.
      turret.node.attach(gunsNode)
      const local = gunsAxis.clone().applyQuaternion(turret.node.quaternion.clone().invert())
      return {
        turret, arc, traverse: 0, elevation: 0,
        guns: { node: gunsNode, axis: local, rest: gunsNode.quaternion.clone() },
        turretAxis: turret.axis.toArray() as unknown as V3, gunsAxis: gunsAxis.toArray() as unknown as V3,
      }
    }),
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
  let propRad = 0
  const stick = { roll: 0, pitch: 0, yaw: 0 }
  // Damage stages (2026-10-09): what breaks away in a mid-air explosion, and where each sits whole.
  const loose = [...bound.props, ...bound.surfaces.map((x) => x.posed)].map((p) => ({ node: p.node, restPosition: p.node.position.clone() }))
  const scratch = new Vector3()
  let disposed = false
  return {
    root,
    parts: stores === undefined ? rigParts(rig) : [...rigParts(rig), 'stores'],
    setStores: (b, r) => { hung?.setStores(b, r) },
    update(u): void {
      propRad = propAngle(propRad, u.throttle, u.frameS)
      for (const p of bound.props) p.node.quaternion.copy(turnedAbout(p.rest, p.axis, propRad))
      for (const g of bound.gear) g.posed.node.quaternion.copy(turnedAbout(g.posed.rest, g.posed.axis, gearAngleRad(g.rig, u.gearFraction)))
      // Bay doors (C2): the sim's door fraction, about each door's own hinge.
      const doorRad = (Math.min(1, Math.max(0, Number.isFinite(u.bayDoorFraction) ? u.bayDoorFraction : 0)) * BAY_DOOR_OPEN_DEG * Math.PI) / 180
      for (const d of bound.doors) d.node.quaternion.copy(turnedAbout(d.rest, d.axis, doorRad))
      for (const k of ['roll', 'pitch', 'yaw'] as const) stick[k] = slewToward(stick[k], u.controls[k], u.frameS)
      for (const s of bound.surfaces) {
        // Flaps already move at the sim's own travel rate (C1 Ruling R3), so they are not slewed again.
        const v = s.input === 'flap' ? u.flapFraction : stick[s.input]
        s.posed.node.quaternion.copy(turnedAbout(s.posed.rest, s.posed.axis, surfaceAngleRad(s.name, v)))
      }
      for (const t of bound.turrets) {
        const want = u.aim ? turretAim([u.aim.x, u.aim.y, u.aim.z], t.turretAxis, t.gunsAxis, t.arc) : { traverseRad: 0, elevationRad: 0 }
        t.traverse = slewAngle(t.traverse, want.traverseRad, u.frameS)
        t.elevation = slewAngle(t.elevation, want.elevationRad, u.frameS)
        t.turret.node.quaternion.copy(turnedAbout(t.turret.rest, t.turret.axis, t.traverse))
        t.guns.node.quaternion.copy(turnedAbout(t.guns.rest, t.guns.axis, t.elevation))
      }
      const debris = u.debris ?? null
      loose.forEach((l, i) => {
        l.node.position.copy(l.restPosition)
        l.node.visible = debris === null || debris.ageS < DEBRIS_S
        if (debris === null || l.node.parent === null) return
        const f = debrisFlight(debris.ageS, (debris.seed + Math.imul(i + 1, 0x9e3779b1)) >>> 0)
        l.node.parent.updateWorldMatrix(true, false)
        scratch.copy(l.restPosition)
        l.node.parent.localToWorld(scratch).add(f.offset)
        l.node.position.copy(l.node.parent.worldToLocal(scratch))
        l.node.quaternion.multiply(new Quaternion().setFromAxisAngle(f.axis, f.angleRad))
      })
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
