import { Group, Mesh, MeshBasicMaterial, PlaneGeometry, type Object3D, type Quaternion } from 'three'
import type { CombatState } from '../../sim/weapons/combat.js'
import type { Vec3 } from '../../sim/math/vec3.js'
import { effectScaleAndOpacity } from './impactEffect.js'

/**
 * Hit feedback (Plan 6 design: "hit flashes ... read simulation state"). A
 * pooled set of camera-facing quads, the same expanding-and-fading quad
 * `impactEffect.ts` draws for a crash, at two sizes: a small bright flash
 * where a round struck, and a fireball where an airplane was destroyed.
 *
 * WHEN to flash is the pure half, `nextHitFlashes`: an edge on each target's
 * `lastHit.tick` and `damage.destroyedAt`, remembered per entity id, because
 * the record keeps those values every frame afterward and this runs sixty
 * times a second. The memory follows the audio reducer's restart rule: a tick
 * that moves backwards is a new flight, and the old flight's edges are
 * forgotten with it.
 */
export type HitFlashKind = 'hit' | 'kill'

export type FlashEvent = { readonly id: string; readonly kind: HitFlashKind; readonly position: Vec3 }

export type FlashMemory = {
  readonly lastTick: number
  readonly seenHitTick: Readonly<Record<string, number>>
  readonly seenKillTick: Readonly<Record<string, number>>
}

export const NO_FLASH_MEMORY: FlashMemory = { lastTick: 0, seenHitTick: {}, seenKillTick: {} }

export function nextHitFlashes(
  prev: FlashMemory,
  combat: CombatState,
  aircraft: readonly { readonly id: string; readonly state: { readonly position: Vec3 } }[],
  tick: number,
): { readonly memory: FlashMemory; readonly events: readonly FlashEvent[] } {
  const restarted = tick < prev.lastTick
  const seenHitTick: Record<string, number> = restarted ? {} : { ...prev.seenHitTick }
  const seenKillTick: Record<string, number> = restarted ? {} : { ...prev.seenKillTick }
  const events: FlashEvent[] = []
  for (const a of aircraft) {
    const rec = combat.aircraft[a.id]
    if (rec === undefined) continue
    if (rec.lastHit !== null && seenHitTick[a.id] !== rec.lastHit.tick) {
      seenHitTick[a.id] = rec.lastHit.tick
      events.push({ id: a.id, kind: 'hit', position: rec.lastHit.position })
    }
    const destroyedAt = rec.damage.destroyedAt
    if (destroyedAt !== null && seenKillTick[a.id] !== destroyedAt) {
      seenKillTick[a.id] = destroyedAt
      events.push({ id: a.id, kind: 'kill', position: a.state.position })
    }
  }
  return { memory: { lastTick: tick, seenHitTick, seenKillTick }, events }
}

/** How each kind looks. Estimates for legibility at 1440p, like the crash effect's. */
export function flashAppearance(kind: HitFlashKind): {
  readonly colorHex: number
  readonly maxRadiusM: number
  readonly lifetimeSeconds: number
} {
  return kind === 'kill'
    ? { colorHex: 0xff7a2f, maxRadiusM: 30, lifetimeSeconds: 1.6 }
    : { colorHex: 0xfff2a8, maxRadiusM: 2.5, lifetimeSeconds: 0.25 }
}

/** How many flashes can be alive at once; the oldest is reused past this. Six
 *  guns can land several rounds per tick on one target, but a target records
 *  one `lastHit` per tick, so this is per-target-per-tick, not per round. */
export const HIT_FLASH_CAPACITY = 24

export function createHitFlashes(capacity = HIT_FLASH_CAPACITY): {
  readonly object: Object3D
  fire(event: FlashEvent): void
  update(dtSeconds: number, facing: Quaternion): void
  hide(): void
} {
  const group = new Group()
  const geometry = new PlaneGeometry(2, 2)
  const slots = Array.from({ length: capacity }, () => {
    const material = new MeshBasicMaterial({ transparent: true, depthWrite: false })
    const mesh = new Mesh(geometry, material)
    mesh.visible = false
    group.add(mesh)
    return { mesh, material, age: 0, appearance: flashAppearance('hit') }
  })
  let next = 0
  return {
    object: group,
    fire(event: FlashEvent): void {
      // Round-robin: a free slot if there is one, else the one fired longest ago.
      let slot = slots.find((s) => !s.mesh.visible)
      if (slot === undefined) {
        slot = slots[next % capacity]!
        next += 1
      }
      slot.appearance = flashAppearance(event.kind)
      slot.material.color.setHex(slot.appearance.colorHex)
      slot.age = 0
      // Raw world metres, not `+ worldOffset`: `group` is a child of `scene`,
      // which already applies the camera-relative shift (impactEffect.ts).
      slot.mesh.position.set(event.position.x, event.position.y, event.position.z)
      slot.mesh.visible = true
    },
    update(dtSeconds: number, facing: Quaternion): void {
      for (const slot of slots) {
        if (!slot.mesh.visible) continue
        slot.age += dtSeconds
        const { radiusM, opacity } = effectScaleAndOpacity(slot.age, slot.appearance.lifetimeSeconds, slot.appearance.maxRadiusM)
        slot.mesh.scale.setScalar(radiusM)
        slot.material.opacity = opacity
        slot.mesh.quaternion.copy(facing)
        if (opacity <= 0) slot.mesh.visible = false
      }
    },
    hide(): void {
      for (const slot of slots) slot.mesh.visible = false
    },
  }
}
