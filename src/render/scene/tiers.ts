/** Furthest a tree is ever drawn, metres from the eye: the high tier's
 *  dissolve end. Lives here rather than in vegetation.ts so the tier table
 *  does not import the module that imports it. */
export const TREE_FADE_END_M = 1850

/**
 * What the scenery gives up on each quality tier. Keyed by the ocean tier's
 * name because the app has exactly one quality signal -- the one-time
 * downgrade `adaptOceanQuality` makes in main.ts from measured GPU time --
 * and a second, independently chosen tier would only disagree with it.
 *
 * The trees are the scenery's one GPU-scalable cost: 1.1 ms of a 4.9 ms
 * frame at 1440p on the reference desktop (2026-09-17, serialized
 * timestamps; the materials and river mask together are 0.65 ms and are not
 * worth a tier). A tier shortens the dissolve distance, and with it the disc
 * of resident cells (`residentCellOffsets`), rather than thinning the
 * forest: a forest that ends sooner reads as haze, a forest with gaps reads
 * as a bug. Zero means no trees at all.
 */
export const SCENERY_TIERS = {
  high: { treeFadeEndM: TREE_FADE_END_M },
  medium: { treeFadeEndM: 1200 },
  low: { treeFadeEndM: 0 },
} as const
export type SceneryTierName = keyof typeof SCENERY_TIERS
