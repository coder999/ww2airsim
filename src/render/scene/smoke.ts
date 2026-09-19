import { BoxGeometry, Group, Mesh, MeshBasicMaterial, type Object3D } from 'three'

/**
 * Damaged-engine smoke (Plan 6 design: "damaged-engine smoke read[s]
 * simulation state"). A short trail of dark translucent puffs, authored in
 * the airframe's body frame and added as a child of its root, so it rides the
 * airplane with no per-frame transform of its own: the engine is at the nose
 * (+X, hellcat.ts's spinner at 5.1 m) and the puffs trail aft and slightly
 * up. It says "this engine is hurt" and how badly; it is not a particle
 * system, and the Tier 2 screenshot is the only judge of whether it reads.
 */
export function smokeAppearance(engineHealth: number, destroyed: boolean): {
  readonly visible: boolean
  readonly opacity: number
  readonly scale: number
} {
  const health = engineHealth > 1 ? 1 : engineHealth < 0 ? 0 : engineHealth
  const damage = destroyed ? 1 : Number.isFinite(health) ? 1 - health : 0
  if (damage <= 0) return { visible: false, opacity: 0, scale: 0 }
  return { visible: true, opacity: 0.25 + 0.55 * damage, scale: 0.6 + 1.4 * damage }
}

const PUFFS = 6

export function createEngineSmoke(): { readonly object: Object3D; set(engineHealth: number, destroyed: boolean): void } {
  const group = new Group()
  group.visible = false
  const material = new MeshBasicMaterial({ color: 0x23262b, transparent: true, depthWrite: false, opacity: 0.5 })
  const puffs = Array.from({ length: PUFFS }, (_, i) => {
    const puff = new Mesh(new BoxGeometry(1, 1, 1), material)
    // From just behind the engine, aft and up, each puff larger than the last.
    puff.position.set(3.2 - i * 1.7, 0.7 + i * 0.35, 0)
    puff.userData.baseScale = 0.7 + i * 0.25
    group.add(puff)
    return puff
  })
  let shown: { opacity: number; scale: number; visible: boolean } | null = null
  return {
    object: group,
    set(engineHealth: number, destroyed: boolean): void {
      const a = smokeAppearance(engineHealth, destroyed)
      if (shown !== null && shown.visible === a.visible && shown.opacity === a.opacity && shown.scale === a.scale) return
      shown = a
      group.visible = a.visible
      material.opacity = a.opacity
      for (const puff of puffs) puff.scale.setScalar((puff.userData.baseScale as number) * a.scale)
    },
  }
}
