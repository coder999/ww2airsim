import type { AssetQualityTierName } from './quality.js'

// Split out of content.ts (2026-09-27) so a Node-side E2E spec can import
// these: content.ts builds its URLs from `import.meta.env.BASE_URL` at module
// scope, which only Vite defines, so importing it from Playwright crashed
// strike.spec.ts on load. content.ts re-exports both, unchanged.

/**
 * The finest pyramid level a page load fetches, as a function of the
 * persisted Asset Quality tier (design spec
 * `docs/superpowers/specs/2026-09-24-render-quality-selector-design.md`
 * §10): `low` stops at L1 (49 m spacing, 33.6 MB inflated, 9.5 MB gzipped) to
 * hold that tier's budget ceiling; `medium`/`high`/`ultra` all go to L0 (24 m
 * spacing, 134 MB inflated, 37 MB gzipped since L1.1a, 2026-10-10) -- the
 * whole committed pyramid, since nothing finer exists.
 *
 * Until 2026-09-24 (Task 2 of the same plan) this was a fixed constant, `2`:
 * L0-L1 were gitignored into `content/terrain/tiles/` and fetching them
 * 404'd for everyone but the machine that last ran `npm run terrain:build`.
 * That task committed both files (L0 via Git LFS, over GitHub's 100 MB
 * per-file limit) and moved `tools/terrain/load.ts`'s `FIRST_COMMITTED_LEVEL`
 * from 2 to 0, so every level down to L0 is now in every clone and the
 * only remaining question is how much of it *this* page load asks for.
 *
 * A second literal rather than an import of `FIRST_COMMITTED_LEVEL` because
 * `tools/` is Node-only (`node:fs`, `import.meta.url`) and must not be
 * reachable from a browser bundle; `tests/render/terrainLoad.test.ts`
 * asserts every level this function can return is actually committed on
 * disk, so the two cannot drift without the suite noticing.
 */
export function finestFetchedLevelFor(tier: AssetQualityTierName): number {
  return tier === 'low' ? 1 : 0
}

/**
 * The first-visit Asset Quality tier: what a page load uses when nothing is
 * persisted (`settings.ts`, `bootQuality.ts`). The name is historical; since
 * Task 6 (2026-09-24) it has been the first-visit default, not a placeholder.
 *
 * `'medium'` since L1.1 (2026-10-10), the render-quality-selector spec §10
 * default and Mark's 2026-09-27 ruling: full L0 terrain (80 ft posts). It was
 * `'low'` until then because the terrain mesh allocated every level whole, an
 * L0 floor costing 358 MB of height textures; L0 is now held as a window
 * around the camera (`terrain/mesh.ts`, `WINDOW_SAMPLES`). The cost a first
 * visit still pays is the 37 MB `L0.bin.gz` download, before the game can fly
 * (handoff `docs/handoff/2026-10-10-l1-1-terrain-on-demand.md`).
 *
 * Tests that measure "ground truth" do NOT follow this any more; they read
 * `GROUND_TRUTH_TIER`, below.
 */
export const INTERIM_ASSET_QUALITY_TIER: AssetQualityTierName = 'medium'

/**
 * The tier whose finest level the headless suite measures the world against
 * (landings, takeoff runs, missions, the soak, airfield and village
 * placement): Low, L1. It equalled the first-visit default until L1.1
 * (2026-10-10) and was split from it there, on purpose:
 *
 * - CI checks out without Git LFS (`ci.yml`), and L0 is LFS, so a suite on L0
 *   would skip nearly every terrain test in CI. L1 is a plain blob.
 * - About 25 files hold numbers calibrated on L1 (a landing snapshot, the
 *   Zero's Dulag takeoff run, mission outcomes). Moved to L0 on 2026-10-10,
 *   seven tests in six files failed on calibration, and the soak ran out of
 *   memory. Re-measuring them on L0 is an open item (L1.1 handoff).
 *
 * The consequence, stated: by default the game now flies over L0 while these
 * tests fly over L1 (worst |L0 - L1| 40.35 m, `terrainLod.test.ts`). The E2E
 * specs, which run in the browser, fly what the player does.
 */
export const GROUND_TRUTH_TIER: AssetQualityTierName = 'low'
