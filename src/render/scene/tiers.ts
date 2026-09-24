/** Furthest a tree is ever drawn, metres from the eye: the high tier's
 *  dissolve end. Lives here rather than in vegetation.ts so the tier table
 *  does not import the module that imports it. */
export const TREE_FADE_END_M = 1850

/**
 * What the scenery gives up on each quality tier. The three tier tables
 * (here, `OCEAN_TIERS`, `CLOUD_TIERS`) share one set of names, `'high' |
 * 'medium' | 'low'`, which is `quality.ts`'s `QualityTierName`.
 *
 * They no longer share one VALUE. Until 2026-09-24 this comment said the app
 * had exactly one quality signal -- the GPU probe's one-time downgrade -- and
 * that a separately chosen scenery tier "would only disagree with it". The
 * Settings dialog's Advanced disclosure (render-quality-selector spec §4) now
 * lets a player set the three independently on purpose, and `main.ts` keeps a
 * `sceneryTier` of its own for this table. The one case that still moves them
 * together is the DEV `?oceanTier=` override, which drives scenery too so the
 * URL keeps meaning what every recorded frame-time measurement assumed it
 * meant (`main.ts`'s `forcedSceneryTier`).
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
