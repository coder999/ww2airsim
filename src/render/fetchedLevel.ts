import type { AssetQualityTierName } from './quality.js'

// Split out of content.ts (2026-09-27) so a Node-side Tier 2 spec can import
// these: content.ts builds its URLs from `import.meta.env.BASE_URL` at module
// scope, which only Vite defines, so importing it from Playwright crashed
// strike.spec.ts on load. content.ts re-exports both, unchanged.

/**
 * The finest pyramid level a page load fetches, as a function of the
 * persisted Asset Quality tier (design spec
 * `docs/superpowers/specs/2026-09-24-render-quality-selector-design.md`
 * §10): `low` stops at L1 (49 m spacing, 33.6 MB) to hold that tier's
 * budget ceiling; `medium`/`high`/`ultra` all go to L0 (24 m spacing,
 * 134 MB) -- the whole committed pyramid, since nothing finer exists.
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
 * The Asset Quality tier every page load uses until a later task (Task 6,
 * `docs/superpowers/plans/2026-09-24-plan-ui-realism.md`) reads a real,
 * persisted choice into the boot sequence. `main.ts`'s `finestFetchedLevel`
 * and `terrain/mesh.ts`'s `finestLevel` parameter both trace back to this
 * one constant (`main.ts` is the only call site; `mesh.ts` takes the level
 * as a parameter rather than resolving its own, precisely so the two cannot
 * independently disagree -- Task 2 review, 2026-09-25).
 *
 * Every test that measures "ground truth" against what the app actually
 * flies over today imports THIS constant too, rather than hardcoding `'low'`
 * a second time -- so if a future change flips this single value, every one
 * of those tests moves with it instead of silently measuring a level the
 * app no longer uses.
 *
 * Deliberately `'low'`, not the design spec's eventual `'medium'`
 * first-visit default (`docs/superpowers/specs/2026-09-24-render-quality-
 * selector-design.md` §10 addendum): `createTerrainMesh` allocates one
 * `Float32Array(n^2)` per level from the floor upward, all at once, for the
 * life of the mesh -- an L0 floor is ~358 MB of textures per instance
 * (8193x8193's 268 MB alone) against ~90 MB starting from L1, and nothing
 * has added lazy/on-demand allocation to fix that yet. Measured 2026-09-24:
 * an L0 floor OOM'd a single vitest worker running ~15 `createTerrainMesh`
 * calls in one file ("JavaScript heap out of memory" at ~4.1 GB), and the
 * same allocation runs in a real browser tab the instant this flips to
 * `'medium'` -- a real memory ceiling, not a test-only inconvenience.
 * `'medium'` would also mean every real page load unconditionally fetches
 * the 134 MB `L0.bin`, with no Settings UI yet to opt out.
 */
export const INTERIM_ASSET_QUALITY_TIER: AssetQualityTierName = 'low'
