import { Mesh, MeshBasicMaterial, PlaneGeometry, type Object3D } from 'three'
import type { ContactSurface } from '../../sim/contact.js'

/** How each surface's effect looks. Provisional -- whether these read as a
 *  splash and an explosion is a Tier 3 question (spec §10, open question 1). */
export function effectAppearance(surface: ContactSurface): {
  readonly colorHex: number
  readonly maxRadiusM: number
  readonly lifetimeSeconds: number
} {
  return surface === 'water'
    ? { colorHex: 0xe8f4ff, maxRadiusM: 26, lifetimeSeconds: 1.8 }
    : { colorHex: 0xff7a2f, maxRadiusM: 34, lifetimeSeconds: 1.4 }
}

/**
 * The effect's size and opacity at a given age, seconds.
 *
 * Clamped at both ends. The renderer keeps drawing the scene behind the
 * debrief for as long as the pilot leaves it up, so this is called with ages
 * far past `lifetimeSeconds` and must settle rather than expand forever.
 */
export function effectScaleAndOpacity(
  age: number,
  lifetimeSeconds: number,
  maxRadiusM: number,
): { readonly radiusM: number; readonly opacity: number } {
  const t = age <= 0 ? 0 : age >= lifetimeSeconds ? 1 : age / lifetimeSeconds
  // Fast at first, then settling: the visible part of both a splash and a
  // fireball happens in the first third of its life.
  const grown = Math.sqrt(t)
  return {
    radiusM: Math.max(maxRadiusM * 0.08, maxRadiusM * grown),
    opacity: 1 - t,
  }
}

/**
 * A camera-facing quad that expands and fades once, where the airplane hit.
 *
 * `MeshBasicMaterial` rather than a node material: `panel.ts` already uses it
 * with `transparent: true` in this renderer, so this needs no new material
 * path. The caller positions `object` and keeps it facing the camera.
 */
export function createImpactEffect(): {
  readonly object: Object3D
  fire(surface: ContactSurface): void
  update(dtSeconds: number): void
} {
  const material = new MeshBasicMaterial({ transparent: true, depthWrite: false })
  const mesh = new Mesh(new PlaneGeometry(2, 2), material)
  mesh.visible = false

  let age = 0
  let appearance = effectAppearance('water')

  return {
    object: mesh,
    fire(surface: ContactSurface): void {
      appearance = effectAppearance(surface)
      material.color.setHex(appearance.colorHex)
      age = 0
      mesh.visible = true
    },
    update(dtSeconds: number): void {
      if (!mesh.visible) return
      age += dtSeconds
      const { radiusM, opacity } = effectScaleAndOpacity(
        age,
        appearance.lifetimeSeconds,
        appearance.maxRadiusM,
      )
      mesh.scale.setScalar(radiusM)
      material.opacity = opacity
      if (opacity <= 0) mesh.visible = false
    },
  }
}
