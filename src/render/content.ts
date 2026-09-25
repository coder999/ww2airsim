import type { AssetQualityTierName } from './quality.js'

/**
 * Where a content record lives, relative to the site root: the path on disk
 * inside `dist/`, which is also the path under `content/` in the repository
 * (`copyContent()`, vite.config.ts, copies the tree wholesale).
 *
 * One function rather than a literal per file because `src/render/scenarioLoad.ts`
 * fetches these at runtime and `tests/build/dist.test.ts` asserts the build
 * puts them there. Those two claims are only worth anything if they cannot
 * drift apart, and before Ruling R20 they were separate strings in separate
 * files -- which is precisely how the gap R14 found (a build that exits 0 and
 * then 404s on its own content) survives a green suite.
 */
const contentPath = (dir: string, id: string): string => `content/${dir}/${id}.json`

/**
 * The same file, as the browser asks for it.
 *
 * Built from `import.meta.env.BASE_URL` rather than a bare leading slash: the
 * build assertion checks the file's location ON DISK, so a `base` set in
 * `vite.config.ts` would 404 the content in the browser while the test still
 * passed. That is the one direction these could still drift apart, which is
 * the drift this module exists to prevent (review 2026-09-13).
 */
const contentUrl = (dir: string, id: string): string => `${import.meta.env.BASE_URL}${contentPath(dir, id)}`

/** The one scenario that ships (Plan 12; `content/scenarios/free-flight.json`).
 *  A constant rather than a query parameter because there is no mission
 *  selector yet -- that is Plan 9's, and it will pass an id here. */
export const SCENARIO_ID = 'free-flight'

export const scenarioUrl = (id: string): string => contentUrl('scenarios', id)
export const aircraftUrl = (id: string): string => contentUrl('aircraft', id)
export const shipUrl = (id: string): string => contentUrl('ships', id)
export const airfieldUrl = (id: string): string => contentUrl('bases', id)

/** The Hellcat's record on disk, for `tests/build/dist.test.ts` alone -- the
 *  browser reaches it through `aircraftUrl` with the id the scenario names,
 *  never through this. Built from the same `contentPath` the URL is, so the
 *  build assertion and the runtime fetch cannot name different files.
 *
 *  Still `f6f-hellcat`, not `f4f-wildcat`, even after Task 6 made the
 *  Wildcat the default RENDERED mesh: every shipped scenario's aircraft
 *  entries still carry `"spec": "f6f-hellcat"` (the flight-model identity --
 *  `content/scenarios/*.json`, unchanged, out of this plan's scope), so
 *  `f6f-hellcat.json` remains the one real content record every scenario
 *  actually fetches. `content/aircraft/f4f-wildcat.json` (Task 3) exists as
 *  validated, licensed content for a future multi-aircraft roster, but no
 *  scenario references it yet, so pinning THIS constant to it would leave
 *  the file every real scenario fetches unpinned -- the exact gap this
 *  constant exists to prevent. See `WILDCAT_MODEL_PATH` below for the
 *  build-pinning of the Wildcat's actual boot-critical asset, the mesh. */
export const AIRCRAFT_CONTENT_PATH = contentPath('aircraft', 'f6f-hellcat')

/**
 * One pyramid level of the terrain heightfield, as a path and (below) as the
 * URL the browser fetches. Beside the aircraft pair above and for the same
 * reason -- `tests/build/dist.test.ts` asserts where the build puts content,
 * `src/render/terrain/load.ts` asks the network for it, and those two claims
 * are only worth something if they cannot drift apart.
 *
 * A function rather than a constant because the level number is the only
 * thing that varies; `tools/terrain/load.ts`'s `terrainLevelPath` is the
 * Node-side twin, with the same name for the same concept (the
 * `tools/content/load.ts` <-> `src/sim/content.ts` pattern).
 *
 * How many levels that is depends on which question is being asked, and the
 * two numbers are not the same. All THIRTEEN are committed -- L0 through
 * L12, the whole pyramid, since Task 2 (2026-09-24) moved
 * `tools/terrain/load.ts`'s `FIRST_COMMITTED_LEVEL` to 0 -- and the browser
 * asks for at most NINE of them: L8 down to whichever level
 * `finestFetchedLevelFor` returns for the persisted Asset Quality tier (L0
 * for `medium`/`high`/`ultra`, L1 for `low`), the only levels a LOD ring can
 * sample (`lod.ts`'s `coarsestFetchedLevel`, and
 * `src/render/terrain/load.ts`'s fetch loop). L9-L12 are 808 bytes in total
 * and no code path reads them; they are committed because they are the
 * pyramid, not because anything loads them.
 */
export function terrainLevelPath(level: number): string {
  return `content/terrain/L${level}.bin`
}

export function terrainLevelUrl(level: number): string {
  return `${import.meta.env.BASE_URL}${terrainLevelPath(level)}`
}

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

/** Same-origin bathymetry, in int16 metres; header is bundled with the code. */
export const OCEAN_DEPTH_URL = `${import.meta.env.BASE_URL}content/ocean/depth.bin`

/** Plan 13b's land-cover raster, gzipped on disk and inflated in the
 *  browser (src/render/landcover/load.ts). No nginx dependency. */
export const COVER_PATH = 'content/landcover/cover.bin.gz'
export const COVER_URL = `${import.meta.env.BASE_URL}${COVER_PATH}`

/** Mark's Firefly title art (2026-09-19), drawn by `src/render/titleScreen.ts`.
 *  Shipped byte-for-byte as supplied; `tests/build/dist.test.ts` pins the
 *  size, so a re-encode fails the build rather than silently replacing it. */
export const TITLE_ART_PATH = 'content/art/title.png'
export const TITLE_ART_URL = `${import.meta.env.BASE_URL}${TITLE_ART_PATH}`
export const TITLE_ART_BYTES = 2_077_706

/** The Wildcat glTF model (ASSETS.md), Task 5 -- a committed binary asset,
 *  not one of the `aircraftUrl`/`shipUrl`/`airfieldUrl` JSON records, so it
 *  gets its own named constant rather than (mis)using a JSON-suffixed
 *  helper. Same pattern as TITLE_ART_PATH/TITLE_ART_URL above. */
export const WILDCAT_MODEL_PATH = 'content/aircraft/wildcat.glb'
export const WILDCAT_MODEL_URL = `${import.meta.env.BASE_URL}${WILDCAT_MODEL_PATH}`

/** Plan 16a's cloud noise volumes, gzipped on disk, inflated in the browser
 *  (src/render/sky/load.ts) exactly as the land-cover raster is. */
export const SHAPE_NOISE_PATH = 'content/sky/shape.bin.gz'
export const DETAIL_NOISE_PATH = 'content/sky/detail.bin.gz'
export const CURL_NOISE_PATH = 'content/sky/curl.bin.gz'
export const SHAPE_NOISE_URL = `${import.meta.env.BASE_URL}${SHAPE_NOISE_PATH}`
export const DETAIL_NOISE_URL = `${import.meta.env.BASE_URL}${DETAIL_NOISE_PATH}`
export const CURL_NOISE_URL = `${import.meta.env.BASE_URL}${CURL_NOISE_PATH}`

/** Cloud Fidelity II §3.3's cumulus weather map (one Worley cell per
 *  cloud), shipped the same way as the shape/detail volumes above. It
 *  replaced Plan 16d's coverage-modulation field. */
export const WEATHER_MAP_PATH = 'content/sky/weather.bin.gz'
export const WEATHER_MAP_URL = `${import.meta.env.BASE_URL}${WEATHER_MAP_PATH}`
