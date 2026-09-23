import {
  BoxGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PlaneGeometry, Quaternion, Scene, Vector3, type Object3D,
} from 'three'
import type { Projectile } from '../sim/weapons/combat.js'
import { length, normalize, sub, v3, type Vec3 } from '../sim/math/vec3.js'
import { quatFromXTo } from './scene/tracers.js'
import { effectScaleAndOpacity } from './scene/impactEffect.js'

/**
 * Ordnance in flight and its impacts (Plan 6b Task 8), read from
 * `World.combat.projectiles` the same way `tracers.ts` reads it for gun
 * rounds. Pool bounds, spec §4: 8 bombs, 32 rockets, 8 smoke columns --
 * generous multiples of what one strike flight carries (Task 6: 2 bombs and
 * 6 rockets per Hellcat).
 *
 * Reuses three existing pieces rather than inventing parallel ones:
 * - The bomb/rocket/flame pools are `InstancedMesh`, one per kind, built and
 *   updated with `tracers.ts`'s exact idiom (`quatFromXTo` for facing,
 *   `frustumCulled = false`, `count`/`visible` set from how many are alive
 *   this frame, one hoisted `Matrix4`/`Vector3`/`Quaternion` reused every
 *   instance rather than allocated per-frame).
 * - The impact pool (fireball + smoke column per slot) is round-robin
 *   allocated exactly like `hitFlash.ts`'s `createHitFlashes` (find a free
 *   slot, else recycle the one fired longest ago), and its fade curve is
 *   `impactEffect.ts`'s `effectScaleAndOpacity` -- the same curve
 *   `hitFlash.ts` already reuses for its own quads.
 */
export const BOMB_CAPACITY = 8
export const ROCKET_CAPACITY = 32
export const SMOKE_CAPACITY = 8

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

/** An impact's fireball+smoke lifetime, seconds (spec §4). */
export const IMPACT_LIFETIME_S = 20

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

/** How each impact kind looks -- `impactEffect.ts`'s `effectAppearance`'s twin
 *  for a bomb/rocket/structure hit rather than a crash. */
export type ImpactAppearance = { readonly colorHex: number; readonly maxRadiusM: number }
export function impactAppearance(kind: 'bomb' | 'rocket' | 'structure'): ImpactAppearance {
  switch (kind) {
    case 'bomb': return { colorHex: 0xff7a2f, maxRadiusM: 32 }
    case 'rocket': return { colorHex: 0xffa64f, maxRadiusM: 14 }
    case 'structure': return { colorHex: 0xffb060, maxRadiusM: 22 }
  }
}

/**
 * A rising column of translucent puffs, hidden until `start(lifetimeS)`,
 * then growing and fading over that lifetime via `effectScaleAndOpacity`
 * (the same curve `impactEffect.ts`'s crash splash and `hitFlash.ts`'s
 * flashes already use). Exported so both this module's own impact pool AND
 * `airfield.ts`'s collapsed buildings can spawn one, rather than each
 * building a second column implementation (Plan 6b Task 8's explicit
 * instruction).
 */
const SMOKE_PUFFS = 4
export function createSmokeColumn(): {
  readonly object: Object3D
  start(lifetimeS: number): void
  update(dtSeconds: number): void
} {
  const group = new Group()
  group.visible = false
  const material = new MeshBasicMaterial({ color: 0x2b2e33, transparent: true, depthWrite: false, opacity: 0 })
  const puffs = Array.from({ length: SMOKE_PUFFS }, (_, i) => {
    const puff = new Mesh(new BoxGeometry(1, 1, 1), material)
    puff.position.set(0, 2 + i * 3.2, 0)
    puff.userData.baseScale = 2.2 + i * 1.6
    group.add(puff)
    return puff
  })
  let age = 0
  let lifetimeS = 1
  return {
    object: group,
    start(life: number): void {
      lifetimeS = life
      age = 0
      group.visible = true
    },
    update(dtSeconds: number): void {
      if (!group.visible) return
      age += dtSeconds
      const { radiusM, opacity } = effectScaleAndOpacity(age, lifetimeS, 1)
      material.opacity = opacity * 0.6
      for (const puff of puffs) puff.scale.setScalar((puff.userData.baseScale as number) * (0.3 + radiusM))
      if (opacity <= 0) group.visible = false
    },
  }
}

/** One impact event: what detonated, and its last known position. */
export type OrdnanceImpactEvent = { readonly kind: 'bomb' | 'rocket'; readonly position: Vec3 }

export type OrdnanceMemory = {
  readonly lastTick: number
  readonly seen: ReadonlyMap<number, OrdnanceImpactEvent>
}
export const NO_ORDNANCE_MEMORY: OrdnanceMemory = { lastTick: 0, seen: new Map() }

/**
 * Which impacts to spawn this frame: `World.combat.projectiles` carries no
 * discrete "it just detonated" event (a round simply stops appearing in the
 * list, whether from a contact, an expired `lifeS`, or a water/ground hit --
 * `combat.ts`'s own comment: "land ... here: `groundHit` owns that
 * contact"), so this is an edge detector, `hitFlash.ts`'s `nextHitFlashes`
 * idiom exactly: remember every live bomb/rocket's last position, and when
 * one drops out of the live list, that is the impact, at the last position
 * seen. Reset by the tick moving backwards (a restart), same as
 * `nextHitFlashes` -- no exact contact point is exposed to the renderer, so
 * the last known position is the best available and is close enough for a
 * fireball's radius.
 */
export function nextOrdnanceImpacts(
  prev: OrdnanceMemory, projectiles: readonly Projectile[], tick: number,
): { readonly memory: OrdnanceMemory; readonly events: readonly OrdnanceImpactEvent[] } {
  const restarted = tick < prev.lastTick
  const seen = new Map<number, OrdnanceImpactEvent>()
  for (const p of projectiles) {
    if (p.kind === 'bomb' || p.kind === 'rocket') seen.set(p.id, { kind: p.kind, position: p.position })
  }
  const events: OrdnanceImpactEvent[] = []
  if (!restarted) {
    for (const [id, last] of prev.seen) if (!seen.has(id)) events.push(last)
  }
  return { memory: { lastTick: tick, seen }, events }
}

export type OrdnanceHandle = {
  readonly object: Object3D
  /** Positions every live bomb/rocket/flame instance from this frame's
   *  projectile list, and re-aims any live impact fireball's camera-facing
   *  quad at `eye` (a position, not the camera's own quaternion -- the fireballs
   *  are scattered over the battle area, unlike the single always-forward
   *  crash effect `impactEffect.ts` orients from the camera's quaternion directly). */
  update(projectiles: readonly Projectile[], eye: Vec3): void
  /** Ages the impact pool (fireball fade, smoke-column growth/fade) by one
   *  frame. Separate from `update` because every other timed effect in this
   *  renderer (`impactEffect.ts`, `hitFlash.ts`, `smoke.ts`) takes its own
   *  explicit `dtSeconds` rather than an internal clock, and `update`'s
   *  signature above is fixed by spec to `(projectiles, eye)` with no `dt`. */
  updateEffects(dtSeconds: number): void
  /** Fires one impact: a fireball plus a smoke column, round-robin allocated
   *  from the `SMOKE_CAPACITY` pool exactly as `hitFlash.ts` allocates its
   *  flashes. */
  spawnImpact(kind: 'bomb' | 'rocket' | 'structure', position: Vec3): void
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

  // The impact pool: a camera-facing quad (face normal along +x, so
  // `quatFromXTo` -- authored for aiming a tracer's +x down its direction of
  // travel -- aims this quad's face at the eye instead) plus a smoke column,
  // one pair per slot, round-robin allocated like `hitFlash.ts`.
  const impactGeometry = new PlaneGeometry(2, 2).rotateY(Math.PI / 2)
  const slots = Array.from({ length: SMOKE_CAPACITY }, () => {
    const material = new MeshBasicMaterial({ transparent: true, depthWrite: false })
    const fireball = new Mesh(impactGeometry, material)
    fireball.visible = false
    root.add(fireball)
    const smoke = createSmokeColumn()
    root.add(smoke.object)
    return { fireball, material, smoke, age: 0, appearance: impactAppearance('bomb') }
  })
  let next = 0

  return {
    object: root,
    update(projectiles: readonly Projectile[], eye: Vec3): void {
      apply(bombMesh, ordnanceInstances(projectiles, 'bomb', BOMB_CAPACITY))
      apply(rocketMesh, ordnanceInstances(projectiles, 'rocket', ROCKET_CAPACITY))
      apply(flameMesh, flameInstances(projectiles, ROCKET_CAPACITY))
      for (const slot of slots) {
        if (!slot.fireball.visible) continue
        const pos = v3(slot.fireball.position.x, slot.fireball.position.y, slot.fireball.position.z)
        const toEye = sub(eye, pos)
        if (length(toEye) < 1e-6) continue
        const q = quatFromXTo(normalize(toEye))
        slot.fireball.quaternion.set(q.x, q.y, q.z, q.w)
      }
    },
    updateEffects(dtSeconds: number): void {
      for (const slot of slots) {
        if (slot.fireball.visible) {
          slot.age += dtSeconds
          const { radiusM, opacity } = effectScaleAndOpacity(slot.age, IMPACT_LIFETIME_S, slot.appearance.maxRadiusM)
          slot.fireball.scale.setScalar(radiusM)
          slot.material.opacity = opacity
          if (opacity <= 0) slot.fireball.visible = false
        }
        slot.smoke.update(dtSeconds)
      }
    },
    spawnImpact(kind: 'bomb' | 'rocket' | 'structure', position: Vec3): void {
      // Round-robin: a free slot if there is one, else the one fired longest ago.
      let slot = slots.find((s) => !s.fireball.visible)
      if (slot === undefined) {
        slot = slots[next % SMOKE_CAPACITY]!
        next += 1
      }
      slot.appearance = impactAppearance(kind)
      slot.material.color.setHex(slot.appearance.colorHex)
      slot.age = 0
      slot.fireball.position.set(position.x, position.y, position.z)
      slot.fireball.scale.setScalar(slot.appearance.maxRadiusM * 0.08)
      slot.fireball.visible = true
      slot.smoke.object.position.set(position.x, position.y + 1, position.z)
      slot.smoke.start(IMPACT_LIFETIME_S)
    },
  }
}
