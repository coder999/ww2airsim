// src/render/scene/vehicleRig.ts
import { BufferAttribute, Mesh, Quaternion, Vector3, type BufferGeometry, type Material, type Object3D, type Texture } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { attribute, cos, positionLocal, sin, uniform, vec3 } from 'three/tsl'
import type { ShipMountView } from './ship.js'

/**
 * The two ground vehicles come alive (V1, Mark 2026-10-09): the Chi-Ha's turret trains and its gun
 * elevates, its tracks run and its wheels turn; the jeep's wheels turn and its front wheels steer,
 * with the steering wheel turning to match. Render only: no vehicle is in the sim, so the Hangar's
 * bench drives a rig with a distance travelled and a steer fraction.
 *
 * Frame: the vehicles' glb frame, +x forward, +y up, +z starboard (the airframes' and ships').
 */
export type VehiclePart = 'turrets' | 'drive' | 'steer'

export interface VehicleRig {
  /** What the bench offers for this vehicle. */
  readonly parts: readonly VehiclePart[]
  /** The turret as a mount the Hangar's Train mounts sweep moves, like a ship's (empty for the jeep). */
  readonly mounts: readonly ShipMountView[]
  /** `distanceM` travelled since rest (+ forward; the wheels and tracks are a function of it, so
   *  any frame rate shows the same pose), and `steer` in [-1, 1], + to starboard. */
  drive(distanceM: number, steer: number): void
  /** The pose read back off the scene graph and materials, radians and texture u (E2E, `__hangar.vehicle`). */
  state(): Readonly<Record<string, number>>
  dispose(): void
}

/** The angle of a rotation about one axis, read back off a quaternion (identity at rest). */
const angleAbout = (q: Quaternion, axis: Vector3): number => 2 * Math.atan2(q.x * axis.x + q.y * axis.y + q.z * axis.z, q.w)

/**
 * Type 97 57 mm tank gun: elevation -15 to +20 degrees, English Wikipedia "Type 97 57 mm tank gun",
 * read 2026-10-09 (the page gives no source for it). The turret traverses 360 degrees (same page's
 * vehicle, "Type 97 Chi-Ha"); the gun's own 10 degree traverse in its mantlet is not modeled.
 */
export const CHI_HA_GUN = { minElevationRad: (-15 * Math.PI) / 180, maxElevationRad: (20 * Math.PI) / 180 } as const

/**
 * The Willys MB's steering. SECONDARY: kaiserwillys.com's MB steering listing gives a Ross cam and
 * lever gear, variable ratio 19-16.7-19 to 1 (read through a search summary 2026-10-09; the page
 * refused a direct read); the center ratio is used throughout. ESTIMATE: 28 degrees of wheel lock,
 * near the 29 degree turning angle the same site lists for later Willys utility models.
 */
export const JEEP_STEERING = { ratio: 16.7, lockRad: (28 * Math.PI) / 180 } as const

/** How far round the rim the driver's hands follow the wheel before they stay put and let it turn
 *  under them, as a driver shuffles his grip. ESTIMATE (V1). */
export const HAND_FOLLOW_RAD = (30 * Math.PI) / 180

/** Figures that ride in a vehicle (V1), by its model id: each loads at the vehicle's origin, in its
 *  own frame, before the rig is built, so the rig can move their arms. */
export const VEHICLE_RIDERS: Readonly<Record<string, readonly string[]>> = { 'willys-mb-jeep': ['us-army-driver'] }

/** A wheel's radius and center for the hull's spin shader: one per round shell of the running gear. */
export interface WheelShell { readonly cx: number; readonly cy: number; readonly radius: number; readonly vertices: readonly number[] }

/**
 * The round shells of a tank hull's running gear (road wheels, sprocket, idler, return rollers), by
 * connected component of its welded vertices: a shell outboard of `minAbsZ`, below `maxY`, whose
 * side view is close to square (round) and whose size is a wheel's. Everything else (bogie beams,
 * springs, the hull) stays still. Pure, so a Node test reads the real glb's answer.
 */
export function wheelShells(geometry: BufferGeometry, minAbsZ: number, maxY: number): WheelShell[] {
  const pos = geometry.getAttribute('position')
  const n = pos.count
  const parent = Array.from({ length: n }, (_, i) => i)
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]! } return i }
  const union = (a: number, b: number): void => { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra }
  const seen = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    const k = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`
    const j = seen.get(k)
    if (j === undefined) seen.set(k, i)
    else union(i, j)
  }
  const index = geometry.getIndex()
  if (index !== null) for (let t = 0; t < index.count; t += 3) { union(index.getX(t), index.getX(t + 1)); union(index.getX(t), index.getX(t + 2)) }
  const shells = new Map<number, number[]>()
  for (let i = 0; i < n; i++) { const r = find(i); const l = shells.get(r); if (l) l.push(i); else shells.set(r, [i]) }
  const out: WheelShell[] = []
  for (const vs of shells.values()) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (const i of vs) {
      x0 = Math.min(x0, pos.getX(i)); x1 = Math.max(x1, pos.getX(i))
      y0 = Math.min(y0, pos.getY(i)); y1 = Math.max(y1, pos.getY(i))
      z0 = Math.min(z0, pos.getZ(i)); z1 = Math.max(z1, pos.getZ(i))
    }
    const dx = x1 - x0, dy = y1 - y0
    const round = Math.abs(dx - dy) <= 0.15 * Math.max(dx, dy)
    if (!round || Math.max(dx, dy) < 0.08 || Math.min(Math.abs(z0), Math.abs(z1)) < minAbsZ || y1 > maxY) continue
    out.push({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, radius: Math.max(dx, dy) / 2, vertices: vs })
  }
  return out.sort((a, b) => a.cx - b.cx || a.cy - b.cy)
}

/**
 * How far a track's texture moves per meter travelled, in u: the median |du| / length over the
 * mesh's edges that run along the belt (nearly constant v). Measured off the mesh, so a re-export
 * with another UV scale cannot leave the tread slipping against the wheels.
 */
export function treadUPerMeter(geometry: BufferGeometry): number {
  const pos = geometry.getAttribute('position'), uv = geometry.getAttribute('uv')
  const index = geometry.getIndex()
  if (!index || !uv) throw new Error('treadUPerMeter: the track mesh needs an index and uvs')
  const ratios: number[] = []
  const a = new Vector3(), b = new Vector3()
  for (let t = 0; t < index.count; t += 3) {
    for (let k = 0; k < 3; k++) {
      const i = index.getX(t + k), j = index.getX(t + ((k + 1) % 3))
      const dv = Math.abs(uv.getY(i) - uv.getY(j)), du = Math.abs(uv.getX(i) - uv.getX(j))
      const len = a.fromBufferAttribute(pos, i).distanceTo(b.fromBufferAttribute(pos, j))
      if (len > 0.05 && dv < 0.01 * du) ratios.push(du / len)
    }
  }
  if (ratios.length === 0) throw new Error('treadUPerMeter: no edge runs along the belt')
  ratios.sort((x, y) => x - y)
  return ratios[Math.floor(ratios.length / 2)]!
}

/** three's own MeshStandardMaterial-to-node conversion (NodeLibrary.fromMaterial), so the copy
 *  draws exactly as the loaded material would, then takes a node graph. */
function nodeMaterialFrom(src: Material): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial()
  for (const key in src) (m as unknown as Record<string, unknown>)[key] = (src as unknown as Record<string, unknown>)[key]
  return m
}

function meshesOf(root: Object3D): Mesh[] {
  const out: Mesh[] = []
  root.traverse((o) => { if (o instanceof Mesh) out.push(o) })
  return out
}

const materialName = (m: Mesh): string => (Array.isArray(m.material) ? '' : (m.material as Material).name)

function need<T>(v: T | undefined | null, what: string): T {
  if (v === undefined || v === null) throw new Error(`vehicle rig: no ${what}`)
  return v
}

/** The Chi-Ha: Turret1 trains, Gun1 (re-parented under it) elevates, the hull's wheel shells spin in
 *  a vertex shader (one draw, not one per wheel), and the track's texture scrolls. */
function rigChiHa(root: Object3D): VehicleRig {
  const turret = need(root.getObjectByName('Turret1'), 'Turret1')
  const gun = need(root.getObjectByName('Gun1'), 'Gun1')
  turret.attach(gun)
  const meshes = meshesOf(root)
  const hull = need(meshes.find((m) => m !== turret && m !== gun && materialName(m) === 'Type_97'), 'hull mesh (material Type_97)')
  const track = need(meshes.find((m) => materialName(m) === 'Track'), 'track mesh (material Track)')

  // The wheels: a per-vertex (center x, center y, 1 / radius) the shader turns about. 0 = still.
  const shells = wheelShells(hull.geometry, 0.6, 1.25)
  const wheel = new Float32Array(hull.geometry.getAttribute('position').count * 3)
  for (const s of shells) for (const i of s.vertices) wheel.set([s.cx, s.cy, 1 / s.radius], 3 * i)
  const originalGeometry = hull.geometry
  hull.geometry = hull.geometry.clone()
  hull.geometry.setAttribute('wheelSpin', new BufferAttribute(wheel, 3))
  const travelled = uniform(0)
  const hullMaterial = nodeMaterialFrom(hull.material as Material)
  const w = attribute('wheelSpin', 'vec3')
  // Rolling forward (+x) turns a wheel clockwise seen from starboard: -distance / radius about +z.
  // ponytail: the normals are not turned with the wheels; their faces are mostly the flat sides, which a
  // turn about z leaves unchanged. Turn normalNode too if the treads ever show it.
  const angle = travelled.mul(w.z).negate()
  const local = positionLocal.sub(vec3(w.x, w.y, 0))
  hullMaterial.positionNode = vec3(
    local.x.mul(cos(angle)).sub(local.y.mul(sin(angle))).add(w.x),
    local.x.mul(sin(angle)).add(local.y.mul(cos(angle))).add(w.y),
    positionLocal.z,
  )
  const originalHull = hull.material
  hull.material = hullMaterial

  // The track: its own material and texture copies, so scrolling never moves another instance's tread.
  const uPerM = treadUPerMeter(track.geometry)
  const originalTrack = track.material as Material & { map?: Texture | null; normalMap?: Texture | null }
  const trackMaterial = (originalTrack as Material).clone() as Material & { map?: Texture | null; normalMap?: Texture | null }
  const treads: Texture[] = []
  for (const key of ['map', 'normalMap'] as const) {
    const t = originalTrack[key]
    if (t) { const c = t.clone(); trackMaterial[key] = c; treads.push(c) }
  }
  track.material = trackMaterial

  const rest = { turret: turret.quaternion.clone(), gun: gun.quaternion.clone() }
  const Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1), q = new Quaternion()
  const mount: ShipMountView = {
    name: 'Turret1',
    kit: 'type97-57mm',
    maxElevationRad: CHI_HA_GUN.maxElevationRad,
    setTraining(rad) { turret.quaternion.copy(rest.turret).multiply(q.setFromAxisAngle(Y, rad)) },
    setElevation(rad) {
      const e = Math.min(Math.max(rad, CHI_HA_GUN.minElevationRad), CHI_HA_GUN.maxElevationRad)
      gun.quaternion.copy(rest.gun).multiply(q.setFromAxisAngle(Z, e))
    },
  }
  return {
    parts: ['turrets', 'drive'],
    mounts: [mount],
    drive(distanceM) {
      travelled.value = distanceM
      // On the ground run u falls as x rises (measured on the built glb 2026-10-09), and that run must
      // move aft as the tank moves forward, so the offset falls with distance.
      for (const t of treads) t.offset.x = -distanceM * uPerM
    },
    state: () => ({
      turretYawRad: angleAbout(turret.quaternion, Y),
      gunElevationRad: angleAbout(gun.quaternion, Z),
      treadOffsetU: treads[0]?.offset.x ?? 0,
      wheelTravelM: travelled.value,
      wheelShells: shells.length,
    }),
    dispose() {
      hull.geometry.dispose()
      hull.geometry = originalGeometry
      hull.material = originalHull
      hullMaterial.dispose()
      track.material = originalTrack
      trackMaterial.dispose()
      for (const t of treads) t.dispose()
    },
  }
}

/** The jeep: four wheel nodes spin about their axles, the front pair also steer, and the steering
 *  wheel turns about its column by the gear ratio. A driver riding in it (VEHICLE_RIDERS) keeps
 *  his hands on the rim: each arm swings about its shoulder after its grip point. */
function rigJeep(root: Object3D): VehicleRig {
  const wheels = (['WheelFL', 'WheelFR', 'WheelRL', 'WheelRR'] as const).map((n) => need(root.getObjectByName(n), n))
  const steering = need(root.getObjectByName('SteeringWheel'), 'SteeringWheel')
  // The column's axis as the build recorded it (the pivot's extras), turned to point up, at the driver.
  const column = new Vector3().fromArray(need(steering.userData['pivotAxis'] as number[] | undefined, 'SteeringWheel pivotAxis'))
  if (column.y < 0) column.negate()
  const radius = (o: Object3D): number => {
    const m = need(meshesOf(o)[0], `${o.name} mesh`)
    m.geometry.computeBoundingBox()
    const b = m.geometry.boundingBox!
    return Math.max(b.max.y - b.min.y, b.max.x - b.min.x) / 2
  }
  const radii = wheels.map(radius)
  const rest = steering.quaternion.clone(), q = new Quaternion()
  for (const w of wheels) w.rotation.order = 'YXZ' // steer about y after spinning about the axle (z)
  // The driver's arms, if he rides: shoulder (the arm's pivot) and grip (its farthest vertex, the gloved
  // hand on the rim), both in the jeep's frame, as the figure is built in it.
  root.updateMatrixWorld(true)
  const toJeep = root.matrixWorld.clone().invert()
  const arms = (['ArmL', 'ArmR'] as const).flatMap((n) => {
    const arm = root.getObjectByName(n)
    if (!arm) return []
    const m = need(meshesOf(arm)[0], `${n} mesh`)
    const p = m.geometry.getAttribute('position'), v = new Vector3()
    let far = 0
    const grip = new Vector3()
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); if (v.length() > far) { far = v.length(); grip.copy(v) } }
    grip.applyMatrix4(m.matrixWorld).applyMatrix4(toJeep)
    const shoulder = arm.getWorldPosition(new Vector3()).applyMatrix4(toJeep)
    return [{ arm, rest: arm.quaternion.clone(), shoulder, grip, reach: grip.clone().sub(shoulder).normalize() }]
  })
  const pivot = steering.getWorldPosition(new Vector3()).applyMatrix4(toJeep)
  const g = new Vector3(), qa = new Quaternion()
  return {
    parts: ['drive', 'steer'],
    mounts: [],
    drive(distanceM, steer) {
      const s = Math.min(Math.max(steer, -1), 1)
      wheels.forEach((w, i) => {
        w.rotation.z = -distanceM / radii[i]!
        if (i < 2) w.rotation.y = -s * JEEP_STEERING.lockRad
      })
      // Turning right is clockwise to the driver, who looks down the column (-axis): a negative turn about it.
      const turn = -s * JEEP_STEERING.lockRad * JEEP_STEERING.ratio
      steering.quaternion.copy(rest).multiply(q.setFromAxisAngle(column, turn))
      // ponytail: one swing about the shoulder, not a two-bone reach, so a hand drifts a few cm off the
      // rim at the ends of its follow; bend the elbow (two-bone IK) if that ever shows.
      q.setFromAxisAngle(column, Math.min(Math.max(turn, -HAND_FOLLOW_RAD), HAND_FOLLOW_RAD))
      for (const a of arms) {
        g.copy(a.grip).sub(pivot).applyQuaternion(q).add(pivot).sub(a.shoulder).normalize()
        a.arm.quaternion.copy(qa.setFromUnitVectors(a.reach, g)).multiply(a.rest)
      }
    },
    state: () => ({
      // How far the farther hand is from where its grip has turned to on the rim, meters; -1 with no driver.
      handOffRimM: arms.length === 0 ? -1 : Math.max(...arms.map((a) => {
        const now = a.grip.clone().sub(a.shoulder).applyQuaternion(a.arm.quaternion).add(a.shoulder)
        return now.distanceTo(a.grip.clone().sub(pivot).applyQuaternion(q).add(pivot))
      })),
      frontSteerRad: wheels[0]!.rotation.y,
      wheelSpinRad: wheels[2]!.rotation.z,
      steeringWheelRad: angleAbout(steering.quaternion, column),
    }),
    dispose() {},
  }
}

/** Each animated vehicle's rig, by its model id (STATIC_MODELS.vehicle). */
export const VEHICLE_RIGS: Readonly<Record<string, (root: Object3D) => VehicleRig>> = {
  'type97-chi-ha': rigChiHa,
  'willys-mb-jeep': rigJeep,
}
