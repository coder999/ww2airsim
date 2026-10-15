import { LIGHT_CAPS } from '../../sim/lights/lights.js'
import type { QualityTierName } from '../quality.js'

/**
 * Night-light quality (F6A Task 10): the caps of plan §3.4 are the High tier; Medium and Low fewer
 * lights that illuminate the world, fewer glow and nav sprites and fewer beams, and `off` draws no gameplay
 * light at all (no glow, no beam, no illumination: the shared node's loop runs zero times). Follows the
 * effects tier (`fx`), so one setting and the one auto-probe move it. Nothing here reads `timestamp-query`:
 * a GPU without it only loses the DEV frame-time samples, never a light.
 */
export type LightTier = { readonly litSlots: number; readonly glowSprites: number; readonly navSprites: number; readonly beams: number }
export const LIGHT_TIERS: Readonly<Record<QualityTierName | 'off', LightTier>> = {
  high: { litSlots: LIGHT_CAPS.litSlots, glowSprites: LIGHT_CAPS.glowSprites, navSprites: LIGHT_CAPS.navSprites, beams: LIGHT_CAPS.searchlights },
  medium: { litSlots: 4, glowSprites: 48, navSprites: 32, beams: 2 },
  low: { litSlots: 2, glowSprites: 24, navSprites: 16, beams: 1 },
  off: { litSlots: 0, glowSprites: 0, navSprites: 0, beams: 0 },
}
