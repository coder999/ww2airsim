import { ZERO, type Vec3 } from '../../sim/math/vec3.js'
import type { FxSustained } from './events.js'

/** Renderer-time aftermath for a fatal solid-surface crash. These intentionally
 * outlive the short impact blast: five minutes burning, then five minutes of
 * smoke while the wreck cools. */
export const WRECK_FIRE_S = 5 * 60
export const WRECK_SMOKE_ONLY_S = 5 * 60
export const WRECK_AFTERMATH_S = WRECK_FIRE_S + WRECK_SMOKE_ONLY_S

export type WreckAftermathPhase = 'fire' | 'smoke' | 'out'

export function wreckAftermathPhase(ageS: number): WreckAftermathPhase {
  const age = Number.isFinite(ageS) ? Math.max(0, ageS) : 0
  if (age < WRECK_FIRE_S) return 'fire'
  if (age < WRECK_AFTERMATH_S) return 'smoke'
  return 'out'
}

/** The source is the rendered fuselage position, not the immutable impact
 * point. FxSystem interpolates a sustained source between frames, so the
 * plume follows a sliding/bouncing wreck without particle teleporting. */
export function wreckAftermathEmitter(id: string, ageS: number, position: Vec3, extinguished = false): FxSustained | null {
  if (extinguished) return null
  const phase = wreckAftermathPhase(ageS)
  if (phase === 'out') return null
  return {
    key: `wreck:${id}`,
    recipe: phase === 'fire' ? 'aircraft.fire' : 'wreck.smoke',
    intensity: 1,
    position,
    velocity: ZERO,
  }
}
