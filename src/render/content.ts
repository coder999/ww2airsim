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
 *  build assertion and the runtime fetch cannot name different files. */
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
 * two numbers are not the same. NINE are committed -- L4 through L12, the
 * pyramid from `tools/terrain/load.ts`'s FIRST_COMMITTED_LEVEL to its 3x3 top
 * -- and the browser asks for FIVE of them: L8 down to L4, the only levels a
 * LOD ring can sample (`lod.ts`'s `coarsestFetchedLevel`, and
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
 * The finest pyramid level the browser asks for: the finest one a clone
 * actually has.
 *
 * Levels 0-1 are 168 MB and are gitignored into `content/terrain/tiles/`
 * (`tools/terrain/load.ts`'s `FIRST_COMMITTED_LEVEL`, which states the size
 * budget behind the split), so fetching them 404s for everyone but the
 * machine that last ran `npm run terrain:build` -- and L0 alone is 134 MB,
 * which is the first row of the terrain design's own risk table. This is a
 * second literal rather than an import because `tools/` is Node-only
 * (`node:fs`, `import.meta.url`) and must not be reachable from a browser
 * bundle; `tests/render/terrainLoad.test.ts` asserts the level it names is
 * committed and that the next finer one is not, so the two cannot drift
 * without the suite noticing.
 */
export const FINEST_FETCHED_LEVEL = 2

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
