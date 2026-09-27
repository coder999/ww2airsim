import type { QualityTierName } from '../quality.js'

/** Effects quality (ordnance-and-effects design §4.4), verbatim. */
export type FxTier = { readonly capacity: number; readonly resolutionScale: 0.5 | 0.25; readonly frameBlend: boolean; readonly topMip: boolean }
export const FX_TIERS: Readonly<Record<QualityTierName, FxTier>> = {
  high: { capacity: 4096, resolutionScale: 0.5, frameBlend: true, topMip: true },
  medium: { capacity: 2048, resolutionScale: 0.5, frameBlend: true, topMip: true },
  low: { capacity: 1024, resolutionScale: 0.25, frameBlend: false, topMip: false },
}
/** Instance buffers are allocated once at this size, so a tier change never reallocates GPU memory. */
export const FX_MAX_CAPACITY = 4096
