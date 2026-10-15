import { type Vec3 } from '../../sim/math/vec3.js'
import { LIGHT_CAPS, type LightRuntime } from '../../sim/lights/lights.js'

/**
 * Which lights get the expensive treatment (F6A plan §3.4, D1): at most
 * `LIGHT_CAPS.litSlots` lights illuminate ground, sea and airframes at once,
 * chosen by how much light each gives AT THE EYE (I / d^2, so for equal pots
 * it is the nearest, and a flare outranks a pot), with hysteresis so the set
 * does not flicker as the eye moves between two near-equal candidates.
 * Pure: no three, no DOM.
 */
export const HYSTERESIS_BONUS = 1.35
/** Lights beyond this never light anything (the shader's own radius is shorter). */
export const MAX_SELECT_RANGE_M = 30_000

const dist2 = (a: Vec3, b: Vec3): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2

export function selectLit(
  lights: readonly LightRuntime[], eye: Vec3, previous: ReadonlySet<string>, cap: number = LIGHT_CAPS.litSlots,
): readonly LightRuntime[] {
  const scored: { l: LightRuntime; score: number }[] = []
  for (const l of lights) {
    if (l.intensityCd <= 0 || l.kind === 'nav') continue // nav lights are sprites only: too faint to light anything
    const d2 = Math.max(dist2(l.positionM, eye), 1)
    if (d2 > MAX_SELECT_RANGE_M ** 2) continue
    scored.push({ l, score: (l.intensityCd / d2) * (previous.has(l.id) ? HYSTERESIS_BONUS : 1) })
  }
  scored.sort((a, b) => b.score - a.score || (a.l.id < b.l.id ? -1 : 1))
  return scored.slice(0, cap).map((s) => s.l)
}

/** Nav lights are drawn only for aircraft within this range (plan §3.4: 6 mi). */
export const NAV_RANGE_M = 9656
/**
 * The lights drawn as glow sprites: the nearest `glowSprites` non-nav lights and the nearest `navSprites`
 * nav lights within `NAV_RANGE_M`. The scenario loader already refuses a scenario over the authored
 * caps; this enforces the budget when nav lights multiply with the aircraft in the air.
 */
export function limitGlows(lights: readonly LightRuntime[], eye: Vec3): readonly LightRuntime[] {
  const lit = lights.filter((l) => l.intensityCd > 0)
  const nearest = (list: readonly LightRuntime[], n: number): LightRuntime[] =>
    [...list].sort((a, b) => dist2(a.positionM, eye) - dist2(b.positionM, eye) || (a.id < b.id ? -1 : 1)).slice(0, n)
  const nav = lit.filter((l) => l.kind === 'nav' && dist2(l.positionM, eye) <= NAV_RANGE_M ** 2)
  return [...nearest(lit.filter((l) => l.kind !== 'nav'), LIGHT_CAPS.glowSprites), ...nearest(nav, LIGHT_CAPS.navSprites)]
}
