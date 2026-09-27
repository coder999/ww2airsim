import {
  BoxGeometry, type BufferGeometry, CylinderGeometry, Group, InstancedMesh, type Material, Matrix4,
  MeshBasicMaterial, MeshStandardMaterial, type PerspectiveCamera, Quaternion, Scene, Vector3, type Object3D,
} from 'three'
import type { Projectile } from '../sim/weapons/combat.js'
import { length, v3, type Vec3 } from '../sim/math/vec3.js'
import { quatFromXTo } from './scene/tracers.js'
import type { StoreVisual } from './scene/stores.js'

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
 *
 * Bombs and rockets draw the O1 store models once `setStoreModels` is called; the primitive
 * box and cylinder are the stand-ins until then. Before O1 the bomb box was long along Z while
 * facing aimed +X, so it flew broadside.
 */
export const BOMB_CAPACITY = 8
export const ROCKET_CAPACITY = 32

/**
 * How long a rocket's motor flame shows, seconds. Rendering-only estimate:
 * `Projectile` carries no store-type field (only `kind`), so this cannot be
 * read off `content/aircraft/f6f-hellcat.json`'s `stores.types.hvar.burnS`
 * at runtime -- it is mirrored from that figure (1.0 s, itself an estimate
 * per that file's own `stores.source`), and will drift silently if that
 * content value ever changes.
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

function makePool(geometry: BufferGeometry, material: Material, capacity: number): InstancedMesh {
  const mesh = new InstancedMesh(geometry, material, capacity)
  // Instances are scattered over kilometres, like tracers.ts's pool -- never
  // let the mesh's own (wrong) bounding sphere cull the whole set.
  mesh.frustumCulled = false
  mesh.count = 0
  mesh.visible = false
  return mesh
}

/** What the in-flight bomb and rocket pools are drawing this frame, for the O1 Tier 2 diagnostic
 *  (`__ww2.ordnanceView`). */
export interface OrdnanceView {
  readonly bombs: number; readonly rockets: number
  readonly bombTriangles: number; readonly rocketTriangles: number
  /** NDC of the first live bomb's bounding-sphere center; null when none is drawn. */
  readonly bombNdc: readonly [number, number] | null
  /** That sphere's projected radius in pixels, for a viewport `heightPx` tall. */
  readonly bombRadiusPx: number | null
}

export type OrdnanceHandle = {
  readonly object: Object3D
  /** Positions every live bomb/rocket/flame instance from this frame's
   *  projectile list. */
  update(projectiles: readonly Projectile[]): void
  /** Swaps the bomb and rocket pools onto the generated store models (O1), disposing the
   *  primitive stand-in geometry/material they replace. */
  setStoreModels(bomb: StoreVisual, rocket: StoreVisual): void
  /** What the pools are drawing this frame, for the Tier 2 diagnostic (`__ww2.ordnanceView`). */
  view(camera: PerspectiveCamera, heightPx: number): OrdnanceView
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
  let swapped = false
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
  // Hoisted for view(), the same reasoning as the temporaries above.
  const probe = new Matrix4()
  const center = new Vector3()
  const eyeV = new Vector3()
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
    setStoreModels(bomb: StoreVisual, rocket: StoreVisual): void {
      // The pools' primitive geometry and material are this module's own; the store models'
      // are the model cache's, held for the page's life and never disposed here -- so a second
      // swap would dispose the cache's assets, and is refused.
      if (swapped) throw new Error('createOrdnance.setStoreModels: store models already set; a second swap would dispose the model cache\'s geometry and material')
      swapped = true
      for (const [mesh, v] of [[bombMesh, bomb], [rocketMesh, rocket]] as const) {
        mesh.geometry.dispose()
        ;(mesh.material as Material).dispose()
        mesh.geometry = v.geometry
        mesh.material = v.material
      }
      // The flame box was centered on the old centered primitive; the store model's origin is its
      // lug tops (hvar.ts), so move the flame (this module's own geometry, never the cache's) to
      // the model's aft end, on its axis. The fins are symmetric about the axis, so the bbox
      // center in y/z is the axis: for hvar.glb it is y = -0.0935, HVAR_AXIS_Y exactly
      // (measured from hvarMesh() 2026-09-26).
      // (computeBoundingBox only fills the geometry's derived bbox cache, as three does on its own.)
      if (rocket.geometry.boundingBox === null) rocket.geometry.computeBoundingBox()
      flameMesh.geometry.computeBoundingBox()
      const r = rocket.geometry.boundingBox!, f = flameMesh.geometry.boundingBox!
      flameMesh.geometry.translate(
        r.min.x - (f.max.x - f.min.x) / 2 - (f.min.x + f.max.x) / 2,
        (r.min.y + r.max.y) / 2 - (f.min.y + f.max.y) / 2,
        (r.min.z + r.max.z) / 2 - (f.min.z + f.max.z) / 2,
      )
    },
    view(camera: PerspectiveCamera, heightPx: number): OrdnanceView {
      const tris = (m: InstancedMesh): number => Math.floor((m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3)
      let bombNdc: [number, number] | null = null, bombRadiusPx: number | null = null
      if (bombMesh.count > 0) {
        const g = bombMesh.geometry
        if (g.boundingSphere === null) g.computeBoundingSphere()
        bombMesh.getMatrixAt(0, probe)
        center.copy(g.boundingSphere!.center).applyMatrix4(probe).applyMatrix4(bombMesh.matrixWorld)
        const dist = center.distanceTo(camera.getWorldPosition(eyeV))
        const ndc = center.clone().project(camera)
        bombNdc = [ndc.x, ndc.y]
        bombRadiusPx = (g.boundingSphere!.radius / (dist * Math.tan((camera.fov * Math.PI) / 360))) * (heightPx / 2)
      }
      return { bombs: bombMesh.count, rockets: rocketMesh.count, bombTriangles: tris(bombMesh), rocketTriangles: tris(rocketMesh), bombNdc, bombRadiusPx }
    },
  }
}
