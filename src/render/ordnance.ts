import {
  BoxGeometry, type BufferGeometry, CylinderGeometry, Group, InstancedMesh, type Material, Matrix4,
  MeshStandardMaterial, type PerspectiveCamera, Quaternion, Scene, Vector3, type Object3D,
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
 * bomb and rocket pools are `InstancedMesh`, one per kind, built and
 * updated with `tracers.ts`'s exact idiom (`quatFromXTo` for facing,
 * `frustumCulled = false`, `count`/`visible` set from how many are alive
 * this frame, one hoisted `Matrix4`/`Vector3`/`Quaternion` reused every
 * instance rather than allocated per-frame).
 *
 * Impacts are drawn by src/render/fx (E1): the sim reports them
 * (World.combat.impacts). The rocket motor flame is src/render/fx's
 * `rocket.motor` (plan E2 Ruling R8).
 *
 * Bombs and rockets draw the O1 store models once `setStoreModels` is called; the primitive
 * box and cylinder are the stand-ins until then. Before O1 the bomb box was long along Z while
 * facing aimed +X, so it flew broadside.
 */
export const BOMB_CAPACITY = 8
export const ROCKET_CAPACITY = 32
/** D1: torpedoes falling and running. A strike flight carries one per airplane. */
export const TORPEDO_CAPACITY = 8

/** The pure half: which live projectiles of `kind` to draw, where, and
 *  facing which way -- `tracerInstances`'s twin for a rigid body rather than
 *  a streak (no length to compute; the geometry is already the right size). */
export type OrdnanceInstance = { readonly position: Vec3; readonly attitude: ReturnType<typeof quatFromXTo> }

function directionOf(p: Projectile): Vec3 {
  const speed = length(p.velocity)
  return speed > 1e-9 ? { x: p.velocity.x / speed, y: p.velocity.y / speed, z: p.velocity.z / speed } : v3(1, 0, 0)
}

export function ordnanceInstances(
  projectiles: readonly Projectile[], kind: 'bomb' | 'rocket' | 'torpedo', capacity: number,
): OrdnanceInstance[] {
  const out: OrdnanceInstance[] = []
  for (const p of projectiles) {
    if (p.kind !== kind) continue
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

/** What the in-flight bomb and rocket pools are drawing this frame, for the O1 E2E diagnostic
 *  (`__ww2.ordnanceView`). */
export interface OrdnanceView {
  readonly bombs: number; readonly rockets: number; readonly torpedoes: number
  readonly bombTriangles: number; readonly rocketTriangles: number
  /** NDC of the first live bomb's bounding-sphere center; null when none is drawn. */
  readonly bombNdc: readonly [number, number] | null
  /** That sphere's projected radius in pixels, for a viewport `heightPx` tall. */
  readonly bombRadiusPx: number | null
}

export type OrdnanceHandle = {
  readonly object: Object3D
  /** Positions every live bomb and rocket instance from this frame's
   *  projectile list. */
  update(projectiles: readonly Projectile[]): void
  /** Swaps the bomb and rocket pools onto the generated store models (O1), disposing the
   *  primitive stand-in geometry/material they replace. */
  setStoreModels(bomb: StoreVisual, rocket: StoreVisual): void
  /** The torpedo pool's model (D1): the player's torpedo store, swapped in once like the others. */
  setTorpedoModel(torpedo: StoreVisual): void
  /** What the pools are drawing this frame, for the E2E diagnostic (`__ww2.ordnanceView`). */
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
  const torpedoGeometry = new CylinderGeometry(0.25, 0.25, 4.5, 10)
  torpedoGeometry.rotateZ(Math.PI / 2)
  const torpedoMesh = makePool(torpedoGeometry, new MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.6 }), TORPEDO_CAPACITY)
  root.add(torpedoMesh)
  let swapped = false, torpedoSwapped = false

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
      apply(torpedoMesh, ordnanceInstances(projectiles, 'torpedo', TORPEDO_CAPACITY))
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
    },
    setTorpedoModel(torpedo: StoreVisual): void {
      if (torpedoSwapped) throw new Error('createOrdnance.setTorpedoModel: already set; a second swap would dispose the model cache\'s geometry and material')
      torpedoSwapped = true
      torpedoMesh.geometry.dispose()
      ;(torpedoMesh.material as Material).dispose()
      torpedoMesh.geometry = torpedo.geometry
      torpedoMesh.material = torpedo.material
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
      return { bombs: bombMesh.count, rockets: rocketMesh.count, torpedoes: torpedoMesh.count, bombTriangles: tris(bombMesh), rocketTriangles: tris(rocketMesh), bombNdc, bombRadiusPx }
    },
  }
}
