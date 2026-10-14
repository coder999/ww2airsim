// src/render/scene/vehicleRig.ts
import { BufferAttribute, Mesh, Quaternion, Vector3, type BufferGeometry, type Material, type Object3D, type Texture } from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { attribute, cos, mix, positionLocal, sin, uniform, vec3 } from 'three/tsl'
import type { ShipMountView } from './ship.js'

/**
 * The ground vehicles come alive (V1, Mark 2026-10-09): both tanks' turrets train and guns elevate;
 * the Chi-Ha's tracks run and wheels turn; the wheeled vehicles' wheels turn and steer, with the
 * jeep's steering wheel turning to match. Render only: no vehicle is in the sim, so the Hangar's
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

/** 75 mm M3 in the M34/M34A1 mount: +25 to -10 degrees, Kevin Townsend's
 * M4 Sherman reference sheet, read 2026-10-11. The turret traverses 360 degrees. */
export const M4_75_GUN = { minElevationRad: (-10 * Math.PI) / 180, maxElevationRad: (25 * Math.PI) / 180 } as const

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

/** The connected components of a mesh's welded vertices (vertices at one point count as one), each as
 *  its vertex indices ascending, in order of their lowest index: a solid built from several faces whose
 *  corners the exporter split is still one shell. */
function weldedShells(geometry: BufferGeometry): number[][] {
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
  return [...shells.values()]
}

/**
 * The round shells of a tank hull's running gear (road wheels, sprocket, idler, return rollers), by
 * connected component of its welded vertices: a shell outboard of `minAbsZ`, below `maxY`, whose
 * side view is close to square (round) and whose size is a wheel's. Everything else (bogie beams,
 * springs, the hull) stays still. Pure, so a Node test reads the real glb's answer.
 *
 * `exact` (the Sherman, F4R): a wheel must also be a body of revolution about its own center (every
 * vertex within 10% of its radius of the center, which a square box that merely passes the squareness
 * test is not), and a small fragment standing on a wheel's outboard face (a hub bolt head, its own
 * shell) turns with that wheel: it joins the wheel's vertices rather than becoming a shell of its own.
 */
export function wheelShells(geometry: BufferGeometry, minAbsZ: number, maxY: number, exact = false): WheelShell[] {
  const pos = geometry.getAttribute('position')
  const out: { cx: number; cy: number; radius: number; vertices: number[]; zFar: number }[] = []
  const rest: { cx: number; cy: number; zNear: number; size: number; vertices: number[] }[] = []
  for (const vs of weldedShells(geometry)) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (const i of vs) {
      x0 = Math.min(x0, pos.getX(i)); x1 = Math.max(x1, pos.getX(i))
      y0 = Math.min(y0, pos.getY(i)); y1 = Math.max(y1, pos.getY(i))
      z0 = Math.min(z0, pos.getZ(i)); z1 = Math.max(z1, pos.getZ(i))
    }
    const dx = x1 - x0, dy = y1 - y0
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, radius = Math.max(dx, dy) / 2
    const zNear = Math.min(Math.abs(z0), Math.abs(z1)) * Math.sign(z0 + z1)
    const round = Math.abs(dx - dy) <= 0.15 * Math.max(dx, dy)
    const wheel = round && Math.max(dx, dy) >= 0.08 && Math.min(Math.abs(z0), Math.abs(z1)) >= minAbsZ && y1 <= maxY
    if (wheel && exact && !vs.every((i) => Math.hypot(pos.getX(i) - cx, pos.getY(i) - cy) <= 1.1 * radius)) { rest.push({ cx, cy, zNear, size: Math.max(dx, dy), vertices: vs }); continue }
    if (wheel) out.push({ cx, cy, radius, vertices: vs, zFar: Math.max(Math.abs(z0), Math.abs(z1)) * Math.sign(z0 + z1) })
    else rest.push({ cx, cy, zNear, size: Math.max(dx, dy), vertices: vs })
  }
  if (exact) {
    for (const f of rest) {
      if (f.size > 0.1) continue
      const w = out.find((o) => Math.sign(o.zFar) === Math.sign(f.zNear) && Math.hypot(o.cx - f.cx, o.cy - f.cy) < 0.8 * o.radius && Math.abs(f.zNear) >= Math.abs(o.zFar) - 0.06)
      if (w) w.vertices = [...w.vertices, ...f.vertices]
    }
  }
  return out.map(({ cx, cy, radius, vertices }) => ({ cx, cy, radius, vertices })).sort((a, b) => a.cx - b.cx || a.cy - b.cy)
}

/** A track built of shoes (the Sherman, F4R): one solid per shoe, identical, in order along the closed
 *  track, a side after a side; `perSide` shoes each. */
export interface TrackShoes {
  readonly perSide: number
  /** How far one shoe moves to take its neighbor's place, m: the median spacing of shoe centers. */
  readonly pitchM: number
  /** Per vertex, where the same vertex of the PREVIOUS shoe on that side stands. A vehicle driving forward
   *  moves its ground run aft, each shoe toward the one before it; blended by the fraction of a pitch
   *  travelled, the whole track slides, and one full pitch is the same picture again. */
  readonly prev: Float32Array
}

export function trackShoes(geometry: BufferGeometry): TrackShoes {
  const pos = geometry.getAttribute('position')
  const shoes = weldedShells(geometry)
  if (shoes.length < 4 || shoes.length % 2 !== 0) throw new Error(`trackShoes: ${shoes.length} shoes, need two equal sides`)
  const size = shoes[0]!.length
  if (shoes.some((v) => v.length !== size)) throw new Error('trackShoes: the shoes are not identical solids')
  const perSide = shoes.length / 2
  const center = shoes.map((vs) => {
    const c = new Vector3()
    for (const i of vs) c.add(new Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)))
    return c.divideScalar(vs.length)
  })
  if (Math.sign(center[0]!.z) === Math.sign(center[perSide]!.z)) throw new Error('trackShoes: the two sides are not one after the other')
  const prev = new Float32Array(pos.count * 3)
  const gaps: number[] = []
  shoes.forEach((vs, s) => {
    const side = Math.floor(s / perSide), before = side * perSide + ((s - side * perSide + perSide - 1) % perSide)
    gaps.push(center[s]!.distanceTo(center[before]!))
    vs.forEach((i, k) => { const j = shoes[before]![k]!; prev[3 * i] = pos.getX(j); prev[3 * i + 1] = pos.getY(j); prev[3 * i + 2] = pos.getZ(j) })
  })
  gaps.sort((x, y) => x - y)
  return { perSide, pitchM: gaps[Math.floor(gaps.length / 2)]!, prev }
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

/** Turns a hull mesh's wheel shells in its vertex shader (one draw for every wheel): each vertex carries
 *  its wheel's (center x, center y, 1 / radius), 0 = still. Rolling forward (+x) turns a wheel clockwise
 *  seen from starboard: -distance / radius about +z. Returns the distance uniform and an undo. */
function spinWheels(hull: Mesh, shells: readonly WheelShell[]): { distance: { value: number }; restore(): void } {
  const wheel = new Float32Array(hull.geometry.getAttribute('position').count * 3)
  for (const s of shells) for (const i of s.vertices) wheel.set([s.cx, s.cy, 1 / s.radius], 3 * i)
  const originalGeometry = hull.geometry
  hull.geometry = hull.geometry.clone()
  hull.geometry.setAttribute('wheelSpin', new BufferAttribute(wheel, 3))
  const travelled = uniform(0)
  const material = nodeMaterialFrom(hull.material as Material)
  const w = attribute('wheelSpin', 'vec3')
  // ponytail: the normals are not turned with the wheels; their faces are mostly the flat sides, which a
  // turn about z leaves unchanged. Turn normalNode too if the treads ever show it.
  const angle = travelled.mul(w.z).negate()
  const local = positionLocal.sub(vec3(w.x, w.y, 0))
  material.positionNode = vec3(
    local.x.mul(cos(angle)).sub(local.y.mul(sin(angle))).add(w.x),
    local.x.mul(sin(angle)).add(local.y.mul(cos(angle))).add(w.y),
    positionLocal.z,
  )
  const originalMaterial = hull.material
  hull.material = material
  return { distance: travelled as unknown as { value: number }, restore() { hull.geometry.dispose(); hull.geometry = originalGeometry; hull.material = originalMaterial; material.dispose() } }
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
  const spin = spinWheels(hull, shells)
  const travelled = spin.distance

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
      spin.restore()
      track.material = originalTrack
      trackMaterial.dispose()
      for (const t of treads) t.dispose()
    },
  }
}

/** The original M4 model authors the same two pivots as the Chi-Ha: a full-yaw Turret1 and its Gun1
 *  child, elevated about +z. Its running gear runs (F4R): the hull's wheel shells (road wheels, rollers,
 *  idler, sprocket and their hub bolts) turn in a vertex shader as the Chi-Ha's do, and the `Tracks`
 *  node's shoes slide along the belt, one pitch of travel for one pitch of shoe. */
function rigSherman(root: Object3D): VehicleRig {
  const turret = need(root.getObjectByName('Turret1'), 'Turret1')
  const gun = need(root.getObjectByName('Gun1'), 'Gun1')
  turret.attach(gun)
  const tracks = need(meshesOf(root).find((m) => m.name === 'Tracks'), 'Tracks mesh')
  const hull = need(meshesOf(root).find((m) => m !== turret && m !== gun && m !== tracks), 'hull mesh')
  const shells = wheelShells(hull.geometry, 0.75, 1.2, true)
  const spin = spinWheels(hull, shells)
  const travelled = spin.distance

  const shoes = trackShoes(tracks.geometry)
  const originalGeometry = tracks.geometry
  tracks.geometry = tracks.geometry.clone()
  tracks.geometry.setAttribute('trackPrev', new BufferAttribute(shoes.prev, 3))
  const phase = uniform(0)
  const trackMaterial = nodeMaterialFrom(tracks.material as Material)
  trackMaterial.positionNode = mix(positionLocal, attribute('trackPrev', 'vec3'), phase)
  const originalTrackMaterial = tracks.material
  tracks.material = trackMaterial
  // ponytail: a shoe's vertices slide straight to the previous shoe's, so on the sprocket and idler (a
  // 33 degree turn per shoe) it shrinks about 4% mid-slide and its normals stay at rest; step the slide
  // along the arc if that ever shows.

  const rest = { turret: turret.quaternion.clone(), gun: gun.quaternion.clone() }
  const Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1), q = new Quaternion()
  const mount: ShipMountView = {
    name: 'Turret1',
    kit: 'm4-75mm',
    maxElevationRad: M4_75_GUN.maxElevationRad,
    setTraining(rad) { turret.quaternion.copy(rest.turret).multiply(q.setFromAxisAngle(Y, rad)) },
    setElevation(rad) {
      const e = Math.min(Math.max(rad, M4_75_GUN.minElevationRad), M4_75_GUN.maxElevationRad)
      gun.quaternion.copy(rest.gun).multiply(q.setFromAxisAngle(Z, e))
    },
  }
  return {
    parts: ['turrets', 'drive'],
    mounts: [mount],
    drive(distanceM) {
      travelled.value = distanceM
      const turns = distanceM / shoes.pitchM
      phase.value = turns - Math.floor(turns)
    },
    state: () => ({
      turretYawRad: angleAbout(turret.quaternion, Y),
      gunElevationRad: angleAbout(gun.quaternion, Z),
      wheelTravelM: travelled.value,
      wheelShells: shells.length,
      trackPhase: phase.value,
      trackShoesPerSide: shoes.perSide,
      trackPitchM: shoes.pitchM,
    }),
    dispose() {
      spin.restore()
      tracks.geometry.dispose()
      tracks.geometry = originalGeometry
      tracks.material = originalTrackMaterial
      trackMaterial.dispose()
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

/** Original F4 wheeled assets: every Wheel* node rolls; WheelF* also steers. */
function rigSimpleWheeled(root: Object3D): VehicleRig {
  const wheels: Object3D[] = []
  root.traverse((o) => { if (/^Wheel/.test(o.name)) wheels.push(o) })
  if (wheels.length === 0) throw new Error('vehicle rig: no Wheel* nodes')
  const front = wheels.filter((w) => /^WheelF/.test(w.name))
  const radius = (o: Object3D): number => {
    const m = need(meshesOf(o)[0], `${o.name} mesh`)
    m.geometry.computeBoundingBox()
    const b = m.geometry.boundingBox!
    return Math.max(b.max.x - b.min.x, b.max.y - b.min.y) / 2
  }
  const radii = wheels.map(radius)
  for (const w of wheels) w.rotation.order = 'YXZ'
  return {
    parts: front.length > 0 ? ['drive', 'steer'] : ['drive'],
    mounts: [],
    drive(distanceM, steer) {
      wheels.forEach((w, i) => { w.rotation.z = -distanceM / radii[i]! })
      for (const w of front) w.rotation.y = -Math.min(Math.max(steer, -1), 1) * JEEP_STEERING.lockRad
    },
    state: () => ({ wheelSpinRad: wheels[0]!.rotation.z, frontSteerRad: front[0]?.rotation.y ?? 0, wheels: wheels.length }),
    dispose() {},
  }
}

function rigFieldGun(root: Object3D): VehicleRig {
  const train = need(root.getObjectByName('Train'), 'Train')
  const barrel = need(root.getObjectByName('Barrel'), 'Barrel')
  train.attach(barrel)
  const rest = { train: train.quaternion.clone(), barrel: barrel.quaternion.clone() }
  const Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1), q = new Quaternion()
  const mount: ShipMountView = {
    name: 'Train', kit: 'type38-75mm', maxElevationRad: Math.PI / 4,
    setTraining(rad) { train.quaternion.copy(rest.train).multiply(q.setFromAxisAngle(Y, Math.min(Math.max(rad, -Math.PI / 12), Math.PI / 12))) },
    setElevation(rad) { barrel.quaternion.copy(rest.barrel).multiply(q.setFromAxisAngle(Z, Math.min(Math.max(rad, -Math.PI / 12), Math.PI / 4))) },
  }
  return {
    parts: ['turrets'], mounts: [mount], drive() {},
    state: () => ({ traverseRad: angleAbout(train.quaternion, Y), elevationRad: angleAbout(barrel.quaternion, Z) }),
    dispose() {},
  }
}

function rigDozer(root: Object3D): VehicleRig {
  const tracks = ['TrackL', 'TrackR'].map((n) => need(root.getObjectByName(n), n))
  const raise = need(root.getObjectByName('BladeRaise'), 'BladeRaise')
  const tilt = need(root.getObjectByName('BladeTilt'), 'BladeTilt')
  const rest = { raise: raise.quaternion.clone(), tilt: tilt.quaternion.clone() }
  const X = new Vector3(1, 0, 0), Z = new Vector3(0, 0, 1), q = new Quaternion()
  const mount: ShipMountView = {
    name: 'Blade', kit: 'd7-blade', maxElevationRad: Math.PI / 6,
    setTraining(rad) { tilt.quaternion.copy(rest.tilt).multiply(q.setFromAxisAngle(X, Math.min(Math.max(rad, -Math.PI / 12), Math.PI / 12))) },
    setElevation(rad) { raise.quaternion.copy(rest.raise).multiply(q.setFromAxisAngle(Z, Math.min(Math.max(rad, 0), Math.PI / 6))) },
  }
  return {
    parts: ['turrets', 'drive'], mounts: [mount],
    drive(distanceM) { for (const t of tracks) t.rotation.z = -distanceM / 0.36 },
    state: () => ({ trackSpinRad: tracks[0]!.rotation.z, bladeRaiseRad: angleAbout(raise.quaternion, Z), bladeTiltRad: angleAbout(tilt.quaternion, X) }),
    dispose() {},
  }
}

function rigLandingCraft(root: Object3D): VehicleRig {
  const ramp = need(root.getObjectByName('Ramp'), 'Ramp')
  const rest = ramp.quaternion.clone(), Z = new Vector3(0, 0, 1), q = new Quaternion()
  const mount: ShipMountView = {
    name: 'Ramp', kit: 'lcvp-bow-ramp', maxElevationRad: 0,
    setTraining() {},
    setElevation(rad) { ramp.quaternion.copy(rest).multiply(q.setFromAxisAngle(Z, Math.min(Math.max(rad, -Math.PI / 2), 0))) },
  }
  return {
    parts: ['turrets'], mounts: [mount], drive() {},
    state: () => ({ rampRad: angleAbout(ramp.quaternion, Z) }), dispose() {},
  }
}

function rigRescueBoat(root: Object3D): VehicleRig {
  const props = ['Prop1', 'Prop2'].map((n) => need(root.getObjectByName(n), n))
  const rudders = ['Rudder1', 'Rudder2'].map((n) => need(root.getObjectByName(n), n))
  return {
    parts: ['drive', 'steer'], mounts: [],
    drive(distanceM, steer) {
      for (const p of props) p.rotation.x = distanceM * 5
      for (const r of rudders) r.rotation.y = -Math.min(Math.max(steer, -1), 1) * Math.PI / 6
    },
    state: () => ({ propRad: props[0]!.rotation.x, rudderRad: rudders[0]!.rotation.y }), dispose() {},
  }
}

function rigSearchlight(root: Object3D): VehicleRig {
  const train = need(root.getObjectByName('Train'), 'Train')
  const lamp = need(root.getObjectByName('Lamp'), 'Lamp')
  const face = need(root.getObjectByName('LampFace'), 'LampFace')
  const marker = need(root.getObjectByName('BeamMarker'), 'BeamMarker')
  train.attach(lamp); lamp.attach(face); lamp.attach(marker)
  const rest = { train: train.quaternion.clone(), lamp: lamp.quaternion.clone() }
  const Y = new Vector3(0, 1, 0), Z = new Vector3(0, 0, 1), q = new Quaternion()
  const mount: ShipMountView = {
    name: 'Searchlight', kit: 'm1942-60in', maxElevationRad: Math.PI / 2,
    setTraining(rad) { train.quaternion.copy(rest.train).multiply(q.setFromAxisAngle(Y, rad)) },
    setElevation(rad) { lamp.quaternion.copy(rest.lamp).multiply(q.setFromAxisAngle(Z, Math.min(Math.max(rad, -Math.PI / 12), Math.PI / 2))) },
  }
  return {
    parts: ['turrets'], mounts: [mount], drive() {},
    state: () => ({ trainRad: angleAbout(train.quaternion, Y), elevationRad: angleAbout(lamp.quaternion, Z) }),
    dispose() {},
  }
}

/** Display-only field equipment that exposes a Hangar review rig. */
export const EQUIPMENT_RIGS: Readonly<Record<string, (root: Object3D) => VehicleRig>> = {
  'm1942-60in-searchlight': rigSearchlight,
}

/** Each animated vehicle's rig, by its model id (STATIC_MODELS.vehicle). */
export const VEHICLE_RIGS: Readonly<Record<string, (root: Object3D) => VehicleRig>> = {
  'caterpillar-d7-3t': rigDozer,
  'gmc-cckw-353': rigSimpleWheeled,
  lcvp: rigLandingCraft,
  'm4-sherman': rigSherman,
  'type97-chi-ha': rigChiHa,
  'type95-kurogane': rigJeep,
  'type38-75mm-field-gun': rigFieldGun,
  'type94-cargo-truck': rigSimpleWheeled,
  'usaaf-63ft-rescue-boat': rigRescueBoat,
  'willys-mb-jeep': rigJeep,
}
