import { BoxGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from 'three'
import type { Projectile } from '../../sim/weapons/combat.js'
import { length, scale, sub, v3, type Vec3 } from '../../sim/math/vec3.js'
import { quatFromXTo, type TracerInstance } from './tracers.js'

/**
 * Anti-aircraft tracers (M2), drawn from the AA rounds in `World.combat.projectiles` (`Projectile.aa`).
 * A gun round's 0.18 m streak (`tracers.ts`) is invisible at the ranges AA fights at, so these are
 * drawn longer and thicker, and thicker still with distance: about 2 pixels at 1440p whatever the
 * range, which is what keeps a tracer legible across a mile of air. Legibility choices, not calibres.
 */
export const AA_TRACER_CAPACITY = 384
/** Shortest streak drawn, metres: about a fortieth of a second of an 880 m/s round's flight. */
export const AA_TRACER_MIN_LENGTH_M = 20
/** Thinnest streak, metres, up close. */
export const AA_TRACER_MIN_WIDTH_M = 0.3
/** Width per metre of distance from the eye (2 px at 1440p with a 60 degree view is about 0.0014 rad). */
export const AA_TRACER_WIDTH_PER_M = 0.0014

export type AaTracerInstance = TracerInstance & { readonly widthM: number }

/** The pure half: which AA tracers to draw, nearest to `eye` first, at most `capacity`. */
export function aaTracerInstances(projectiles: readonly Projectile[], eye: Vec3, capacity = AA_TRACER_CAPACITY): AaTracerInstance[] {
  const out: (AaTracerInstance & { readonly d: number })[] = []
  for (const p of projectiles) {
    if (p.aa === undefined || p.gunner === true || !p.tracer) continue
    const speed = length(p.velocity)
    const dir = speed > 1e-9 ? scale(p.velocity, 1 / speed) : v3(1, 0, 0)
    const lengthM = Math.max(length(sub(p.position, p.previous)), AA_TRACER_MIN_LENGTH_M)
    const d = length(sub(p.position, eye))
    out.push({ position: sub(p.position, scale(dir, lengthM / 2)), attitude: quatFromXTo(dir), lengthM, widthM: Math.max(AA_TRACER_MIN_WIDTH_M, d * AA_TRACER_WIDTH_PER_M), d })
  }
  return out.sort((a, b) => a.d - b.d).slice(0, capacity)
}

export function createAaTracers(capacity = AA_TRACER_CAPACITY): {
  readonly object: InstancedMesh
  update(projectiles: readonly Projectile[], eye: Vec3): void
} {
  // A unit box along +X; scale sets the streak. Unlit and orange-red: a tracer is a light source.
  const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: 0xff6a2e }), capacity)
  mesh.frustumCulled = false
  mesh.count = 0
  mesh.visible = false
  const matrix = new Matrix4(), position = new Vector3(), rotation = new Quaternion(), size = new Vector3()
  return {
    object: mesh,
    update(projectiles: readonly Projectile[], eye: Vec3): void {
      const instances = aaTracerInstances(projectiles, eye, capacity)
      instances.forEach((t, i) => {
        position.set(t.position.x, t.position.y, t.position.z)
        rotation.set(t.attitude.x, t.attitude.y, t.attitude.z, t.attitude.w)
        size.set(t.lengthM, t.widthM, t.widthM)
        mesh.setMatrixAt(i, matrix.compose(position, rotation, size))
      })
      mesh.count = instances.length
      mesh.visible = instances.length > 0
      mesh.instanceMatrix.needsUpdate = true
    },
  }
}
