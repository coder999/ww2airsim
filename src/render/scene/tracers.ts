import { BoxGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three'
import type { Projectile } from '../../sim/weapons/combat.js'
import { cross, dot, length, normalize, scale, sub, v3, type Vec3 } from '../../sim/math/vec3.js'
import { qFromAxisAngle, qIdentity, type Quat } from '../../sim/math/quat.js'

/**
 * Tracer rounds, drawn from `World.combat.projectiles` (Plan 6 design:
 * "Tracers ... read simulation state. Rendering is pooled and
 * camera-relative").
 *
 * One `InstancedMesh` of a unit-length box, its instance count set each frame
 * to however many tracers are in flight, never more than `TRACER_CAPACITY`.
 * The design's arithmetic bound is 48 live tracers per continuously firing
 * airplane (six guns, every fifth of 80 rounds a second, over a 3 s life),
 * so 256 covers five airplanes firing at once; anything past it is simply not
 * drawn this frame -- the ROUND still exists and still hits, only its streak
 * is skipped. Positions are raw world metres like every other child of
 * `scene`, which already carries the camera-relative offset.
 */
export const TRACER_CAPACITY = 256

/**
 * The shortest streak drawn, metres. A round covers about 14.7 m per tick at
 * the Hellcat's muzzle velocity, so the streak is normally the tick's own
 * travel; this floor only matters for the frame a round is born on, when
 * `previous` equals `position` and a zero-length box would vanish.
 */
export const MIN_TRACER_LENGTH_M = 3

export type TracerInstance = {
  /** The streak's midpoint, world metres. The FRONT of the streak is the
   *  round's current position; it extends backward along its travel. */
  readonly position: Vec3
  /** Rotation taking the box's +X onto the round's direction of travel. */
  readonly attitude: Quat
  readonly lengthM: number
}

/** The rotation that carries +X onto `dir` (unit), shortest arc. */
export function quatFromXTo(dir: Vec3): Quat {
  const c = dot(v3(1, 0, 0), dir)
  if (c > 1 - 1e-9) return qIdentity()
  // Straight backward: any axis in the y-z plane works; +Y is as good as any.
  if (c < -1 + 1e-9) return qFromAxisAngle(v3(0, 1, 0), Math.PI)
  return qFromAxisAngle(normalize(cross(v3(1, 0, 0), dir)), Math.acos(Math.max(-1, Math.min(1, c))))
}

/** The pure half: which streaks to draw, where, and how long, in order. */
export function tracerInstances(projectiles: readonly Projectile[], capacity = TRACER_CAPACITY): TracerInstance[] {
  const out: TracerInstance[] = []
  for (const p of projectiles) {
    if (!p.tracer) continue
    if (out.length >= capacity) break
    const travel = sub(p.position, p.previous)
    const travelM = length(travel)
    const speed = length(p.velocity)
    const dir = travelM > 1e-9 ? scale(travel, 1 / travelM) : speed > 1e-9 ? scale(p.velocity, 1 / speed) : v3(1, 0, 0)
    const lengthM = Math.max(travelM, MIN_TRACER_LENGTH_M)
    out.push({ position: sub(p.position, scale(dir, lengthM / 2)), attitude: quatFromXTo(dir), lengthM })
  }
  return out
}

export function createTracers(capacity = TRACER_CAPACITY): {
  readonly object: InstancedMesh
  update(projectiles: readonly Projectile[]): void
} {
  // A unit box along +X, scaled per instance to the streak's length. The
  // 0.18 m cross-section is a legibility choice at 1440p, not a calibre.
  // `MeshBasicMaterial`, unlit, for the same reason `impactEffect.ts` uses it:
  // a tracer is its own light source, and the material path already exists
  // under this renderer.
  const mesh = new InstancedMesh(new BoxGeometry(1, 0.18, 0.18), new MeshBasicMaterial({ color: 0xffc46b }), capacity)
  // Instances are scattered over kilometres; the mesh's own bounding sphere
  // would be wrong every frame, so never let it cull the whole set.
  mesh.frustumCulled = false
  mesh.count = 0
  mesh.visible = false
  const matrix = new Matrix4()
  const position = new Vector3()
  const rotation = new Quaternion()
  const size = new Vector3()
  return {
    object: mesh,
    update(projectiles: readonly Projectile[]): void {
      const instances = tracerInstances(projectiles, capacity)
      instances.forEach((t, i) => {
        position.set(t.position.x, t.position.y, t.position.z)
        rotation.set(t.attitude.x, t.attitude.y, t.attitude.z, t.attitude.w)
        size.set(t.lengthM, 1, 1)
        mesh.setMatrixAt(i, matrix.compose(position, rotation, size))
      })
      mesh.count = instances.length
      mesh.visible = instances.length > 0
      mesh.instanceMatrix.needsUpdate = true
    },
  }
}
