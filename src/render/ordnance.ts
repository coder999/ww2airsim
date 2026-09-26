import {
  BoxGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4,
  MeshBasicMaterial, MeshStandardMaterial, Quaternion, Scene, Vector3, type Object3D,
} from 'three'
import type { Projectile } from '../sim/weapons/combat.js'
import { length, v3, type Vec3 } from '../sim/math/vec3.js'
import { quatFromXTo } from './scene/tracers.js'

/**
 * Ordnance in flight (Plan 6b Task 8), read from `World.combat.projectiles`
 * the same way `tracers.ts` reads it for gun rounds. Pool bounds, spec §4:
 * 8 bombs, 32 rockets -- generous multiples of what one strike flight
 * carries (Task 6: 2 bombs and 6 rockets per Hellcat).
 *
 * Reuses an existing idiom rather than inventing a parallel one: the
 * bomb/rocket/flame pools are `InstancedMesh`, one per kind, built and
 * updated with `tracers.ts`'s exact idiom (`quatFromXTo` for facing,
 * `frustumCulled = false`, `count`/`visible` set from how many are alive
 * this frame, one hoisted `Matrix4`/`Vector3`/`Quaternion` reused every
 * instance rather than allocated per-frame).
 *
 * Impacts are drawn by src/render/fx (E1): the sim reports them
 * (World.combat.impacts).
 */
export const BOMB_CAPACITY = 8
export const ROCKET_CAPACITY = 32

/**
 * How long a rocket's motor flame shows, seconds. Rendering-only estimate:
 * `Projectile` carries no store-type field (only `kind`), so this cannot be
 * read off `content/aircraft/f6f-hellcat.json`'s `stores.types.hvar.burnS`
 * at runtime -- it is mirrored from that figure (1.0 s, itself an estimate
 * per that file's own `stores.source`) the same way `hellcat.ts` mirrors
 * rack/rail offsets, and will drift silently if that content value ever
 * changes.
 */
export const ROCKET_BURN_S = 1.0

/** The pure half: which live projectiles of `kind` to draw, where, and
 *  facing which way -- `tracerInstances`'s twin for a rigid body rather than
 *  a streak (no length to compute; the geometry is already the right size). */
export type OrdnanceInstance = { readonly position: Vec3; readonly attitude: ReturnType<typeof quatFromXTo> }

function directionOf(p: Projectile): Vec3 {
  const speed = length(p.velocity)
  return speed > 1e-9 ? { x: p.velocity.x / speed, y: p.velocity.y / speed, z: p.velocity.z / speed } : v3(1, 0, 0)
}

export function ordnanceInstances(
  projectiles: readonly Projectile[], kind: 'bomb' | 'rocket', capacity: number,
): OrdnanceInstance[] {
  const out: OrdnanceInstance[] = []
  for (const p of projectiles) {
    if (p.kind !== kind) continue
    if (out.length >= capacity) break
    out.push({ position: p.position, attitude: quatFromXTo(directionOf(p)) })
  }
  return out
}

/** Rockets still burning: `ageS < ROCKET_BURN_S`. Same facing as the rocket itself. */
export function flameInstances(projectiles: readonly Projectile[], capacity: number): OrdnanceInstance[] {
  const out: OrdnanceInstance[] = []
  for (const p of projectiles) {
    if (p.kind !== 'rocket' || p.ageS >= ROCKET_BURN_S) continue
    if (out.length >= capacity) break
    out.push({ position: p.position, attitude: quatFromXTo(directionOf(p)) })
  }
  return out
}

function makePool(geometry: BoxGeometry | CylinderGeometry, material: MeshStandardMaterial | MeshBasicMaterial, capacity: number): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, capacity)
  // Instances are scattered over kilometres, like tracers.ts's pool -- never
  // let the mesh's own (wrong) bounding sphere cull the whole set.
  mesh.frustumCulled = false
  mesh.count = 0
  mesh.visible = false
  return mesh
}

export type OrdnanceHandle = {
  readonly object: Object3D
  /** Positions every live bomb/rocket/flame instance from this frame's
   *  projectile list. */
  update(projectiles: readonly Projectile[]): void
}

export function createOrdnance(scene: Scene): OrdnanceHandle {
  const root = new Group()
  root.name = 'ordnance'
  scene.add(root)

  const bombMesh = makePool(new BoxGeometry(0.5, 0.5, 2.2), new MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.6 }), BOMB_CAPACITY)
  root.add(bombMesh)
  const rocketGeometry = new CylinderGeometry(0.07, 0.07, 1.2, 8)
  rocketGeometry.rotateZ(Math.PI / 2)
  const rocketMesh = makePool(rocketGeometry, new MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.6 }), ROCKET_CAPACITY)
  root.add(rocketMesh)
  // The motor flame: a small unlit box at the rocket's own facing, like the
  // rocket itself but never touched by lighting -- it is a light source, the
  // same reasoning tracers.ts gives for its own `MeshBasicMaterial`.
  const flameMesh = makePool(new BoxGeometry(0.5, 0.16, 0.16), new MeshBasicMaterial({ color: 0xffb347 }), ROCKET_CAPACITY)
  root.add(flameMesh)

  // Hoisted once and reused every instance every frame, exactly as
  // `tracers.ts`'s `createTracers` does.
  const matrix = new Matrix4()
  const positionV = new Vector3()
  const rotationQ = new Quaternion()
  const unitScale = new Vector3(1, 1, 1)
  const apply = (mesh: InstancedMesh, instances: readonly OrdnanceInstance[]): void => {
    instances.forEach((inst, i) => {
      positionV.set(inst.position.x, inst.position.y, inst.position.z)
      rotationQ.set(inst.attitude.x, inst.attitude.y, inst.attitude.z, inst.attitude.w)
      mesh.setMatrixAt(i, matrix.compose(positionV, rotationQ, unitScale))
    })
    mesh.count = instances.length
    mesh.visible = instances.length > 0
    mesh.instanceMatrix.needsUpdate = true
  }

  return {
    object: root,
    update(projectiles: readonly Projectile[]): void {
      apply(bombMesh, ordnanceInstances(projectiles, 'bomb', BOMB_CAPACITY))
      apply(rocketMesh, ordnanceInstances(projectiles, 'rocket', ROCKET_CAPACITY))
      apply(flameMesh, flameInstances(projectiles, ROCKET_CAPACITY))
    },
  }
}
